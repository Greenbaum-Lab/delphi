import { CHROMOSOMES } from './schema.js';

const CATALOG_TTL_MS = 3600000;

let cached_catalog = null;
let cached_at = 0;

const readPopulationLabels = async catalog_url => {
	const response = await fetch(catalog_url);
	if (!response.ok)
		throw new Error(`population catalogue fetch failed: ${response.status}`);
	const population_records = await response.json();
	return population_records.map(record => record.population).filter(Boolean).sort();
};

/**
 * Loads the public population list once per isolate. The catalogue is the
 * closed vocabulary the model selects from; holding it here rather than
 * accepting it from the browser means a client cannot widen what the model is
 * allowed to name.
 */
export const loadCatalog = async catalog_url => {
	if (cached_catalog && Date.now() - cached_at < CATALOG_TTL_MS)
		return cached_catalog;
	cached_catalog = { populations: await readPopulationLabels(catalog_url), chromosomes: CHROMOSOMES };
	cached_at = Date.now();
	return cached_catalog;
};
