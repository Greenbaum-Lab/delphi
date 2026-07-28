import { NUMERIC_FIELDS } from '/assistant/vocabulary.js';

const NUMERIC_EXPRESSION = /^([A-Za-z_]+)\s*(>=|<=|>|<|=)\s*(-?[0-9]+(?:\.[0-9]+)?)$/;

const COMPARATOR_TESTS = {
	'>': (field_value, threshold) => field_value > threshold,
	'<': (field_value, threshold) => field_value < threshold,
	'>=': (field_value, threshold) => field_value >= threshold,
	'<=': (field_value, threshold) => field_value <= threshold,
	'=': (field_value, threshold) => field_value === threshold
};

/**
 * Splits a filter phrase into the only two shapes the assistant supports: a
 * numeric comparison over a population-record field, or a plain value the
 * caller resolves against the region and country values present in the loaded
 * metadata. Anything else returns null and becomes a clarification.
 */
export const parseFilterExpression = filter_text => {
	if (typeof filter_text !== 'string' || filter_text.trim() === '')
		return null;
	const numeric_match = filter_text.trim().match(NUMERIC_EXPRESSION);
	if (!numeric_match)
		return { kind: 'metadata', value: filter_text.trim() };
	if (!NUMERIC_FIELDS.includes(numeric_match[1]))
		return null;
	return { kind: 'numeric', field: numeric_match[1], comparator: numeric_match[2], value: Number(numeric_match[3]) };
};

const numericFieldValue = field_value => field_value === null || field_value === undefined || field_value === '' ? NaN : Number(field_value);

/**
 * Selects population labels whose own record satisfies a numeric comparison.
 * A record whose field is absent, empty or null is excluded rather than read as
 * zero, which is what Number() would otherwise make of it.
 */
export const selectByNumeric = (population_records, numeric_filter) => {
	const comparator_test = COMPARATOR_TESTS[numeric_filter.comparator];
	return population_records
		.map(record => [record.label, numericFieldValue(record[numeric_filter.field])])
		.filter(([, field_value]) => Number.isFinite(field_value))
		.filter(([, field_value]) => comparator_test(field_value, numeric_filter.value))
		.map(([label]) => label);
};

/**
 * Selects population labels by a per-sample metadata field, using the index
 * built from the sample metadata by the population's own sample list. The
 * comparison is exact against a value the index actually holds.
 */
export const selectByMetadata = (metadata_index, metadata_field, metadata_value) => {
	const selected_labels = [];
	for (const [label, metadata_record] of metadata_index) {
		if (metadata_record[metadata_field] === metadata_value)
			selected_labels.push(label);
	}
	return selected_labels;
};

export const listMetadataValues = (metadata_index, metadata_field) => {
	const values = new Set();
	for (const metadata_record of metadata_index.values()) {
		if (metadata_record[metadata_field])
			values.add(metadata_record[metadata_field]);
	}
	return [...values].sort();
};
