import { getOptions } from '/apc/common.js';
import { CHR_LENGTHS } from '/common.js';
import { computeViewfinderBounds, clampSpanToMinimum } from '/browser/region.js';
import { findZoomLevelForSpan } from '/browser/zoom.js';
import { updateRegionInput } from '/browser/helpers.js';

const BROWSER_SELECTOR = '[data-module="browser"]';

/**
 * Builds every option a region change has to write. Writing chr, start and end
 * alone leaves the viewfinder and the zoom level pointing at the previous
 * locus, because nothing in DELPHI derives them from the main region.
 */
const regionUpdates = patch => {
	const chromosome_length = CHR_LENGTHS[patch.chr];
	const region = clampSpanToMinimum(patch.start, patch.end, chromosome_length);
	const viewfinder = computeViewfinderBounds(region.start, region.end, chromosome_length);
	return [
		['chr', patch.chr],
		['start', region.start],
		['end', region.end],
		['zoom_level', findZoomLevelForSpan(region.end - region.start)],
		['viewfinder_start', viewfinder.viewfinder_start],
		['viewfinder_end', viewfinder.viewfinder_end]
	];
};

const patchUpdates = patch => [
	...(patch.chr !== undefined ? regionUpdates(patch) : []),
	...(patch.populations !== undefined ? [['populations', patch.populations]] : [])
];

const stateMatches = updates => {
	const options = getOptions();
	return updates.every(([key, value]) => JSON.stringify(options[key]) === JSON.stringify(value));
};

/**
 * The only function in the assistant that writes site_options. It runs on a
 * patch that has already passed validation, writes every field one change
 * implies, dispatches the browser's own event, and then reads the state back to
 * confirm the view actually moved.
 */
export const applyPatch = patch => {
	const browser = document.querySelector(BROWSER_SELECTOR);
	if (!browser)
		return { status: 'failed', detail: 'the browser is not on the page' };
	const updates = patchUpdates(patch);
	if (updates.length === 0)
		return { status: 'failed', detail: 'there was nothing to apply' };
	getOptions(updates);
	browser.dispatchEvent(new Event(patch.populations === undefined ? 'refresh' : 'update'));
	if (!stateMatches(updates))
		return { status: 'failed', detail: 'the state did not change' };
	if (patch.chr !== undefined)
		updateRegionInput(patch.chr, Object.fromEntries(updates).start, Object.fromEntries(updates).end);
	return { status: 'applied', detail: Object.fromEntries(updates) };
};
