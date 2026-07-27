import { CHR_LENGTHS } from '/common.js';

export const MEASURES = ['heterozygosity', 'fst', 'tajimasd', 'fulif'];
export const SORT_DIRECTIONS = ['asc', 'desc'];

const PAIRWISE_MEASURE = 'fst';

export const validChromosome = chr => typeof chr === 'string' && Object.prototype.hasOwnProperty.call(CHR_LENGTHS, chr);

export const chromosomeLength = chr => CHR_LENGTHS[chr];

/**
 * Checks a region against the hg19 chromosome lengths and returns the name of
 * the offending parameter, or null when the region is usable. Validation lives
 * here rather than relying on zoomToLevel's clamp, which falls back to Infinity
 * because it indexes CHR_LENGTHS by assembly (D-028).
 */
export const validateRegion = (chr, start, end) => {
	if (!validChromosome(chr))
		return 'chr';
	if (!Number.isInteger(start) || !Number.isInteger(end))
		return 'coordinates';
	if (start < 0 || end > CHR_LENGTHS[chr])
		return 'coordinates';
	if (start >= end)
		return 'coordinates';
	return null;
};

const sortSelectorFor = measure => measure === PAIRWISE_MEASURE ? '.sort-selector-pairwise' : '.sort-selector';

/**
 * Reads the sort fields DELPHI will accept for the given measure. The two
 * dropdowns in index.html hold different sets, and syncSortDropdown silently
 * rewrites options.sort when it is not a member of the live one, so the
 * dropdown is authoritative and reading it is the only check that cannot
 * diverge from what the application will actually keep.
 */
export const sortFieldsFor = measure => {
	const dropdown = document.querySelector(sortSelectorFor(measure));
	return dropdown ? Array.from(dropdown.options).map(option => option.value) : [];
};

export const validateSort = (sort_field, sort_direction, measure) => {
	if (!sortFieldsFor(measure).includes(sort_field))
		return 'sort';
	if (!SORT_DIRECTIONS.includes(sort_direction))
		return 'sort_dir';
	return null;
};

const isLabel = value => typeof value === 'string' && value.length > 0;

export const validateRecords = population_records => Array.isArray(population_records) && population_records.length > 0 && population_records.every(record => record && isLabel(record.label));

export const validateIds = annotation_ids => Array.isArray(annotation_ids) && annotation_ids.length > 0 && annotation_ids.every(isLabel);
