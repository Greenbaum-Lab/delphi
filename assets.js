import { hashKey, cacheString, getCachedString } from '/apc/cache.js';
import { getIDBObject, queryIDBRange, listIDBTable, deleteIDBObject } from '/apc/cache.js';
import { getOptions } from '/apc/common.js';

export const CONFIG = {
	S3_BASE_URL: '/data',
	LAMBDA_ENDPOINT: 'https://d.modelrxiv.org/adna/browser',
	LAMBDA_BATCH_DELAY_MS: 75,
	BED: 'poseidon/Poseidon_AADR_v62/Poseidon_AADR_v62',
	INDEX_PATH: 'index.json',
	LAMBDA_BUFFER_BASES: 1000000,
	MIN_FETCH_WINDOWS: 20,
	// Directory of pregenerated tracks per mode. The mode selects the genotype
	// source, so every population of a view is measured on the same panel.
	SOURCE_DIRECTORIES: { gnomad: 'gnomad', adna: 'AADR' },
	IDB_NAME: 'delphi',
	IDB_LAMBDA_TABLE: 'lambda_cache',
	IDB_GNOMAD_TABLE: 'gnomad_cache',
	IDB_POPULATIONS_TABLE: 'populations',
	IDB_ANNOTATIONS_TABLE: 'annotations',
	GNOMAD_STAT_COLUMNS: ['heterozygosity', 'tajimasd', 'fulif', 'ac', 'an', 'het_obs'],
};

// Lambda cache keys are ['pop', population, chr, window_size, bin_start, bin_end].
// The window size sits ahead of the bin bounds so that a range query over a region
// returns bins of one size only.
const BIN_START_INDEX = 4;

const MEASURE_INDEX = {
	'heterozygosity': 0,
	'tajimasd': 1,
	'fulif': 2
};

let metadataCache = null;
const annotationCaches = new Map();
const geneNameMaps = new Map();

const lambdaBatchQueue = [];
const precomputedMemoryCache = new Map();
const inflightLambdaFetches = new Map();
let lambdaBatchTimer = null;

const initializeAnnotationsTable = async () => {
	const existing = await listIDBTable(CONFIG.IDB_NAME, CONFIG.IDB_ANNOTATIONS_TABLE);
	
	if (existing.length === 0) {
		const index_url = `${CONFIG.S3_BASE_URL}/${CONFIG.INDEX_PATH}`;
		const response = await fetch(index_url);
		
		if (!response.ok) {
			throw new Error(`Failed to fetch index: ${response.status} ${response.statusText}`);
		}

		const index = await response.json();
		
		for (const [key, value] of Object.entries(index)) {
			await getIDBObject(CONFIG.IDB_NAME, CONFIG.IDB_ANNOTATIONS_TABLE, key, {
				label: key,
				source: value.source,
				type: value.type,
				user: false
			});
		}
	}
};

export const clearStaleLambdaCache = async () => {
	// Lambda cache keys gained the window size, so entries written before that are
	// indistinguishable from 10 kb bins under a range query. They carry one key
	// element fewer, which is enough to recognise and drop them.
	const keys = await listIDBTable(CONFIG.IDB_NAME, CONFIG.IDB_LAMBDA_TABLE);
	const stale_keys = keys.filter(key => key.length < BIN_START_INDEX + 2);
	if (stale_keys.length === 0)
		return 0;
	console.log(`[cache] dropping ${stale_keys.length} lambda_cache entries written before window sizes were keyed`);
	await Promise.all(stale_keys.map(key => deleteIDBObject(CONFIG.IDB_NAME, CONFIG.IDB_LAMBDA_TABLE, key)));
	return stale_keys.length;
};

export const getAnnotationEntry = async (track_id) => {
	await initializeAnnotationsTable();
	return await getIDBObject(CONFIG.IDB_NAME, CONFIG.IDB_ANNOTATIONS_TABLE, track_id);
};

export const listAnnotations = async () => {
	await initializeAnnotationsTable();
	return await listIDBTable(CONFIG.IDB_NAME, CONFIG.IDB_ANNOTATIONS_TABLE);
};
	
