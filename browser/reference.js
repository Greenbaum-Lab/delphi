import { getIDBObject } from '/apc/cache.js';
import { CONFIG } from '/assets.js';

const RESERVOIR_SIZE = 5000;
const LOWER_FRACTION = 0.025;
const UPPER_FRACTION = 0.975;

const emptyRecord = () => ({ count: 0, total: 0, reservoir: [], covered: {} });

const quantile = (sorted_values, fraction) => sorted_values[Math.min(sorted_values.length - 1, Math.floor(fraction * sorted_values.length))];

const summarise = (record) => {
	if (record.reservoir.length === 0)
		return null;
	const sorted_values = record.reservoir.slice().sort((first, second) => first - second);
	return {
		mean: record.total / record.count,
		lower: quantile(sorted_values, LOWER_FRACTION),
		upper: quantile(sorted_values, UPPER_FRACTION),
		n: record.count
	};
};

const addValue = (record, value) => {
	record.count += 1;
	record.total += value;
	if (record.reservoir.length < RESERVOIR_SIZE)
		return record.reservoir.push(value);
	const index = Math.floor(Math.random() * record.count);
	if (index < RESERVOIR_SIZE)
		record.reservoir[index] = value;
};

const mergeRange = (ranges, [start, end]) => {
	const disjoint = [];
	let merged_start = start;
	let merged_end = end;
	ranges.forEach(([range_start, range_end]) => {
		if (range_end < merged_start || range_start > merged_end)
			return disjoint.push([range_start, range_end]);
		merged_start = Math.min(merged_start, range_start);
		merged_end = Math.max(merged_end, range_end);
	});
	return disjoint.concat([[merged_start, merged_end]]).sort((first, second) => first[0] - second[0]);
};

const uncoveredBins = (bins, ranges) => bins.filter(bin => !ranges.some(([start, end]) => bin.start >= start && bin.end <= end));

export const referenceKey = (mode, window_size, measure, population) => `${mode}:${window_size}:${measure}:${population}`;

export const updateReference = async (reference_key, chr, bins) => {
	/*
	Fold bins into a track's stored distribution and return the estimate.

	Only bins outside the ranges the record has already seen are folded, so
	revisiting a region neither reweights the estimate nor costs anything, while
	browsing new regions sharpens it. Percentiles come from a bounded reservoir
	sample, so the record does not grow with use.
	*/
	if (bins.length === 0)
		return null;
	const record = await getIDBObject(CONFIG.IDB_NAME, CONFIG.IDB_REFERENCE_TABLE, reference_key) || emptyRecord();
	const covered = record.covered[chr] || [];
	const fresh_bins = uncoveredBins(bins, covered);
	if (fresh_bins.length === 0)
		return summarise(record);
	fresh_bins.filter(bin => bin.value !== null).forEach(bin => addValue(record, bin.value));
	record.covered = { ...record.covered, [chr]: mergeRange(covered, [bins[0].start, bins[bins.length - 1].end]) };
	await getIDBObject(CONFIG.IDB_NAME, CONFIG.IDB_REFERENCE_TABLE, reference_key, record);
	return summarise(record);
};
