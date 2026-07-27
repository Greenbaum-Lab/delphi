import { getOptions } from '/apc/common.js';
import { clampSpanToMinimum, computeViewfinderBounds } from '/browser/region.js';
import { findZoomLevelForSpan } from '/browser/zoom.js';
import { updateRegionInput } from '/browser/helpers.js';
import { MEASURES, validChromosome, chromosomeLength, validateRegion, validateSort, validateRecords, validateIds } from '/assistant/validation.js';

export const OK = 'ok';
export const INVALID = 'invalid';
export const UNCHANGED = 'unchanged';

const invalid = (action, detail) => ({ status: INVALID, action, detail });

const unchanged = (action, detail) => ({ status: UNCHANGED, action, detail });

const applied = (action, changes) => ({ status: OK, action, changes });

const uniqueLabels = labels => [...new Set(labels)];

const sameValue = (current, expected) => Array.isArray(expected) ? Array.isArray(current) && current.length === expected.length && current.every((item, index) => item === expected[index]) : current === expected;

/**
 * Writes the given option entries, dispatches the event DELPHI's own controls
 * dispatch for that kind of change, then re-reads site_options and reports the
 * first field that did not take. Verification reads the store rather than the
 * rendered tracks because the store is what every later action and every state
 * answer is derived from. update is the structural rebuild; refresh is a redraw.
 */
const applyChanges = (action, changes, event_name) => {
	const browser = document.querySelector('[data-module="browser"]');
	if (!browser)
		return invalid(action, 'browser');
	getOptions(changes);
	browser.dispatchEvent(new Event(event_name));
	const options = getOptions();
	const failed = changes.find(([option_key, option_value]) => !sameValue(options[option_key], option_value));
	return failed ? unchanged(action, failed[0]) : applied(action, changes);
};

/**
 * Moves the view, writing all six fields a region change owns. zoom_level is
 * never recomputed by DELPHI and the viewfinder pair is only repaired when the
 * focal window nears an edge, so a caller that writes chr, start and end alone
 * leaves both stale. Spans below MIN_SPAN are widened by DELPHI's own clamp.
 */
const applyRegion = (action, chr, start, end) => {
	const chr_length = chromosomeLength(chr);
	const span = clampSpanToMinimum(start, end, chr_length);
	const viewfinder = computeViewfinderBounds(span.start, span.end, chr_length);
	const changes = [['chr', chr], ['start', span.start], ['end', span.end], ['zoom_level', findZoomLevelForSpan(span.end - span.start)], ['viewfinder_start', viewfinder.viewfinder_start], ['viewfinder_end', viewfinder.viewfinder_end]];
	const result = applyChanges(action, changes, 'refresh');
	updateRegionInput(chr, span.start, span.end);
	return result;
};

export const setMeasure = measure => {
	if (!MEASURES.includes(measure))
		return invalid('set_measure', 'measure');
	return applyChanges('set_measure', [['measure', measure]], 'update');
};

export const setSort = (sort_field, sort_direction) => {
	const invalid_parameter = validateSort(sort_field, sort_direction, getOptions().measure);
	if (invalid_parameter)
		return invalid('set_sort', invalid_parameter);
	return applyChanges('set_sort', [['sort', sort_field], ['sort_dir', sort_direction]], 'update');
};

export const navigateToRegion = (chr, start, end) => {
	const invalid_parameter = validateRegion(chr, start, end);
	if (invalid_parameter)
		return invalid('navigate_to_region', invalid_parameter);
	return applyRegion('navigate_to_region', chr, start, end);
};

/**
 * Jumps to a resolved gene entry, keeping the current span and centring it on
 * the gene's start, which is what DELPHI's own gene search does. The gene name
 * map carries no end coordinate, so the gene's own length is not available to
 * size the window. Takes the resolved entry, never the extracted name (D-026).
 */
export const navigateToGene = gene_entry => {
	if (!gene_entry || !validChromosome(gene_entry.chr) || !Number.isInteger(gene_entry.start))
		return invalid('navigate_to_gene', 'gene');
	const options = getOptions();
	const half_span = Math.floor((options.end - options.start) / 2);
	const start = Math.max(0, gene_entry.start - half_span);
	const end = Math.min(chromosomeLength(gene_entry.chr), gene_entry.start + half_span);
	return applyRegion('navigate_to_gene', gene_entry.chr, start, end);
};

/**
 * Adds populations to the current selection, which is the default per D-034.
 * DELPHI has no append path of its own: the grid always writes the full set, so
 * the union is composed here from the labels already selected plus the labels
 * of the resolved records. No label is constructed or transformed (D-024).
 */
export const addPopulations = population_records => {
	if (!validateRecords(population_records))
		return invalid('add_populations', 'populations');
	const selected_labels = getOptions().populations || [];
	const requested_labels = population_records.map(record => record.label);
	return applyChanges('add_populations', [['populations', uniqueLabels([...selected_labels, ...requested_labels])]], 'update');
};

export const replacePopulations = population_records => {
	if (!validateRecords(population_records))
		return invalid('replace_populations', 'populations');
	return applyChanges('replace_populations', [['populations', uniqueLabels(population_records.map(record => record.label))]], 'update');
};

export const setAnnotations = annotation_ids => {
	if (!validateIds(annotation_ids))
		return invalid('set_annotations', 'annotations');
	return applyChanges('set_annotations', [['annotations', uniqueLabels(annotation_ids)]], 'update');
};