export const registerAnnotation = async (annotation_entry) => {
	await initializeAnnotationsTable();
	return await getIDBObject(CONFIG.IDB_NAME, CONFIG.IDB_ANNOTATIONS_TABLE, annotation_entry.label, annotation_entry);
};

export const removeAnnotationEntry = async (label) => {
	await initializeAnnotationsTable();
	return await deleteIDBObject(CONFIG.IDB_NAME, CONFIG.IDB_ANNOTATIONS_TABLE, label);
};

export const loadMeta = async () => {
	if (metadataCache) return;
	const metadata_url = `${CONFIG.S3_BASE_URL}/Poseidon_AADR_v62_metadata.json`;
	const response = await fetch(metadata_url);
	if (!response.ok) {
		throw new Error(`Failed to fetch metadata: ${response.status}`);
	}
	metadataCache = await response.json();
};

export const getMetadata = async () => {
	await loadMeta();
	return metadataCache;
};

export const getPopulationSamples = async (population_name) => {
	const pop_data = await getIDBObject(CONFIG.IDB_NAME, CONFIG.IDB_POPULATIONS_TABLE, population_name);
	return pop_data.subset;
};

const calculateBins = (start, end, window_size) => {
	const bin_start = Math.floor(start / window_size) * window_size;
	const bin_end = Math.ceil(end / window_size) * window_size;
	const bins = [];
	for (let pos = bin_start; pos < bin_end; pos += window_size) {
		bins.push({
			start: pos,
			end: pos + window_size
		});
	}
	return bins;
};

const parseNumpyFloat32 = (array_buffer) => {
	const header_length_view = new DataView(array_buffer, 8, 2);
	const header_length = header_length_view.getUint16(0, true);
	const header_bytes = new Uint8Array(array_buffer, 10, header_length);
	const header_string = new TextDecoder().decode(header_bytes);
	const shape_match = header_string.match(/'shape':\s*\((\d+),\s*(\d+)\)/);
	if (!shape_match) {
		throw new Error('Could not parse numpy array shape');
	}
	const num_rows = parseInt(shape_match[1], 10);
	const num_cols = parseInt(shape_match[2], 10);
	const data_offset = 10 + header_length;
	const data_length = num_rows * num_cols * 4;
	const aligned_buffer = new ArrayBuffer(data_length);
	const aligned_view = new Uint8Array(aligned_buffer);
	const source_view = new Uint8Array(array_buffer, data_offset, data_length);
	aligned_view.set(source_view);
	const float_data = new Float32Array(aligned_buffer);
	const result = [];
	for (let row = 0; row < num_rows; row++) {
		const row_data = {};
		for (let col = 0; col < num_cols; col++) {
			row_data[CONFIG.GNOMAD_STAT_COLUMNS[col]] = float_data[row * num_cols + col];
		}
		result.push(row_data);
	}
	return result;
};

const findMissingBins = (required_bins, cached_bins) => {
	const cached_starts = new Set(cached_bins.map(b => b.key[BIN_START_INDEX]));
	return required_bins.filter(bin => !cached_starts.has(bin.start));
};

