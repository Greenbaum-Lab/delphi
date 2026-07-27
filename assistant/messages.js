import { OK, INVALID } from '/assistant/actions.js';
import { AMBIGUOUS } from '/assistant/resolvers.js';

const CONFIRMATIONS = {
	set_measure: 'Statistic set.',
	set_sort: 'Sort set.',
	navigate_to_region: 'Moved to the region.',
	navigate_to_gene: 'Moved to the gene.',
	add_populations: 'Populations added.',
	replace_populations: 'Populations replaced.',
	set_annotations: 'Annotation set.'
};

const REJECTIONS = {
	chr: 'That is not a chromosome DELPHI carries.',
	coordinates: 'Those coordinates do not fit that chromosome.',
	measure: 'That is not one of the four statistics.',
	sort: 'That sort field is not offered for the current statistic.',
	sort_dir: 'Sort direction must be asc or desc.',
	gene: 'That gene entry carries no usable position.',
	populations: 'No usable population was given.',
	annotations: 'No usable annotation was given.',
	browser: 'The browser module is not on the page.'
};

export const reply = message => ({ ok: true, message });

export const failure = message => ({ ok: false, message });

/**
 * Turns an action result into what the panel says. Code chooses the wording
 * from the failure type (D-035): a parameter the action refused and a write
 * DELPHI did not keep are different failures and read differently. The model
 * never writes a message, on either path.
 */
export const actionMessage = action_result => {
	if (action_result.status === OK)
		return reply(CONFIRMATIONS[action_result.action]);
	if (action_result.status === INVALID)
		return failure(REJECTIONS[action_result.detail]);
	return failure(`DELPHI did not keep the new ${action_result.detail}.`);
};

/**
 * Wording for a name that did not resolve. Several matches offer what was
 * found so the user can choose; a near miss offers the closest names back as a
 * question; nothing close says so plainly (D-035).
 *
 * Offering a name is not acting on it. The user's next message is what selects
 * one, which keeps the guarantee that nothing runs on a guessed name.
 */
export const resolutionMessage = (resolution, kind, name, suggestions) => {
	if (resolution.status === AMBIGUOUS)
		return failure(`${name} matches ${resolution.matches.length} ${kind} records. Name one of them exactly.`);
	if (suggestions.length > 0)
		return failure(`No ${kind} named ${name}. Did you mean ${suggestions.join(', ')}?`);
	return failure(`No ${kind} named ${name}.`);
};
