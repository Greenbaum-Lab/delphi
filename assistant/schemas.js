import { CHR_LENGTHS } from '/common.js';
import { MEASURES, SORT_DIRECTIONS } from '/assistant/validation.js';
import { STATE_FIELDS } from '/assistant/state_answers.js';

export const CLARIFY = 'clarify';

const CHROMOSOMES = Object.keys(CHR_LENGTHS);

const actionSchema = (action_name, parameters) => ({
	type: 'object',
	properties: { action: { type: 'string', enum: [action_name] }, ...parameters },
	required: ['action', ...Object.keys(parameters)],
	additionalProperties: false
});

/**
 * The only shape the model may emit. One object, one action, every parameter
 * of that action required.
 *
 * Two things here are D-029's recorded harness defects fixed. Parameters are
 * required rather than optional, so the grammar cannot permit omitting one and
 * the model cannot drop the first-declared field while emitting the rest.
 * And clarify is a member of the union rather than a value inside every
 * action's enum, so choosing an action no longer leaves clarify reachable and
 * the clarify bias that contaminated the Gate 4a run has no route.
 *
 * chr is an enum of the 25 hg19 chromosomes, so an unknown chromosome is
 * unrepresentable rather than merely rejected later.
 */
export const COMMAND_SCHEMA = {
	anyOf: [
		actionSchema('select_gene', { gene_name: { type: 'string' } }),
		actionSchema('navigate', { chr: { type: 'string', enum: CHROMOSOMES }, start: { type: 'integer' }, end: { type: 'integer' } }),
		actionSchema('select_statistic', { measure: { type: 'string', enum: MEASURES } }),
		actionSchema('add_population', { population_label: { type: 'string' } }),
		actionSchema('replace_population', { population_label: { type: 'string' } }),
		actionSchema('select_sort', { sort_field: { type: 'string' }, sort_direction: { type: 'string', enum: SORT_DIRECTIONS } }),
		actionSchema('answer_state', { field: { type: 'string', enum: STATE_FIELDS } }),
		actionSchema(CLARIFY, {})
	]
};
