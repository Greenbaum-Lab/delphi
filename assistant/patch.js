import { CHR_LENGTHS } from '/common.js';
import { MIN_SPAN, MAX_SPAN, PAN_FRACTION } from '/assistant/config.js';
import { resolveGene, resolvePopulation } from '/assistant/resolvers.js';
import { NOT_UNDERSTOOD, CANNOT_ANALYSE } from '/assistant/messages.js';

const rejected = message => ({ status: 'rejected', message, patch: null, candidates: [] });

const unresolved = (message, candidates) => ({ status: 'unresolved', message, patch: null, candidates });

const ready = patch => ({ status: 'ready', message: null, patch, candidates: [] });

export const normaliseChromosome = chrom => typeof chrom !== 'string' ? null : (chrom.startsWith('chr') ? chrom : `chr${chrom}`);

const clampRegion = (chr, start, end) => {
	const chromosome_length = CHR_LENGTHS[chr];
	const span = Math.min(Math.max(Math.round(end - start), MIN_SPAN), Math.min(MAX_SPAN, chromosome_length));
	const centre = Math.round((start + end) / 2);
	const clamped_start = Math.max(0, Math.min(Math.round(centre - span / 2), chromosome_length - span));
	return { chr, start: clamped_start, end: clamped_start + span };
};

const scaledRegion = (region, factor) => {
	const span = region.end - region.start;
	const centre = (region.start + region.end) / 2;
	return clampRegion(region.chr, centre - (span * factor) / 2, centre + (span * factor) / 2);
};

const shiftedRegion = (region, direction) => {
	const offset = Math.round((region.end - region.start) * PAN_FRACTION) * direction;
	return clampRegion(region.chr, region.start + offset, region.end + offset);
};

const RELATIVE_REGIONS = {
	zoom_in: region => scaledRegion(region, 0.5),
	zoom_out: region => scaledRegion(region, 2),
	widen: region => scaledRegion(region, 4),
	pan_left: region => shiftedRegion(region, -1),
	pan_right: region => shiftedRegion(region, 1)
};

/**
 * Turns a relative move into an absolute region. The model never does this
 * arithmetic; it only ever names the move. Every result is clamped to the
 * chromosome, so a pan at the telomere stops there instead of running off.
 */
const relativePatch = (request, region, history) => {
	if (request.relative === 'back') {
		const previous_region = history.previous();
		return previous_region ? ready(previous_region) : rejected('There is nowhere to go back to yet.');
	}
	if (!RELATIVE_REGIONS[request.relative])
		return rejected(NOT_UNDERSTOOD);
	if (CHR_LENGTHS[region.chr] === undefined)
		return rejected('The browser is not on a chromosome I recognise.');
	return ready(RELATIVE_REGIONS[request.relative](region));
};

const genePatch = (gene_symbol, catalog, region) => {
	const resolution = resolveGene(catalog.gene_map, gene_symbol);
	if (resolution.status !== 'resolved')
		return unresolved(`I have no gene called "${gene_symbol}".`, resolution.candidates);
	const half_span = Math.floor((region.end - region.start) / 2);
	return ready(clampRegion(resolution.entry.chr, resolution.entry.start - half_span, resolution.entry.start + half_span));
};

const coordinatePatch = request => {
	const chr = normaliseChromosome(request.chrom);
	if (!chr || CHR_LENGTHS[chr] === undefined)
		return rejected(`There is no chromosome ${request.chrom} in hg19.`);
	const start = Math.round(Number(request.start));
	const end = request.end === null || request.end === undefined ? start : Math.round(Number(request.end));
	return ready(end - start < MIN_SPAN ? clampRegion(chr, start, end) : { chr, start, end });
};

const populationPatch = (population_labels, catalog) => {
	const resolutions = population_labels.map(label => ({ label, resolution: resolvePopulation(catalog.population_labels, label) }));
	const failure = resolutions.find(entry => entry.resolution.status !== 'resolved');
	if (failure)
		return unresolved(`I have no population called "${failure.label}".`, failure.resolution.candidates);
	return ready({ populations: [...new Set(resolutions.map(entry => entry.resolution.entry))] });
};

const regionPart = (request, catalog, region, history) => {
	if (request.relative)
		return relativePatch(request, region, history);
	if (request.gene_symbol)
		return genePatch(request.gene_symbol, catalog, region);
	if (request.chrom !== null && request.chrom !== undefined)
		return coordinatePatch(request);
	return null;
};

/**
 * Builds the patch a request implies, resolving every name against a code-held
 * collection on the way. A request that names nothing actionable, or names
 * something that does not exist, never becomes a patch.
 */
export const buildPatch = (request, catalog, state_slice, history) => {
	if (request.rejection_reason)
		return rejected(request.rejection_reason === 'analysis' ? CANNOT_ANALYSE : NOT_UNDERSTOOD);
	const region_result = regionPart(request, catalog, { chr: state_slice.chromosome, start: state_slice.start, end: state_slice.end }, history);
	if (region_result && region_result.status !== 'ready')
		return region_result;
	const population_result = Array.isArray(request.populations) && request.populations.length > 0 ? populationPatch(request.populations, catalog) : null;
	if (population_result && population_result.status !== 'ready')
		return population_result;
	if (!region_result && !population_result)
		return rejected(NOT_UNDERSTOOD);
	return ready({ ...(region_result ? region_result.patch : {}), ...(population_result ? population_result.patch : {}) });
};
