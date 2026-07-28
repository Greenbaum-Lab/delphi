import { MEASURES, SORT_FIELDS, SORT_DIRECTIONS, STATE_FIELDS } from '/assistant/vocabulary.js';

const MAX_CANDIDATES = 6;

const resolvedResult = entry => ({ status: 'resolved', entry, candidates: [] });

const unresolvedResult = candidates => ({ status: candidates.length > 0 ? 'ambiguous' : 'not_found', entry: null, candidates });

const isUsableQuery = query => typeof query === 'string' && query.trim().length > 0;

const MIN_TYPO_LENGTH = 4;

/**
 * True when two names differ by at most one character, which is what a typed
 * typo usually is. This decides only whether a name is worth offering back as a
 * question; it never decides what an action acts on.
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

/**
 * Collects the code-held names that a failed query came close to. These are
 * offered back to the user as a question, never applied. Whichever one the user
 * picks is still an exact member of the collection, so no name is ever derived
 * from what was typed.
 */
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
 * Resolves a gene name against the gene map DELPHI already holds, which is keyed
 * by gene name and holds a chromosome and a start coordinate. Exact match only.
 */
export const resolveGene = (gene_map, gene_name) => {
	if (!isUsableQuery(gene_name))
		return unresolvedResult([]);
	const gene_entry = gene_map.get(gene_name);
	if (gene_entry)
		return resolvedResult({ gene_name, chr: gene_entry.chr, start: gene_entry.start });
	return unresolvedResult(collectCandidates(gene_map.keys(), gene_name));
};

/**
 * Resolves a population label against the population catalogue. The returned
 * entry is the catalogue's own record, so every field an action later reads
 * came from DELPHI and not from the request.
 */
export const resolvePopulation = (population_records, population_label) => {
	if (!isUsableQuery(population_label))
		return unresolvedResult([]);
	const population_record = population_records.find(record => record.label === population_label);
	if (population_record)
		return resolvedResult(population_record);
	return unresolvedResult(collectCandidates(population_records.map(record => record.label), population_label));
};

export const resolveAnnotation = (annotation_labels, annotation_label) => {
	if (!isUsableQuery(annotation_label))
		return unresolvedResult([]);
	if (annotation_labels.includes(annotation_label))
		return resolvedResult(annotation_label);
	return unresolvedResult(collectCandidates(annotation_labels, annotation_label));
};

const resolveMember = (members, query) => {
	if (!isUsableQuery(query))
		return unresolvedResult([]);
	if (members.includes(query))
		return resolvedResult(query);
	return unresolvedResult(collectCandidates(members, query));
};

export const resolveMeasure = measure => resolveMember(MEASURES, measure);

export const resolveSortField = sort_field => resolveMember(SORT_FIELDS, sort_field);

export const resolveSortDirection = sort_dir => resolveMember(SORT_DIRECTIONS, sort_dir);

export const resolveStateField = state_field => resolveMember(STATE_FIELDS, state_field);

/**
 * Resolves one value of a data-derived metadata field, such as a region or a
 * country name. The candidate list is built from the values actually present in
 * the loaded metadata, so a value that no sample carries cannot resolve.
 */
export const resolveMetadataValue = (values, query) => resolveMember(values, query);
