import { getOptions } from '/apc/common.js';
import { getPopsData } from '/browser/pops.js';
import { loadGeneMap } from '/assets.js';
import { observeState } from '/assistant/state_observer.js';
import { buildMessages } from '/assistant/prompt.js';
import { COMMAND_SCHEMA, CLARIFY } from '/assistant/schemas.js';
import { startModel, generate } from '/assistant/model.js';
import { resolveGene, resolvePopulation, RESOLVED } from '/assistant/resolvers.js';
import { suggestNames } from '/assistant/suggest.js';
import { answerField } from '/assistant/state_answers.js';
import { reply, failure, actionMessage, resolutionMessage } from '/assistant/messages.js';
import { setMeasure, setSort, navigateToRegion, navigateToGene, addPopulations, replacePopulations } from '/assistant/actions.js';

const OFF_TOPIC = 'That is not what this assistant is for. It drives the DELPHI browser: genes, regions, statistics, populations and sort order.';

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
		return resolutionMessage(resolution, 'population', population_label, suggestNames(populations.map(population => population.label), population_label));
	return actionMessage(populationAction([resolution.matches[0]]));
};

/**
 * Weak path. The model reaches this branch for 1 request in 6 that should
 * reach it (assistant/MEASUREMENTS.md, run 4), so plain-language gene
 * navigation does not work. Everything below the model is sound: exact-match
 * resolution refuses whatever a misfire produces, and the typed command
 * `gene NAME` reaches the same code with no model in the path.
 */
const actOnGene = async gene_name => {
	const gene_track_id = (getOptions().annotations || [])[0];
	if (!gene_track_id)
		return failure('No gene track is active, so gene names cannot be resolved.');
	const gene_map = await loadGeneMap({ track_id: gene_track_id });
	const resolution = resolveGene(gene_map, gene_name);
	if (resolution.status !== RESOLVED)
		return resolutionMessage(resolution, 'gene', gene_name, suggestNames([...gene_map.keys()], gene_name));
	return actionMessage(navigateToGene(resolution.matches[0]));
};

/**
 * Weak path. Also 1 in 6 in run 4, having measured 1.00 one run earlier. The
 * regression arrived with the action rename and the scoped question rule in the
 * same change, so which of the two caused it is unattributed and needs a set
 * that has not been spent. Reading the value is not the problem; choosing this
 * branch is.
 */
const answerState = async field => {
	const observed_state = await observeState();
	const value = answerField(observed_state, field);
	return value === null ? failure(MALFORMED) : reply(`${field}: ${value}`);
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
export const applyCommand = command => {
	switch (command.action) {
		case 'region': return actionMessage(navigateToRegion(command.chr, command.start, command.end));
		case 'gene': return actOnGene(command.gene_name);
		case 'statistic': return actionMessage(setMeasure(command.measure));
		case 'sort': return actionMessage(setSort(command.sort_field, command.sort_direction));
		case 'add_population': return resolveAndAct(command.population_label, addPopulations);
		case 'replace_population': return resolveAndAct(command.population_label, replacePopulations);
		case 'question': return answerState(command.field);
		default: return failure(OFF_TOPIC);
	}
};

/**
 * One request, one model call. The model classifies and extracts; routing,
 * resolution, validation, verification and the wording of every reply are
 * ordinary code, which is where they belong.
 *
 * The model is shown no state. Measured on 26 held-out utterances, the same
 * engine scored 0.62 without the state block against 0.38 with it, better on
 * four capabilities and worse on none, 16 percent faster, and the six borrowed
 * names fell to zero: with the block present the model answered with values it
 * could see, gencode19_genes and heterozygosity, for requests naming neither.
 *
 * It needs no state to do its job. It picks an action and extracts a name from
 * the request, and a state question needs only the field name, whose value
 * answerState reads afterwards. A consequence worth keeping: no string of data
 * provenance now reaches the prompt on any turn, so the injection surface T-2
 * reasons about is closed structurally rather than by a fence.
 */
export const route = async utterance => {
	const engine = await startModel();
	const raw_text = await generate(engine, buildMessages('', utterance), COMMAND_SCHEMA);
	const command = parseCommand(raw_text);
	if (!command || typeof command.action !== 'string')
		return failure(MALFORMED);
	if (command.action === CLARIFY)
		return failure(OFF_TOPIC);
	return applyCommand(command);
};
