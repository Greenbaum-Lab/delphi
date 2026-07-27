import { getOptions } from '/apc/common.js';
import { getPopsData } from '/browser/pops.js';
import { loadGeneMap } from '/assets.js';
import { observeState } from '/assistant/state_observer.js';
import { serializeState } from '/assistant/state_serializer.js';
import { buildMessages } from '/assistant/prompt.js';
import { COMMAND_SCHEMA, CLARIFY } from '/assistant/schemas.js';
import { startModel, generate } from '/assistant/model.js';
import { resolveGene, resolvePopulation, RESOLVED } from '/assistant/resolvers.js';
import { answerField } from '/assistant/state_answers.js';
import { reply, failure, actionMessage, resolutionMessage } from '/assistant/messages.js';
import { setMeasure, setSort, navigateToRegion, navigateToGene, addPopulations, replacePopulations } from '/assistant/actions.js';

const NOT_UNDERSTOOD = 'Did not understand that. Try naming a gene, a population, a region, a statistic or a sort field.';

const MALFORMED = 'The model did not return a usable command.';

const parseCommand = raw_text => {
	try {
		return JSON.parse(raw_text);
	} catch (error) {
		return null;
	}
};

const resolveAndAct = async (population_label, populationAction) => {
	const populations = await getPopsData();
	const resolution = resolvePopulation(populations, population_label);
	if (resolution.status !== RESOLVED)
		return resolutionMessage(resolution, 'population', population_label);
	return actionMessage(populationAction([resolution.matches[0]]));
};

const actOnGene = async gene_name => {
	const gene_track_id = (getOptions().annotations || [])[0];
	if (!gene_track_id)
		return failure('No gene track is active, so gene names cannot be resolved.');
	const gene_map = await loadGeneMap({ track_id: gene_track_id });
	const resolution = resolveGene(gene_map, gene_name);
	if (resolution.status !== RESOLVED)
		return resolutionMessage(resolution, 'gene', gene_name);
	return actionMessage(navigateToGene(resolution.matches[0]));
};

const answerState = (observed_state, field) => {
	const value = answerField(observed_state, field);
	return value === null ? failure(NOT_UNDERSTOOD) : reply(`${field}: ${value}`);
};

/**
 * Turns one model command into one message. Every branch ends in either an
 * action result or a resolution result, so the model's string is a lookup key
 * or a validated parameter and never reaches DELPHI as written (D-024, D-026).
 * The model chose the action; nothing here asks it what to do next.
 *
 * Exported so the whole decision table can be exercised with synthetic
 * commands, on hardware that cannot run the model at all.
 */
export const applyCommand = (command, observed_state) => {
	switch (command.action) {
		case 'navigate': return actionMessage(navigateToRegion(command.chr, command.start, command.end));
		case 'select_gene': return actOnGene(command.gene_name);
		case 'select_statistic': return actionMessage(setMeasure(command.measure));
		case 'select_sort': return actionMessage(setSort(command.sort_field, command.sort_direction));
		case 'add_population': return resolveAndAct(command.population_label, addPopulations);
		case 'replace_population': return resolveAndAct(command.population_label, replacePopulations);
		case 'answer_state': return answerState(observed_state, command.field);
		default: return failure(NOT_UNDERSTOOD);
	}
};

/**
 * One request, one model call. Code reads the state, serializes it, asks the
 * model for a single command, then resolves and acts on its own. The model
 * classifies and extracts; routing, resolution, validation, verification and
 * the wording of every reply are ordinary code, which is where they belong.
 */
export const route = async utterance => {
	const engine = await startModel();
	const observed_state = await observeState();
	const raw_text = await generate(engine, buildMessages(serializeState(observed_state), utterance), COMMAND_SCHEMA);
	const command = parseCommand(raw_text);
	if (!command || typeof command.action !== 'string')
		return failure(MALFORMED);
	if (command.action === CLARIFY)
		return failure(NOT_UNDERSTOOD);
	return applyCommand(command, observed_state);
};
