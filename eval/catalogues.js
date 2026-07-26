import { getPopsData } from '/browser/pops.js';
import { loadGeneMap } from '/assets.js';
import { takeSpread } from './task.js';

const GENE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]{2,10}$/;
const GENE_TARGET_COUNT = 8;
const POPULATION_TARGET_COUNT = 8;

const cleanLabel = value => String(value === undefined || value === null ? '' : value).trim().replace(/[.,;:?!]+$/, '');

/**
 * Reads the two catalogues the model never sees. Gene and population selection
 * are extraction plus deterministic resolution, so the catalogues live in code
 * and only the resolved entry is scored.
 */
export const readCatalogues = async gene_track_id => {
	const gene_map = await loadGeneMap({ track_id: gene_track_id });
	const populations = await getPopsData();
	const gene_names = [...gene_map.keys()].filter(gene_name => GENE_NAME_PATTERN.test(gene_name));
	return {
		gene_map,
		populations,
		gene_targets: takeSpread(gene_names, GENE_TARGET_COUNT).map(gene_name => ({ gene_name, entry: gene_map.get(gene_name) })),
		population_targets: takeSpread(populations, POPULATION_TARGET_COUNT)
	};
};

export const resolveGene = (gene_map, gene_name) => {
	const cleaned_name = cleanLabel(gene_name);
	return gene_map.get(cleaned_name) || gene_map.get(cleaned_name.toUpperCase()) || null;
};

export const resolvePopulation = (populations, population_label) => {
	const cleaned_label = cleanLabel(population_label);
	return populations.find(population => population.label === cleaned_label) || populations.find(population => population.label.toLowerCase() === cleaned_label.toLowerCase()) || null;
};
