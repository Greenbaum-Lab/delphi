import { cacheString } from '/apc/cache.js';
import { registerAnnotation, getAnnotationEntry } from '/assets.js';
import { getOptions, errorBox } from '/apc/common.js';

const CONFIG = {
	USER_ANNOTATION_PATH_PREFIX: '/data/user/'
};

const REFSEQ_CHR_PATTERN = /^NC_0*(\d+)\.\d+$/;
const REFSEQ_SPECIAL = { '23': 'X', '24': 'Y', '12920': 'M' };

const detectFormat = (filename) => {
	const lower = filename.toLowerCase();
	if (lower.endsWith('.gtf') || lower.endsWith('.gtf.gz')) {
		return 'gtf';
	}
	if (lower.endsWith('.gff') || lower.endsWith('.gff3') || lower.endsWith('.gff.gz') || lower.endsWith('.gff3.gz')) {
		return 'gff';
	}
	if (lower.endsWith('.bed') || lower.endsWith('.bed.gz')) {
		return 'bed';
	}
	throw new Error('Unknown file format. Expected .gtf, .gff/.gff3, or .bed extension.');
};

const normalizeChr = (chr) => {
	const refseq_match = chr.match(REFSEQ_CHR_PATTERN);
	if (refseq_match) {
		const number = refseq_match[1];
		return 'chr' + (REFSEQ_SPECIAL[number] || number);
	}
	const lower = chr.toLowerCase();
	if (lower.startsWith('chr')) {
		const suffix = chr.slice(3);
		const upper_suffix = suffix.toUpperCase();
		return 'chr' + (/^[0-9]+$/.test(suffix) ? suffix : (upper_suffix === 'MT' ? 'M' : upper_suffix));
	}
	if (/^([0-9]+|[XYM]|MT)$/i.test(chr)) {
		const upper = chr.toUpperCase();
		return 'chr' + (upper === 'MT' ? 'M' : upper);
	}
	throw new Error('Unrecognized chromosome format: "' + chr + '". Expected formats: 1, chr1, or NC_000001.11.');
};

const parseGTFAttributes = (attr_string) => {
	const attrs = {};
	const parts = attr_string.split(';');
	for (const part of parts) {
		const trimmed = part.trim();
		if (!trimmed) continue;
		const match = trimmed.match(/^(\S+)\s+"([^"]*)"$/);
		if (match) {
			attrs[match[1]] = match[2];
		}
	}
	return attrs;
};

const parseGFFAttributes = (attr_string) => {
	const attrs = {};
	const parts = attr_string.split(';');
	for (const part of parts) {
		const trimmed = part.trim();
		if (!trimmed) continue;
		const eq_index = trimmed.indexOf('=');
		if (eq_index > 0) {
			const key = trimmed.slice(0, eq_index);
			const value = decodeURIComponent(trimmed.slice(eq_index + 1));
			attrs[key] = value;
		}
	}
	return attrs;
};

const parseAnnotationFile = (text, format) => {
	const parse_attrs = format === 'gtf' ? parseGTFAttributes : parseGFFAttributes;
	const gene_id_key = format === 'gtf' ? 'gene_id' : 'ID';
	const parent_key = format === 'gtf' ? 'gene_id' : 'Parent';

	const genes = new Map();
	const exons_by_gene = new Map();
	const exon_meta_by_gene = new Map();

	const lines = text.split('\n');
	for (const line of lines) {
		if (!line || line.startsWith('#')) continue;

		const fields = line.split('\t');
		if (fields.length < 9) continue;

		const chr = normalizeChr(fields[0]);
		const feature_type = fields[2].toLowerCase();
		const start = parseInt(fields[3], 10);
		const end = parseInt(fields[4], 10);
		if (isNaN(start) || isNaN(end)) continue;
		const strand = fields[6] === '+' || fields[6] === '-' ? fields[6] : undefined;
		const attrs = parse_attrs(fields[8]);

		if (feature_type === 'gene' || feature_type === 'transcript' || feature_type === 'mrna') {
			const gene_id = attrs[gene_id_key] || attrs['gene_name'] || attrs['Name'] || attrs['ID'];
			if (!gene_id) continue;

			if (!genes.has(gene_id)) {
				genes.set(gene_id, {
					chr,
					name: attrs['gene_name'] || attrs['Name'] || gene_id,
					start,
					end,
					strand
				});
			} else {
				const existing = genes.get(gene_id);
				existing.start = Math.min(existing.start, start);
				existing.end = Math.max(existing.end, end);
			}
		}

		if (feature_type === 'exon') {
			const parent = attrs[parent_key] || attrs['gene_id'] || attrs['Parent'];
			if (!parent) continue;

			if (!exons_by_gene.has(parent)) {
				exons_by_gene.set(parent, []);
				exon_meta_by_gene.set(parent, { chr, strand });
			}
			exons_by_gene.get(parent).push([start, end]);
		}
	}

	for (const [gene_id, exon_list] of exons_by_gene) {
		if (!genes.has(gene_id)) {
			const meta = exon_meta_by_gene.get(gene_id);
			const starts = exon_list.map(exon => exon[0]);
			const ends = exon_list.map(exon => exon[1]);
			genes.set(gene_id, {
				chr: meta.chr,
				name: gene_id,
				start: Math.min(...starts),
				end: Math.max(...ends),
				strand: meta.strand
			});
		}
	}

	return { genes, exons_by_gene };
};

