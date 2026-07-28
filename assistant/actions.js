import { getOptions } from '/apc/common.js';
import { CHR_LENGTHS, MAX_SPAN } from '/common.js';
import { computeViewfinderBounds, clampSpanToMinimum } from '/browser/region.js';
import { findZoomLevelForSpan } from '/browser/zoom.js';
import { updateRegionInput } from '/browser/helpers.js';
import { MEASURES, SORT_FIELDS, SORT_DIRECTIONS } from '/assistant/vocabulary.js';

const BROWSER_SELECTOR = '[data-module="browser"]';

const actionResult = (status, action, detail) => ({ status, action, detail });

const syncSelect = (selector, value) => {
	document.querySelectorAll(selector).forEach(select => {
		if ([...select.options].some(option => option.value === value))
			select.value = value;
	});
};

const stateMatches = updates => {
	const options = getOptions();
	return updates.every(([key, value]) => JSON.stringify(options[key]) === JSON.stringify(value));
};

/**
 * Writes the given option pairs, dispatches the browser's own event, then reads
 * the state back and confirms every pair took. Nothing here is fire and forget:
 * a caller always learns whether the view actually changed.
 */
const commit = (action, updates, event_name) => {
	const browser = document.querySelector(BROWSER_SELECTOR);
	if (!browser)
		return actionResult('failed', action, 'the browser is not on the page');
	getOptions(updates);
	browser.dispatchEvent(new Event(event_name));
	if (!stateMatches(updates))
		return actionResult('failed', action, 'the state did not change');
	return actionResult('ok', action, Object.fromEntries(updates));
};

const isPosition = value => Number.isInteger(value) && value >= 0;

const validateRegion = (chr, start, end) => {
	if (typeof chr !== 'string' || CHR_LENGTHS[chr] === undefined)
		return `there is no chromosome ${chr} in hg19`;
	if (!isPosition(start) || !isPosition(end) || start > end)
		return 'those coordinates are not a range';
	if (end > CHR_LENGTHS[chr])
		return `${chr} is only ${CHR_LENGTHS[chr]} bases long`;
	return null;
};

const capSpan = (start, end, chr_length) => {
	if (end - start <= MAX_SPAN)
		return { start, end };
	const center = Math.round((start + end) / 2);
	const capped_start = Math.max(0, Math.min(center - MAX_SPAN / 2, chr_length - MAX_SPAN));
	return { start: Math.round(capped_start), end: Math.round(capped_start) + MAX_SPAN };
};

/**
 * Builds every option a region change has to write. Writing chr, start and end
 * alone leaves the viewfinder and the zoom level pointing at the previous
 * locus, because nothing in DELPHI derives them from the main region.
 */
const regionUpdates = (chr, start, end) => {
	const chr_length = CHR_LENGTHS[chr];
	const capped_region = capSpan(start, end, chr_length);
	const region = clampSpanToMinimum(capped_region.start, capped_region.end, chr_length);
	const viewfinder = computeViewfinderBounds(region.start, region.end, chr_length);
	return [
		['chr', chr],
		['start', region.start],
		['end', region.end],
		['zoom_level', findZoomLevelForSpan(region.end - region.start)],
		['viewfinder_start', viewfinder.viewfinder_start],
		['viewfinder_end', viewfinder.viewfinder_end]
	];
};

export const goToRegion = (chr, start, end) => {
	const invalid_reason = validateRegion(chr, start, end);
	if (invalid_reason)
		return actionResult('invalid', 'go_to_region', invalid_reason);
	const updates = regionUpdates(chr, start, end);
	const result = commit('go_to_region', updates, 'refresh');
	if (result.status === 'ok')
		updateRegionInput(chr, result.detail.start, result.detail.end);
	return result;
};

/**
 * Moves to a resolved gene entry, keeping whatever span the view already has and
 * centring it on the gene's start. The gene map holds no end coordinate, so the
 * gene's own length is not available to widen the window to.
 */
export const goToGene = gene_entry => {
	if (!gene_entry || CHR_LENGTHS[gene_entry.chr] === undefined || !isPosition(gene_entry.start))
		return actionResult('invalid', 'go_to_gene', 'that gene has no usable position');
	const options = getOptions();
	const half_span = Math.floor((options.end - options.start) / 2);
	const start = Math.max(0, gene_entry.start - half_span);
	const end = Math.min(CHR_LENGTHS[gene_entry.chr], gene_entry.start + half_span);
	const result = goToRegion(gene_entry.chr, start, end);
	return result.status === 'ok' ? actionResult('ok', 'go_to_gene', { ...result.detail, gene_name: gene_entry.gene_name }) : result;
};

export const setStatistic = measure => {
	if (!MEASURES.includes(measure))
		return actionResult('invalid', 'set_statistic', `${measure} is not a statistic DELPHI computes`);
	if (getOptions().measure === measure)
		return actionResult('unchanged', 'set_statistic', measure);
	syncSelect('[data-control="measure"]', measure);
	return commit('set_statistic', [['measure', measure]], 'update');
};

/**
 * Sets the track ordering. genetic_distance is refused outside the pairwise FST
 * view, because the individual-track dropdown does not offer it and DELPHI's own
 * syncSortDropdown would silently rewrite the option back to its first entry.
 */
export const setSort = (sort_field, sort_dir) => {
	if (!SORT_FIELDS.includes(sort_field) || !SORT_DIRECTIONS.includes(sort_dir))
		return actionResult('invalid', 'set_sort', `${sort_field} is not a sort DELPHI offers`);
	if (sort_field === 'genetic_distance' && getOptions().measure !== 'fst')
		return actionResult('invalid', 'set_sort', 'genetic distance orders FST pairs, so it needs the FST statistic');
	const options = getOptions();
	if (options.sort === sort_field && options.sort_dir === sort_dir)
		return actionResult('unchanged', 'set_sort', sort_field);
	syncSelect('[data-control="sort"]', sort_field);
	return commit('set_sort', [['sort', sort_field], ['sort_dir', sort_dir]], 'update');
};

const usableRecords = population_records => Array.isArray(population_records) && population_records.length > 0 && population_records.every(record => record && typeof record.label === 'string' && record.label !== '');

export const addPopulations = population_records => {
	if (!usableRecords(population_records))
		return actionResult('invalid', 'add_populations', 'no population was resolved');
	const selected_labels = getOptions().populations || [];
	const added_labels = population_records.map(record => record.label).filter(label => !selected_labels.includes(label));
	if (added_labels.length === 0)
		return actionResult('unchanged', 'add_populations', selected_labels);
	return commit('add_populations', [['populations', [...selected_labels, ...added_labels]]], 'update');
};

export const replacePopulations = population_records => {
	if (!usableRecords(population_records))
		return actionResult('invalid', 'replace_populations', 'no population was resolved');
	const selected_labels = getOptions().populations || [];
	const replacement_labels = population_records.map(record => record.label);
	if (JSON.stringify(selected_labels) === JSON.stringify(replacement_labels))
		return actionResult('unchanged', 'replace_populations', selected_labels);
	return commit('replace_populations', [['populations', replacement_labels]], 'update');
};

export const setAnnotation = annotation_label => {
	if (typeof annotation_label !== 'string' || annotation_label === '')
		return actionResult('invalid', 'set_annotation', 'no annotation was resolved');
	const active_annotations = getOptions().annotations || [];
	if (active_annotations.includes(annotation_label))
		return actionResult('unchanged', 'set_annotation', annotation_label);
	return commit('set_annotation', [['annotations', [...active_annotations, annotation_label]]], 'update');
};
