import { getOptions } from '/apc/common.js';
import { getPopsData } from '/browser/pops.js';
import { loadGeneMap } from '/assets.js';
import { parseRegion } from '/browser/region.js';
import { resolveGene, resolvePopulation, RESOLVED, AMBIGUOUS } from '/assistant/resolvers.js';
import { setMeasure, setSort, navigateToRegion, navigateToGene, addPopulations, replacePopulations, setAnnotations, OK, INVALID } from '/assistant/actions.js';

export const HELP = 'Commands: measure <name>, sort <field> <asc|desc>, region <chrN:start-end>, gene <NAME>, add <label>, replace <label>, annotation <id>';

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

const reply = message => ({ ok: true, message });

const failure = message => ({ ok: false, message });

const parseCommand = line => {
	const trimmed = line.trim();
	const separator = trimmed.indexOf(' ');
	if (separator === -1)
		return { command: trimmed.toLowerCase(), argument: '' };
	return { command: trimmed.slice(0, separator).toLowerCase(), argument: trimmed.slice(separator + 1).trim() };
};

/**
 * Turns an action result into what the panel says. Code chooses the wording
 * from the failure type (D-035): a parameter the action refused and a write
 * DELPHI did not keep are different failures and read differently. Only the
 * verb is lowercased by the parser; an argument is never normalised, because
 * the resolvers match exactly.
 */
const actionMessage = action_result => {
	if (action_result.status === OK)
		return reply(CONFIRMATIONS[action_result.action]);
	if (action_result.status === INVALID)
		return failure(REJECTIONS[action_result.detail]);
	return failure(`DELPHI did not keep the new ${action_result.detail}.`);
};

/**
 * Wording for a name that did not resolve. Several matches offer what was
 * found so the user can choose; nothing found says so plainly (D-035).
 * Matching is exact, so a near miss arrives here as nothing found rather than
 * as a guess.
 */
const resolutionMessage = (resolution, kind, name) => {
	if (resolution.status === AMBIGUOUS)
		return failure(`${name} matches ${resolution.matches.length} ${kind} records. Name one of them exactly.`);
	return failure(`No ${kind} named ${name}. Names must match exactly, including case.`);
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

/**
 * Routes one typed command through the resolvers to the action layer. There is
 * no model in this path by design: it is the deterministic route a model call
 * will later feed, so proving it now means a later failure is the model's and
 * not the plumbing's.
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