const parseBEDFile = (text) => {
	const genes = new Map();
	const exons_by_gene = new Map();
	const lines = text.split('\n');
	for (const line of lines) {
		if (!line.trim() || line.startsWith('#') || line.startsWith('track') || line.startsWith('browser')) continue;
		const fields = line.split('\t');
		if (fields.length < 3) continue;
		const chr = normalizeChr(fields[0]);
		const start = parseInt(fields[1], 10);
		const end = parseInt(fields[2], 10);
		if (isNaN(start) || isNaN(end)) continue;
		const region_name = fields.length > 3 && fields[3].trim() ? fields[3] : '';
		const strand = fields.length > 5 && (fields[5] === '+' || fields[5] === '-') ? fields[5] : undefined;
		const region_id = chr + '_' + region_name + '_' + start;
		genes.set(region_id, {
			chr,
			name: region_name,
			start,
			end,
			strand
		});
		exons_by_gene.set(region_id, [[start, end]]);
	}
	return { genes, exons_by_gene };
};

const calculateIntrons = (exons) => {
	if (exons.length < 2) return [];

	const sorted = [...exons].sort((a, b) => a[0] - b[0]);
	const introns = [];

	for (let i = 0; i < sorted.length - 1; i++) {
		const intron_start = sorted[i][1];
		const intron_end = sorted[i + 1][0];
		if (intron_end > intron_start) {
			introns.push([intron_start, intron_end]);
		}
	}

	return introns;
};

const buildJSONL = (genes, exons_by_gene) => {
	const lines = [];

	for (const [gene_id, gene_data] of genes) {
		const exons = exons_by_gene.get(gene_id) || [];
		const sorted_exons = [...exons].sort((a, b) => a[0] - b[0]);
		const introns = calculateIntrons(sorted_exons);

		if (!gene_data.chr) {
			continue;
		}

		const entry = {
			chr: gene_data.chr,
			name: gene_data.name,
			start: gene_data.start,
			end: gene_data.end,
			strand: gene_data.strand,
			exons: sorted_exons,
			introns
		};

		lines.push(JSON.stringify(entry));
	}

	return lines.join('\n');
};

const readFileAsText = (file) => {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result);
		reader.onerror = () => reject(new Error('Failed to read file'));
		reader.readAsText(file);
	});
};

const storeAnnotationInCache = async (label, jsonl_content) => {
	const cache_path = CONFIG.USER_ANNOTATION_PATH_PREFIX + label + '.jsonl';
	await cacheString(cache_path, jsonl_content);
	return cache_path;
};

export const loadAnnotationFile = async (file) => {
	const format = detectFormat(file.name);
	const text = await readFileAsText(file);
	const { genes, exons_by_gene } = format === 'bed' ? parseBEDFile(text) : parseAnnotationFile(text, format);
	const jsonl_content = buildJSONL(genes, exons_by_gene);

	let label = file.name.replace(/\.(gtf|gff3?|bed)(\.gz)?$/i, '');
	const existing_entry = await getAnnotationEntry(label);
	if (existing_entry && !existing_entry.user) {
		let candidate = `${label}_upload`;
		let suffix = 2;
		while (await getAnnotationEntry(candidate)) {
			candidate = `${label}_upload_${suffix}`;
			suffix++;
		}
		label = candidate;
	}
	const cache_path = await storeAnnotationInCache(label, jsonl_content);

	return {
		label,
		source: cache_path.replace('/data/', ''),
		type: 'jsonl',
		user: true,
		gene_count: genes.size
	};
};

export const openFilePicker = () => {
	return new Promise((resolve, reject) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.gtf,.gff,.gff3,.bed';

		input.onchange = async (event) => {
			const file = event.target.files[0];
			if (!file) {
				reject(new Error('No file selected'));
				return;
			}
			try {
				const result = await loadAnnotationFile(file);
				resolve(result);
			} catch (error) {
				reject(error);
			}
		};

		input.click();
	});
};

export const addAnnotation = async (browser_element) => {
	try {
		const annotation_entry = await openFilePicker();
		await registerAnnotation(annotation_entry);
		getOptions([['annotations', [...getOptions().annotations, annotation_entry.label]]]);
		browser_element.dispatchEvent(new Event('update'));
	} catch (error) {
		if (error.message !== 'No file selected') {
			console.error('Failed to add annotation:', error);
			errorBox('Failed to add annotation', error.message, browser_element);
		}
	}
};
