import { COLUMN_DESCRIPTIONS } from '/common.js';

/**
 * The browser's own vocabulary, which column_descriptions.json does not cover.
 * That file describes the 67 per-sample metadata columns; these are the terms
 * the assistant itself deals in.
 *
 * Entries marked below as read from the code are statements about what DELPHI
 * computes and can be checked against it. The rest are ordinary definitions of
 * the statistics and are the owner's to correct: they are user-facing science
 * wording, not behaviour.
 */
const ASSISTANT_TERMS = {
	heterozygosity: 'The chance that two alleles drawn at random from the population differ. Computed per population.',
	fst: 'Fixation index: how much genetic variation sits between populations rather than within them. It is computed between pairs, which is why the sort fields change when you select it.',
	tajimasd: 'Tajima\'s D: compares two estimates of nucleotide diversity. Values away from zero are read as evidence of selection or of a change in population size.',
	fulif: 'Fu and Li\'s F: a neutrality statistic built from the counts of singleton and shared variants.',
	time: 'The mean age of the samples in the population, in years before present.',
	Distance_from_Africa: 'Waypoint distance from Africa, computed from the population centroid. African populations are set to zero.',
	Temperature_index: 'The mean of the per-sample Temperature_index values for the population.',
	Precipitation_index: 'The mean of the per-sample Precipitation_index values for the population.',
	Urbanization_onset: 'The median of the per-sample Urbanization_onset values for the population.',
	Agriculture_extensiveness: 'The median of the per-sample Agriculture_extensiveness values for the population.',
	genetic_distance: 'Genetic distance from the focal population. Offered as a sort field only while fst is the statistic.',
	signal: 'Orders the tracks by the plotted values themselves rather than by a property of the populations.',
	zoom: 'The span of the visible window in base pairs. DELPHI moves between fixed zoom levels rather than any width.',
	window: 'The width of the bin each plotted value is computed over.',
	mode: 'Which dataset is drawn: present-day gnomAD data, or ancient DNA.',
	population: 'A group of samples DELPHI computes a statistic for. The catalogue holds 147.',
	annotation: 'A track of genomic features drawn beneath the plot, such as gencode19_genes.',
	gene: 'A named region of the genome. DELPHI resolves gene names against the active annotation track.'
};

const findKey = (entries, folded_term) => Object.keys(entries).find(name => name.toLowerCase() === folded_term);

const entryFor = (entries, folded_term) => {
	const key = findKey(entries, folded_term);
	return key ? { term: key, description: entries[key] } : null;
};

/**
 * Looks a term up, ours first and then the metadata columns, returning the
 * catalogue's own spelling alongside the text so the reply reads
 * Poseidon_ID rather than whatever case the user typed. Returns null when
 * nothing matches, so the caller falls through rather than inventing an answer.
 *
 * The text from column_descriptions.json is data of remote provenance. It
 * reaches the panel through textContent and never enters a prompt, so the
 * quarantine question CLAUDE.md section 7 raises does not arise: no model sees
 * it.
 */
export const defineTerm = async term => {
	if (typeof term !== 'string' || term.length === 0)
		return null;
	const folded_term = term.toLowerCase();
	const assistant_entry = entryFor(ASSISTANT_TERMS, folded_term);
	if (assistant_entry)
		return assistant_entry;
	return entryFor(await COLUMN_DESCRIPTIONS, folded_term);
};
