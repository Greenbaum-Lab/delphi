const MAX_CANDIDATES = 6;
const MIN_TYPO_LENGTH = 4;

const resolvedResult = entry => ({ status: 'resolved', entry, candidates: [] });

const unresolvedResult = candidates => ({ status: candidates.length > 0 ? 'ambiguous' : 'not_found', entry: null, candidates });

const isUsableQuery = query => typeof query === 'string' && query.trim().length > 0;

/**
 * True when two names differ by at most one character, which is what a typed
 * typo usually is. This decides only whether a name is worth offering back as a
 * question; it never decides what the browser acts on.
 */
const withinOneEdit = (candidate_name, query_name) => {
	if (Math.abs(candidate_name.length - query_name.length) > 1)
		return false;
	const [shorter, longer] = candidate_name.length <= query_name.length ? [candidate_name, query_name] : [query_name, candidate_name];
	let shorter_index = 0;
	let edit_count = 0;
	for (const longer_character of longer) {
		if (shorter[shorter_index] === longer_character)
			shorter_index += 1;
		else if (++edit_count > 1)
			return false;
		else if (shorter.length === longer.length)
			shorter_index += 1;
	}
	return true;
};

const isNearMiss = (candidate_name, query_name) => {
	const lowered_candidate = candidate_name.toLowerCase();
	const lowered_query = query_name.trim().toLowerCase();
	if (lowered_candidate === lowered_query || lowered_candidate.startsWith(lowered_query) || lowered_query.startsWith(lowered_candidate))
		return true;
	return lowered_query.length >= MIN_TYPO_LENGTH && withinOneEdit(lowered_candidate, lowered_query);
};

const collectCandidates = (names, query_name) => {
	const candidates = [];
	for (const name of names) {
		if (candidates.length === MAX_CANDIDATES)
			return candidates;
		if (isNearMiss(name, query_name))
			candidates.push(name);
	}
	return candidates;
};

/**
 * Resolves a gene symbol against the gene map DELPHI already holds. Exact match
 * only. The model supplies the symbol because recognising one is a task it is
 * good at; the coordinates come from this table because recalling one is a task
 * it is bad at.
 */
export const resolveGene = (gene_map, gene_symbol) => {
	if (!isUsableQuery(gene_symbol))
		return unresolvedResult([]);
	const gene_entry = gene_map.get(gene_symbol.trim());
	if (gene_entry)
		return resolvedResult({ gene_symbol: gene_symbol.trim(), chr: gene_entry.chr, start: gene_entry.start });
	return unresolvedResult(collectCandidates(gene_map.keys(), gene_symbol));
};

export const resolvePopulation = (population_labels, population_label) => {
	if (!isUsableQuery(population_label))
		return unresolvedResult([]);
	if (population_labels.includes(population_label.trim()))
		return resolvedResult(population_label.trim());
	return unresolvedResult(collectCandidates(population_labels, population_label));
};