const getPrecomputedChromosome = (source, population, chr, window_size) => {
	const cache_key = `${source}_${population}_${chr}_${window_size}`;
	if (precomputedMemoryCache.has(cache_key)) {
		return precomputedMemoryCache.get(cache_key);
	}
	const load_promise = (async () => {
		const idb_key = [source, population, chr, window_size];
		const cached = await getIDBObject(CONFIG.IDB_NAME, CONFIG.IDB_GNOMAD_TABLE, idb_key);
		if (cached && Array.isArray(cached)) {
			return cached;
		}
		const url = `${CONFIG.S3_BASE_URL}/${source}/${window_size}/${population}_${chr}.npy`;
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Failed to fetch ${source} data: ${response.status}`);
		}
		const array_buffer = await response.arrayBuffer();
		const parsed_data = parseNumpyFloat32(array_buffer);
		await getIDBObject(CONFIG.IDB_NAME, CONFIG.IDB_GNOMAD_TABLE, idb_key, parsed_data);
		return parsed_data;
	})();
	// Caching the in-flight load, as loadAnnotationData does, so tracks sharing a
	// population download the file once. Dropped on failure so a later track retries
	// rather than inheriting the error.
	precomputedMemoryCache.set(cache_key, load_promise);
	load_promise.catch(() => precomputedMemoryCache.delete(cache_key));
	return load_promise;
};

const getPrecomputedTrack = async ({ source, chr, start, end, population, window_size, measure }) => {
	const full_data = await getPrecomputedChromosome(source, population, chr, window_size);
	const start_index = Math.floor(start / window_size);
	const end_index = Math.ceil(end / window_size);
	const sliced_data = full_data.slice(start_index, end_index);
	// A dense float32 table can only mark a missing window with NaN, so it is
	// normalised to null here and nothing downstream of assets sees a NaN. The
	// Lambda path already returns null for the same thing.
	const measured = value => (value === undefined || isNaN(value)) ? null : value;
	let measure_data;
	if (measure === 'raw') {
		measure_data = sliced_data.map(row => [measured(row.ac), measured(row.an), measured(row.het_obs)]);
	} else {
		measure_data = sliced_data.map(row => measured(row[measure]));
	}
	return {
		data: measure_data,
		window_size: window_size,
		start: Math.floor(start / window_size) * window_size,
		end: Math.ceil(end / window_size) * window_size
	};
};

const parseJSONL = (text) => {
	const lines = text.trim().split('\n');
	const genes = [];
	const name_map = new Map();

	for (const line of lines) {
		if (!line.trim()) continue;
		const gene = JSON.parse(line);
		const gene_entry = {
			chr: gene.chr,
			gene: gene.name,
			coordinates: { start: gene.start, end: gene.end },
			strand: gene.strand,
			exons: gene.exons || [],
			introns: gene.introns || []
		};
		genes.push(gene_entry);
		name_map.set(gene.name, { chr: gene.chr, start: gene.start });
	}

	return { genes, name_map };
};

const fetchJSONL = async (source) => {
	const url = `${CONFIG.S3_BASE_URL}/${source}`;
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`JSONL fetch failed: ${response.status}`);
	}
	return await response.text();
};

const fetchFromLambda = async (chr, start, end, measure, population_samples, window_size) => {
	const subsets = population_samples.map(pop_data => ({
		label: pop_data.label,
		samples: pop_data.samples
	}));

	const request_body = {
		bed_files: [CONFIG.BED],
		subsets,
		params: {
			type: measure,
			variants: [{
				type: 'region',
				chr: chr.replace('chr', ''),
				start,
				end
			}],
			window_size: window_size
		}
	};

	const response = await fetch(CONFIG.LAMBDA_ENDPOINT, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(request_body)
	});

	if (!response.ok) {
		throw new Error(`Lambda request failed: ${response.status} ${response.statusText}`);
	}

	return await response.json();
};

const processBatch = async () => {
	if (lambdaBatchQueue.length === 0) return;
	const batch = lambdaBatchQueue.splice(0);
	lambdaBatchTimer = null;
	if (batch.length === 0) return;
	const { chr, measure, window_size } = batch[0];
	const union_start = Math.min(...batch.map(request => request.start));
	const union_end = Math.max(...batch.map(request => request.end));
	const all_populations = {};
	for (const request of batch) {
		Object.assign(all_populations, request.populations);
	}
	try {
		const population_samples = Object.entries(all_populations).map(([label, samples]) => ({
			label,
			samples
		}));
		const tracks = await fetchFromLambda(chr, union_start, union_end, measure, population_samples, window_size);
		const bins = calculateBins(union_start, union_end, window_size);
		const store_promises = [];
		for (const track of tracks) {
			const population_label = track.population;
			const track_data = track.data;
			for (let i = 0; i < bins.length && i < track_data.length; i++) {
				const bin = bins[i];
				const key = ['pop', population_label, chr, window_size, bin.start, bin.end];
				store_promises.push(
					getIDBObject(CONFIG.IDB_NAME, CONFIG.IDB_LAMBDA_TABLE, key, track_data[i])
				);
			}
		}
		await Promise.all(store_promises);
		for (const request of batch) {
			request.resolve();
		}
	} catch (error) {
		batch.forEach(req => req.reject(error));
	}
};

const queueLambdaRequest = (chr, start, end, measure, populations, window_size) => {
	return new Promise((resolve, reject) => {
		// One invocation carries a single window size, so a size change flushes the
		// pending batch the same way a chromosome change does.
		const can_batch = lambdaBatchQueue.length === 0 || (lambdaBatchQueue[0].chr === chr && lambdaBatchQueue[0].window_size === window_size);

		if (!can_batch) {
			clearTimeout(lambdaBatchTimer);
			processBatch();
		}

		lambdaBatchQueue.push({
			chr, start, end, measure: 'pop', populations, window_size,
			requested_measure: measure,
			resolve,
			reject
		});

		clearTimeout(lambdaBatchTimer);
		lambdaBatchTimer = setTimeout(processBatch, CONFIG.LAMBDA_BATCH_DELAY_MS);
	});
};

const buildChromosomeCache = (genes) => {
	const chr_cache = {};
	for (const gene of genes) {
		if (!chr_cache[gene.chr]) {
			chr_cache[gene.chr] = [];
		}
		chr_cache[gene.chr].push(gene);
	}
	return chr_cache;
};

const loadAnnotationData = (track_id) => {
	if (annotationCaches.has(track_id)) {
		return annotationCaches.get(track_id);
	}

	const load_promise = (async () => {
		const track_meta = await getAnnotationEntry(track_id);

		if (!track_meta) {
			throw new Error(`Unknown track_id: ${track_id}`);
		}

		if (track_meta.type !== 'jsonl') {
			throw new Error(`Unsupported track type: ${track_meta.type} for track ${track_id}`);
		}

		const text = await fetchJSONL(track_meta.source);
		const { genes, name_map } = parseJSONL(text);

		geneNameMaps.set(track_id, name_map);

		return {
			track_id,
			by_chr: buildChromosomeCache(genes)
		};
	})();

	annotationCaches.set(track_id, load_promise);
	load_promise.catch(() => annotationCaches.delete(track_id));
	return load_promise;
};

const loadTrackData = async ({ chr, track_ids }) => {
	const loaded_tracks = [];

	for (const track_id of track_ids) {
		const annotation_data = await loadAnnotationData(track_id);
		const chr_genes = annotation_data.by_chr[chr] || [];
		loaded_tracks.push({ track_id, raw_data: chr_genes });
	}

	return loaded_tracks;
};

const filterTrackData = (loaded_tracks, start, end) => {
	const filtered_results = [];
	for (const track_data of loaded_tracks) {
		const filtered_data = track_data.raw_data.filter(item => {
			const item_start = item.start || item.coordinates?.start || item.position || 0;
			const item_end = item.end || item.coordinates?.end || item.position || 0;
			return item_end > start && item_start < end;
		});
		filtered_results.push({
			track_id: track_data.track_id,
			raw_data: filtered_data
		});
	}
	return filtered_results;
};

export const getTracks = async ({ chr, start, end, track_ids, window_size }) => {
	const loaded_tracks = await loadTrackData({ chr, track_ids });
	const filtered_results = filterTrackData(loaded_tracks, start, end);
	return filtered_results;
};

export const getLambdaTrack = async ({ chr, start, end, measure, populations, window_size }) => {
	const buffered_start = Math.max(0, start - CONFIG.LAMBDA_BUFFER_BASES);
	const buffered_end = end + CONFIG.LAMBDA_BUFFER_BASES;
	const required_bins = calculateBins(buffered_start, buffered_end, window_size);
	const population_labels = Object.keys(populations);
	// Resolved concurrently so every population of a track reaches the batch queue within
	// the same debounce window. Awaiting them in sequence held back the second population
	// of each pairwise track until the first had returned, splitting off a second invocation.
	const results = await Promise.all(population_labels.map(async population_label => {
		const lower_bound = ['pop', population_label, chr, window_size, required_bins[0].start, 0];
		const upper_bound = ['pop', population_label, chr, window_size, required_bins[required_bins.length - 1].end, Infinity];
		const cached_bins = await queryIDBRange(CONFIG.IDB_NAME, CONFIG.IDB_LAMBDA_TABLE, lower_bound, upper_bound);
		const missing_bins = findMissingBins(required_bins, cached_bins);
		if (missing_bins.length > 0) {
			const has_visible_missing = missing_bins.some(bin => bin.end > start && bin.start < end);
			const should_fetch = has_visible_missing || missing_bins.length >= CONFIG.MIN_FETCH_WINDOWS;
			if (should_fetch) {
				const missing_start = missing_bins[0].start;
				const missing_end = missing_bins[missing_bins.length - 1].end;
				const inflight_key = `${chr}:${window_size}:${population_label}`;
				const inflight = inflightLambdaFetches.get(inflight_key);
				let fetch_promise;
				if (inflight && inflight.start <= missing_start && inflight.end >= missing_end) {
					fetch_promise = inflight.promise;
				} else {
					const entry = { start: missing_start, end: missing_end };
					entry.promise = queueLambdaRequest(chr, missing_start, missing_end, measure, { [population_label]: populations[population_label] }, window_size)
						.finally(() => {
							if (inflightLambdaFetches.get(inflight_key) === entry)
								inflightLambdaFetches.delete(inflight_key);
						});
					inflightLambdaFetches.set(inflight_key, entry);
					fetch_promise = entry.promise;
				}
				await fetch_promise;
			}
		}
		const visible_bins = calculateBins(start, end, window_size);
		const visible_lower = ['pop', population_label, chr, window_size, visible_bins[0].start, 0];
		const visible_upper = ['pop', population_label, chr, window_size, visible_bins[visible_bins.length - 1].end, Infinity];
		const final_bins = await queryIDBRange(CONFIG.IDB_NAME, CONFIG.IDB_LAMBDA_TABLE, visible_lower, visible_upper);
		const sorted_bins = final_bins.sort((a, b) => a.key[BIN_START_INDEX] - b.key[BIN_START_INDEX]);
		const raw_bins_data = sorted_bins.map(bin => bin.value);
		let bins_data;
		if (measure === 'raw') {
			bins_data = raw_bins_data.map(row => row ? [row[3], row[4], row[5]] : [null, null, null]);
		} else {
			const measure_index = MEASURE_INDEX[measure];
			bins_data = raw_bins_data.map(row => row ? row[measure_index] : null);
		}
		return [population_label, {
			data: bins_data,
			window_size: window_size,
			start: visible_bins[0].start,
			end: visible_bins[visible_bins.length - 1].end
		}];
	}));
	return Object.fromEntries(results);
};

export const getSignalTrack = async ({ chr, start, end, measure, populations, window_size }) => {
	const options = getOptions();
	const source = CONFIG.SOURCE_DIRECTORIES[options.mode];
	const population_labels = Object.keys(populations);
	const population_data = Object.fromEntries(await Promise.all(population_labels.map(async population =>
		[population, await getIDBObject(CONFIG.IDB_NAME, CONFIG.IDB_POPULATIONS_TABLE, population)]
	)));
	// The mode decides which pregenerated source a track reads, so every population of
	// a view is measured on the same panel. Only populations the user assembled have no
	// pregenerated track, and those alone are computed on the fly.
	const on_the_fly = population_labels.filter(population => population_data[population].Dataset === 'User');
	const pregenerated = population_labels.filter(population => population_data[population].Dataset !== 'User');
	const [lambda_tracks, precomputed_tracks] = await Promise.all([
		on_the_fly.length === 0 ? {} : getLambdaTrack({
			chr, start, end, measure, window_size,
			populations: Object.fromEntries(on_the_fly.map(population => [population, populations[population]]))
		}),
		Promise.all(pregenerated.map(async population => {
			const source_label = population_data[population].aadr_population.replace(/\.(DG)$/, '');
			return [population, await getPrecomputedTrack({ source, chr, start, end, population: source_label, window_size, measure })];
		}))
	]);
	return Object.assign({}, lambda_tracks, Object.fromEntries(precomputed_tracks));
};

export const loadGeneMap = async ({ track_id }) => {
	if (geneNameMaps.has(track_id)) {
		return geneNameMaps.get(track_id);
	}
	
	await loadAnnotationData(track_id);
	return geneNameMaps.get(track_id);
};
