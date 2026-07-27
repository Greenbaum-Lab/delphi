export const RESOLVED = 'resolved';
export const AMBIGUOUS = 'ambiguous';
export const UNRESOLVED = 'unresolved';

const statusFor = match_count => match_count === 1 ? RESOLVED : match_count === 0 ? UNRESOLVED : AMBIGUOUS;

const resolution = matches => ({ status: statusFor(matches.length), matches });

const isLookupKey = value => typeof value === 'string' && value.length > 0;

const foldCase = value => value.toLowerCase();

const geneMatch = (gene_name, gene_entry) => ({ gene_name, chr: gene_entry.chr, start: gene_entry.start });

/**
 * Resolves a gene name against the gene name map DELPHI already holds in
 * memory. Exact string equality first; if nothing matches exactly, the same
 * comparison folded to lower case.
 *
 * Case folding supersedes the exact-only wording of D-026 and CLAUDE.md
 * section 6, on the owner's instruction that typing basque should find Basque.
 * It is not the guessing that rule forbids: a folded comparison either has
 * exactly one answer or reports several and asks. What still never happens is
 * a near miss resolving itself, and the returned record is the catalogue's own,
 * never the caller's string, so no transformed label reaches an action (D-024).
 */
export const resolveGene = (gene_map, gene_name) => {
	if (!(gene_map instanceof Map) || !isLookupKey(gene_name))
		return resolution([]);
	const exact_entry = gene_map.get(gene_name);
	if (exact_entry !== undefined)
		return resolution([geneMatch(gene_name, exact_entry)]);
	const folded_names = [...gene_map.keys()].filter(key => foldCase(key) === foldCase(gene_name));
	return resolution(folded_names.map(key => geneMatch(key, gene_map.get(key))));
};

/**
 * Resolves a population label against the population catalogue, exact first and
 * then case-folded, for the same reason as resolveGene. Every record whose
 * label matches is returned, so a catalogue holding one label twice reports
 * ambiguous and the caller asks rather than picking one.
 */
export const resolvePopulation = (populations, population_label) => {
	if (!Array.isArray(populations) || !isLookupKey(population_label))
		return resolution([]);
	const exact_matches = populations.filter(population => population && population.label === population_label);
	if (exact_matches.length > 0)
		return resolution(exact_matches);
	return resolution(populations.filter(population => population && foldCase(population.label) === foldCase(population_label)));
};
