import { MEASURE_LABELS, SORT_FIELD_LABELS } from '/assistant/vocabulary.js';

const KIND_LABELS = {
	gene: 'gene',
	population: 'population',
	annotation: 'annotation',
	statistic: 'statistic',
	sort: 'sort option',
	region: 'region',
	state: 'state field'
};

const formatPosition = position => Number(position).toLocaleString('en-US');

const formatRegion = detail => `${detail.chr}:${formatPosition(detail.start)}-${formatPosition(detail.end)}`;

const formatList = items => items.map((item, index) => `${index + 1}) ${item}`).join('  ');

export const NOT_UNDERSTOOD = 'I did not understand that. I can change the statistic, the sort, the region, the gene, the populations or the annotation track.';

export const NO_MODEL = 'I could not start the local model, so I only understand direct commands such as chr2:136545000-136594000, fst, sort by time, or a gene name.';

export const THINKING = 'Working on it.';

/**
 * Wording for a resolver near miss. The candidates are the code-held names the
 * request came close to, numbered so the user can pick one by number and the
 * exact name is used rather than what was typed.
 */
export const nearMiss = (kind, query, candidates) => `I have no ${KIND_LABELS[kind]} called "${query}". Did you mean:  ${formatList(candidates)}`;

export const noMatch = (kind, query) => `I have no ${KIND_LABELS[kind]} called "${query}".`;

const OK_MESSAGES = {
	go_to_region: detail => `Moved to ${formatRegion(detail)}.`,
	go_to_gene: detail => `Moved to ${detail.gene_name} at ${formatRegion(detail)}.`,
	set_statistic: detail => `Now showing ${MEASURE_LABELS[detail.measure]}.`,
	set_sort: detail => `Sorted by ${SORT_FIELD_LABELS[detail.sort]}, ${detail.sort_dir === 'desc' ? 'descending' : 'ascending'}.`,
	add_populations: detail => `Added ${detail.populations.length === 1 ? detail.populations[0] : `to the selection, now ${detail.populations.length} populations`}.`,
	replace_populations: detail => `Now showing ${detail.populations.length === 1 ? detail.populations[0] : `${detail.populations.length} populations`}.`,
	set_annotation: detail => `Added the ${detail.annotations[detail.annotations.length - 1]} track.`
};

const UNCHANGED_MESSAGES = {
	set_statistic: () => 'That statistic is already selected.',
	set_sort: () => 'The tracks are already sorted that way.',
	add_populations: () => 'Those populations are already selected.',
	replace_populations: () => 'Those populations are already selected.',
	set_annotation: () => 'That annotation track is already shown.'
};

const unchangedMessage = result => UNCHANGED_MESSAGES[result.action] ? UNCHANGED_MESSAGES[result.action](result.detail) : 'Nothing needed to change.';

/**
 * Turns a typed action result into one line of user-facing text. Only code
 * chooses this wording; the model never writes anything the user reads.
 */
export const actionMessage = result => {
	if (result.status === 'ok')
		return OK_MESSAGES[result.action](result.detail);
	if (result.status === 'unchanged')
		return unchangedMessage(result);
	if (result.status === 'invalid')
		return `I cannot do that: ${result.detail}.`;
	return 'I tried, but the view did not change.';
};

export const stateAnswer = (state_field, value) => `${state_field}: ${value}`;

export const filterEmpty = filter_text => `Nothing matches ${filter_text}.`;

export const filterApplied = (filter_text, count) => `${count} population${count === 1 ? '' : 's'} match ${filter_text}.`;
