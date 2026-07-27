import { getOptions } from '/apc/common.js';
import { getPopsData } from '/browser/pops.js';
import { loadGeneMap } from '/assets.js';
import { parseRegion } from '/browser/region.js';
import { resolveGene, resolvePopulation, RESOLVED } from '/assistant/resolvers.js';
import { reply, failure, actionMessage, resolutionMessage } from '/assistant/messages.js';
import { setMeasure, setSort, navigateToRegion, navigateToGene, addPopulations, replacePopulations, setAnnotations } from '/assistant/actions.js';

export const HELP = 'Commands: measure <name>, sort <field> <asc|desc>, region <chrN:start-end>, gene <NAME>, add <label>, replace <label>, annotation <id>. Anything else goes to the model.';

const parseCommand = line => {
	const trimmed = line.trim();
	const separator = trimmed.indexOf(' ');
	if (separator === -1)
		return { command: trimmed.toLowerCase(), argument: '' };
	return { command: trimmed.slice(0, separator).toLowerCase(), argument: trimmed.slice(separator + 1).trim() };
};

const runGene = async gene_name => {
	const gene_track_id = (getOptions().annotations || [])[0];
	if (!gene_track_id)
		return failure('No gene track is active, so gene names cannot be resolved.');
	const gene_map = await loadGeneMap({ track_id: gene_track_id });
	const resolution = resolveGene(gene_map, gene_name);
	if (resolution.status !== RESOLVED)
		return resolutionMessage(resolution, 'gene', gene_name);
	return actionMessage(navigateToGene(resolution.matches[0]));
};

const runPopulation = async (population_label, populationAction) => {
	const populations = await getPopsData();
	const resolution = resolvePopulation(populations, population_label);
	if (resolution.status !== RESOLVED)
		return resolutionMessage(resolution, 'population', population_label);
	return actionMessage(populationAction([resolution.matches[0]]));
};

const runRegion = region_string => {
	const parsed_region = parseRegion(region_string);
	if (!parsed_region)
		return failure('Could not read that region. Use chr2:136545000-136594000.');
	return actionMessage(navigateToRegion(parsed_region.chr, parsed_region.start, parsed_region.end));
};

const runSort = argument => {
	const parts = argument.split(/\s+/);
	if (parts.length !== 2)
		return failure('Sort needs a field and a direction, for example: sort time asc');
	return actionMessage(setSort(parts[0], parts[1]));
};

const COMMAND_RUNNERS = {
	measure: argument => actionMessage(setMeasure(argument)),
	sort: runSort,
	region: runRegion,
	gene: runGene,
	add: argument => runPopulation(argument, addPopulations),
	replace: argument => runPopulation(argument, replacePopulations),
	annotation: argument => actionMessage(setAnnotations([argument]))
};

export const isTypedCommand = line => Object.prototype.hasOwnProperty.call(COMMAND_RUNNERS, parseCommand(line).command);

/**
 * Routes one typed command through the resolvers to the action layer, with no
 * model in the path. It is the deterministic route the model path feeds, kept
 * as the way to exercise an action without spending the model's budget and to
 * tell a routing failure apart from a model failure.
 */
export const runCommand = async line => {
	const { command, argument } = parseCommand(line);
	const runner = COMMAND_RUNNERS[command];
	if (!runner)
		return failure(`Did not understand that. ${HELP}`);
	if (argument === '')
		return failure(`${command} needs an argument. ${HELP}`);
	return runner(argument);
};
