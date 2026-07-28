import { getOptions } from '/apc/common.js';
import { loadGeneMap, listAnnotations, getMetadata } from '/assets.js';
import { getPopsData } from '/browser/pops.js';

const countValues = (samples, field_name) => {
	const counts = new Map();
	for (const sample of samples) {
		const field_value = sample[field_name];
		if (field_value)
			counts.set(field_value, (counts.get(field_value) || 0) + 1);
	}
	return counts;
};

const modalValue = counts => {
	let modal_value = null;
	let modal_count = 0;
	for (const [field_value, count] of counts) {
		if (count > modal_count) {
			modal_value = field_value;
			modal_count = count;
		}
	}
	return modal_value;
};

const populationSamples = (sample_index, population_record) => (population_record.subset || []).map(sample_id => sample_index.get(sample_id)).filter(Boolean);

/**
 * Joins each population to the region and country of its own samples, which is
 * the only route to those two fields: population records carry neither, and the
 * per-sample metadata carries no population label. A population takes the most
 * common value among its samples, so a population spanning two countries is
 * reported under the one most of its samples come from.
 */
export const buildMetadataIndex = (population_records, metadata_samples) => {
	const sample_index = new Map(metadata_samples.map(sample => [sample.Poseidon_ID, sample]));
	return new Map(population_records.map(population_record => {
		const samples = populationSamples(sample_index, population_record);
		return [population_record.label, {
			region: modalValue(countValues(samples, 'Region')),
			country: modalValue(countValues(samples, 'Country'))
		}];
	}));
};

/**
 * Reads the four collections the assistant resolves against, once, from data
 * DELPHI has already cached by the time the browser module has initialised.
 * Everything downstream of this function is a lookup against these collections
 * and never a fetch.
 */
export const loadCatalogue = async () => {
	const gene_track_id = getOptions().annotations[0];
	const [gene_map, annotation_labels, population_records, metadata_samples] = await Promise.all([
		loadGeneMap({ track_id: gene_track_id }),
		listAnnotations(),
		getPopsData(),
		getMetadata()
	]);
	return {
		gene_map,
		annotation_labels,
		population_records,
		metadata_index: buildMetadataIndex(population_records, metadata_samples)
	};
};
