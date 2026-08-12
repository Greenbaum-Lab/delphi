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
	SOURCE_DIRECTORIES: { gnomad: 'gnomad', adna: 'AADR' },
	SUMMARY_FILE: 'percentiles.json',
	POPULATIONS_FILE: 'populations.json',
	IDB_NAME: 'delphi',
	IDB_LAMBDA_TABLE: 'lambda_cache',
	IDB_GNOMAD_TABLE: 'gnomad_cache',
	IDB_POPULATIONS_TABLE: 'populations',
	IDB_ANNOTATIONS_TABLE: 'annotations',
	IDB_REFERENCE_TABLE: 'signal_reference',
	GNOMAD_STAT_COLUMNS: ['heterozygosity', 'tajimasd', 'fulif', 'ac', 'an', 'het_obs'],
};

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
const summaryCaches = new Map();
const elementCaches = new Map();
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

export const getMetadata = () => {
	/*
	The sample metadata, fetched once however many callers ask for it.

	The promise is cached rather than the parsed metadata, so callers arriving
	while the first fetch is still in flight wait on it instead of starting one
	of their own. Populations are materialised in parallel and every one of them
	reads this file, so caching on resolution would fetch it once per population.
	*/
	if (metadataCache)
		return metadataCache;
	metadataCache = fetch(`${CONFIG.S3_BASE_URL}/Poseidon_AADR_v62_metadata.json`)
		.then(response => {
			if (!response.ok)
				throw new Error(`Failed to fetch metadata: ${response.status}`);
			return response.json();
		});
	metadataCache.catch(() => metadataCache = null);
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
	precomputedMemoryCache.set(cache_key, load_promise);
	load_promise.catch(() => precomputedMemoryCache.delete(cache_key));
	return load_promise;
};

const getSignalSummary = (source, window_size) => {
	const cache_key = `${source}_${window_size}`;
	if (summaryCaches.has(cache_key)) {
		return summaryCaches.get(cache_key);
	}
	const load_promise = fetch(`${CONFIG.S3_BASE_URL}/${source}/${window_size}/${CONFIG.SUMMARY_FILE}`)
		.then(response => response.ok ? response.json() : null);
	summaryCaches.set(cache_key, load_promise);
	load_promise.catch(() => summaryCaches.delete(cache_key));
	return load_promise;
};

export const getPregeneratedReference = async (population, measure, window_size) => {
	/*
	Mean and 95 percent interval measured across the whole pregenerated table of a
	population, or null where no table exists, as for a population the user
	assembled.
	*/
	const population_data = await getIDBObject(CONFIG.IDB_NAME, CONFIG.IDB_POPULATIONS_TABLE, population);
	if (!population_data.file_name)
		return null;
	const source = CONFIG.SOURCE_DIRECTORIES[getOptions().mode];
	const summary = await getSignalSummary(source, window_size);
	return summary && summary[population_data.file_name] && summary[population_data.file_name][measure] || null;
};

export const isAnnotationResolution = (window_size) => isNaN(+window_size);

const parseElementRows = (text) => {
	const rows_by_chromosome = {};
	for (const line of text.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('track') || trimmed.startsWith('browser'))
			continue;
		const fields = trimmed.split('\t');
		const key = fields[0].replace(/^chr/i, '');
		if (!rows_by_chromosome[key])
			rows_by_chromosome[key] = [];
		rows_by_chromosome[key].push({ start: +fields[1], end: +fields[2], label: fields[3] });
	}
	return rows_by_chromosome;
};

const getAnnotationElements = (source, annotation) => {
	/*
	The rows of an annotation signal table, from the BED file the tables were
	generated from, served beside them. Row i of a chromosome's table holds the
	i-th BED line of that chromosome in file order, which is how the generator
	assigns rows, so the BED carries the coordinates of every row.
	*/
	const cache_key = `${source}_${annotation}`;
	if (elementCaches.has(cache_key))
		return elementCaches.get(cache_key);
	const load_promise = fetch(`${CONFIG.S3_BASE_URL}/${source}/${annotation}/elements.bed`)
		.then(response => {
			if (!response.ok)
				throw new Error(`Failed to fetch annotation elements: ${response.status}`);
			return response.text();
		})
		.then(parseElementRows);
	elementCaches.set(cache_key, load_promise);
	load_promise.catch(() => elementCaches.delete(cache_key));
	return load_promise;
};

const measureData = (rows, measure) => {
	const measured = value => (value === undefined || isNaN(value)) ? null : value;
	if (measure === 'raw')
		return rows.map(row => [measured(row.ac), measured(row.an), measured(row.het_obs)]);
	return rows.map(row => measured(row[measure]));
};

const getElementTrack = async ({ source, chr, start, end, population, window_size, measure }) => {
	const [full_data, rows_by_chromosome] = await Promise.all([
		getPrecomputedChromosome(source, population, chr, window_size),
		getAnnotationElements(source, window_size)
	]);
	const chromosome_elements = rows_by_chromosome[chr.replace(/^chr/i, '')] || [];
	const visible = chromosome_elements
		.map((element, row_index) => ({ ...element, row_index }))
		.filter(element => element.end > start && element.start < end);
	return {
		data: measureData(visible.map(element => full_data[element.row_index]), measure),
		elements: visible.map(element => ({ start: element.start, end: element.end, label: element.label })),
		window_size: window_size,
		start,
		end
	};
};

const getPrecomputedTrack = async ({ source, chr, start, end, population, window_size, measure }) => {
	if (isAnnotationResolution(window_size))
		return getElementTrack({ source, chr, start, end, population, window_size, measure });
	const full_data = await getPrecomputedChromosome(source, population, chr, window_size);
	const start_index = Math.floor(start / window_size);
	const end_index = Math.ceil(end / window_size);
	return {
		data: measureData(full_data.slice(start_index, end_index), measure),
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
	const requested_populations = Object.keys(populations);
	const population_data = Object.fromEntries(await Promise.all(requested_populations.map(async population =>
		[population, await getIDBObject(CONFIG.IDB_NAME, CONFIG.IDB_POPULATIONS_TABLE, population)]
	)));
	const population_labels = requested_populations.filter(population => population_data[population]);
	const on_the_fly = population_labels.filter(population => population_data[population].Dataset === 'User');
	const pregenerated = population_labels.filter(population => population_data[population].Dataset !== 'User');
	const [lambda_tracks, precomputed_tracks] = await Promise.all([
		on_the_fly.length === 0 || isAnnotationResolution(window_size) ? {} : getLambdaTrack({
			chr, start, end, measure, window_size,
			populations: Object.fromEntries(on_the_fly.map(population => [population, populations[population]]))
		}),
		Promise.all(pregenerated.map(async population => {
			return [population, await getPrecomputedTrack({ source, chr, start, end, population: population_data[population].file_name, window_size, measure })];
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
