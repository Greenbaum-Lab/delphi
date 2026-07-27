export const RESOLVED = 'resolved';
export const AMBIGUOUS = 'ambiguous';
export const UNRESOLVED = 'unresolved';

const statusFor = match_count => match_count === 1 ? RESOLVED : match_count === 0 ? UNRESOLVED : AMBIGUOUS;

const resolution = matches => ({ status: statusFor(matches.length), matches });

const isLookupKey = value => typeof value === 'string' && value.length > 0;

/**
 * Resolves a gene name against the gene name map DELPHI already holds in
 * memory. Matching is exact string equality, per D-026: a name that differs in
 * case, spacing or punctuation does not match, because normalising it would be
 * the label transformation D-024 forbids. Returns the code-held entry rather
 * than the caller's string, so the extracted name never reaches an action.
 */
export const resolveGene = (gene_map, gene_name) => {
	if (!(gene_map instanceof Map) || !isLookupKey(gene_name))
		return resolution([]);
	const gene_entry = gene_map.get(gene_name);
	if (gene_entry === undefined)
		return resolution([]);
	return resolution([{ gene_name, chr: gene_entry.chr, start: gene_entry.start }]);
};

/**
 * Resolves a population label against the population catalogue. Exact string
 * equality on label, for the same reason as resolveGene. Every record whose
 * label matches is returned, so a catalogue holding one label twice reports
 * ambiguous and the caller asks rather than picking one.
 */
export const resolvePopulation = (populations, population_label) => {
	if (!Array.isArray(populations) || !isLookupKey(population_label))
		return resolution([]);
	return resolution(populations.filter(population => population && population.label === population_label));
};
