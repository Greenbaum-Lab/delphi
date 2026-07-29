import { getOptions } from '/apc/common.js';
import { getTracks } from '/assets.js';
import { CHR_LENGTHS } from '/common.js';
import { updateRegionInput } from '/browser/helpers.js';
import { computeViewfinderBounds } from '/browser/region.js';

const CHROMOSOME_ORDER = Object.keys(CHR_LENGTHS);

const loadChromosomeFeatures = async (track_id, chr) => {
	const tracks = await getTracks({chr, start: 0, end: CHR_LENGTHS[chr], track_ids: [track_id]});
	const features = tracks[0]?.raw_data || [];
	return [...features].sort((first, second) => first.coordinates.start - second.coordinates.start);
};

const findFeatureBeyond = (features, position, direction) => {
	if (direction > 0)
		return features.find(feature => feature.coordinates.start > position) || null;
	return features.findLast(feature => feature.coordinates.end < position) || null;
};

const remainingChromosomes = (chr, direction) => {
	const index = CHROMOSOME_ORDER.indexOf(chr);
	return direction > 0 ? CHROMOSOME_ORDER.slice(index + 1) : CHROMOSOME_ORDER.slice(0, index).reverse();
};

/**
 * Finds the closest feature of an annotation past a genomic position, continuing
 * into following chromosomes once the current one holds no further features.
 */
const findHit = async (track_id, chr, position, direction) => {
	const features = await loadChromosomeFeatures(track_id, chr);
	const feature = findFeatureBeyond(features, position, direction);
	if (feature)
		return {chr, feature};
	for (const next_chr of remainingChromosomes(chr, direction)) {
		const next_features = await loadChromosomeFeatures(track_id, next_chr);
		if (next_features.length > 0)
			return {chr: next_chr, feature: direction > 0 ? next_features[0] : next_features[next_features.length - 1]};
	}
	return null;
};

const centerOnFeature = (chr, feature) => {
	const options = getOptions();
	const span = options.end - options.start;
	const chr_length = CHR_LENGTHS[chr];
	const center = (feature.coordinates.start + feature.coordinates.end) / 2;
	const start = Math.max(0, Math.min(Math.round(center - span / 2), chr_length - span));
	const end = Math.min(chr_length, start + span);
	const viewfinder_bounds = computeViewfinderBounds(start, end, chr_length);
	getOptions([
		['chr', chr],
		['start', start],
		['end', end],
		['viewfinder_start', viewfinder_bounds.viewfinder_start],
		['viewfinder_end', viewfinder_bounds.viewfinder_end]
	]);
	updateRegionInput(chr, start, end);
};

export const navigateToHit = async (track, direction) => {
	const options = getOptions();
	const view_center = (options.start + options.end) / 2;
	const hit = await findHit(track.dataset.source, options.chr, view_center, direction);
	if (!hit)
		return;
	centerOnFeature(hit.chr, hit.feature);
	track.closest('[data-module="browser"]').dispatchEvent(new Event('refresh'));
};
