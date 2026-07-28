import { getOptions } from '/apc/common.js';
import { CHR_LENGTHS } from '/common.js';
import { loadGeneMap } from '/assets.js';
import { getPops } from '/browser/pops.js';

const CATALOG_POPULATION_LIMIT = 400;

const chromosomeNames = () => Object.keys(CHR_LENGTHS);

/**
 * Reads the two collections every later stage resolves against. Both are
 * already resident by the time the browser module has initialised, so the
 * assistant fetches nothing of its own.
 */
export const loadCatalog = async () => {
	const gene_track_id = getOptions().annotations[0];
	const [gene_map, population_labels] = await Promise.all([
		loadGeneMap({ track_id: gene_track_id }),
		getPops()
	]);
	return { gene_map, population_labels, chromosome_names: chromosomeNames() };
};

/**
 * Builds the static portion of the prompt: the closed vocabulary the model is
 * allowed to select from. It is public metadata, it is identical on every call,
 * and it holds no sample, genotype or user data.
 */
export const catalogSlice = catalog => ({
	populations: catalog.population_labels.slice(0, CATALOG_POPULATION_LIMIT),
	chromosomes: catalog.chromosome_names
});
