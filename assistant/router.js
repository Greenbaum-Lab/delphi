import { getOptions } from '/apc/common.js';
import { parseRegion } from '/browser/region.js';
import { observeState } from '/assistant/state_observer.js';
import { resolveGene, resolvePopulation, resolveAnnotation, resolveMeasure, resolveSortField, resolveMetadataValue } from '/assistant/resolvers.js';
import { parseFilterExpression, selectByNumeric, selectByMetadata, listMetadataValues } from '/assistant/metadata_filter.js';
import { goToRegion, goToGene, setStatistic, setSort, addPopulations, replacePopulations, setAnnotation } from '/assistant/actions.js';
import { actionMessage, nearMiss, noMatch, stateAnswer, filterEmpty, filterApplied, NOT_UNDERSTOOD } from '/assistant/messages.js';

const MAX_FILTER_SELECTION = 12;

const reply = (message, pending = null) => ({ message, pending });

const unresolved = (kind, query, candidates, action) => candidates.length > 0 ? reply(nearMiss(kind, query, candidates), { action, kind, candidates }) : reply(noMatch(kind, query));

const splitLabels = target => target.split(/\s*(?:,|\band\b)\s*/).map(label => label.trim()).filter(label => label !== '');

const routeRegion = target => {
	const parsed_region = parseRegion(String(target));
	if (!parsed_region)
		return reply(NOT_UNDERSTOOD);
	return reply(actionMessage(goToRegion(parsed_region.chr, parsed_region.start, parsed_region.end)));
};

const routeGene = (catalogue, target) => {
	const resolution = resolveGene(catalogue.gene_map, target);
	if (resolution.status === 'resolved')
		return reply(actionMessage(goToGene(resolution.entry)));
	return unresolved('gene', target, resolution.candidates, 'go_to_gene');
};

/**
 * Resolves the target as one whole label before splitting it, because a
 * population label may itself contain a comma or the word and, and splitting
 * such a label would leave two halves that resolve to nothing.
 */
const resolvePopulations = (catalogue, target) => {
	const whole_resolution = resolvePopulation(catalogue.population_records, target.trim());
	if (whole_resolution.status === 'resolved')
		return [{ label: target.trim(), resolution: whole_resolution }];
	return splitLabels(target).map(label => ({ label, resolution: resolvePopulation(catalogue.population_records, label) }));
};

const routePopulations = (catalogue, target, population_action, action_name) => {
	const resolutions = resolvePopulations(catalogue, target);
	const failure = resolutions.find(entry => entry.resolution.status !== 'resolved');
	if (failure)
		return unresolved('population', failure.label, failure.resolution.candidates, action_name);
	return reply(actionMessage(population_action(resolutions.map(entry => entry.resolution.entry))));
};

const routeStatistic = target => {
	const resolution = resolveMeasure(target);
	if (resolution.status === 'resolved')
		return reply(actionMessage(setStatistic(resolution.entry)));
	return unresolved('statistic', target, resolution.candidates, 'set_statistic');
};

const routeSort = (target, direction) => {
	const resolution = resolveSortField(target);
	if (resolution.status === 'resolved')
		return reply(actionMessage(setSort(resolution.entry, direction || getOptions().sort_dir)));
	return unresolved('sort', target, resolution.candidates, 'set_sort');
};

const routeAnnotation = (catalogue, target) => {
	const resolution = resolveAnnotation(catalogue.annotation_labels, target);
	if (resolution.status === 'resolved')
		return reply(actionMessage(setAnnotation(resolution.entry)));
	return unresolved('annotation', target, resolution.candidates, 'set_annotation');
};

const metadataLabels = (catalogue, filter_value) => {
	for (const metadata_field of ['region', 'country']) {
		const resolution = resolveMetadataValue(listMetadataValues(catalogue.metadata_index, metadata_field), filter_value);
		if (resolution.status === 'resolved')
			return selectByMetadata(catalogue.metadata_index, metadata_field, resolution.entry);
	}
	return null;
};

const filteredLabels = (catalogue, filter) => filter.kind === 'numeric' ? selectByNumeric(catalogue.population_records, filter) : metadataLabels(catalogue, filter.value);

/**
 * Applies a metadata filter by selecting whole population records from the
 * catalogue. The model never sees the metadata and never names a population;
 * it supplies a field, a comparator and a number, or one region or country
 * value that has to be present in the loaded samples.
 */
const routeFilter = (catalogue, target) => {
	const filter = parseFilterExpression(target);
	const selected_labels = filter ? filteredLabels(catalogue, filter) : null;
	if (!selected_labels)
		return reply(NOT_UNDERSTOOD);
	if (selected_labels.length === 0)
		return reply(filterEmpty(target));
	if (selected_labels.length > MAX_FILTER_SELECTION)
		return reply(`${filterApplied(target, selected_labels.length)} That is too many tracks to draw at once, so narrow it down.`);
	const population_records = selected_labels.map(label => catalogue.population_records.find(record => record.label === label));
	return reply(`${filterApplied(target, selected_labels.length)} ${actionMessage(addPopulations(population_records))}`);
};

const STATE_READERS = {
	chr: observed_state => observed_state.display.chr,
	region: observed_state => `${observed_state.display.chr}:${observed_state.display.start}-${observed_state.display.end}`,
	zoom: observed_state => observed_state.display.zoom_level,
	window: observed_state => observed_state.display.window_size,
	mode: observed_state => observed_state.display.mode,
	measure: observed_state => observed_state.display.measure,
	sort: observed_state => observed_state.display.sort,
	sort_dir: observed_state => observed_state.display.sort_dir,
	populations: observed_state => observed_state.populations.map(population => population.label).join(', ') || 'none',
	annotations: observed_state => observed_state.annotations.active.join(', ') || 'none'
};

const routeState = async target => {
	if (!STATE_READERS[target])
		return reply(NOT_UNDERSTOOD);
	const observed_state = await observeState();
	return reply(stateAnswer(target, STATE_READERS[target](observed_state)));
};

const routeToken = (catalogue, target) => {
	const gene_resolution = resolveGene(catalogue.gene_map, target);
	if (gene_resolution.status === 'resolved')
		return reply(actionMessage(goToGene(gene_resolution.entry)));
	const population_resolution = resolvePopulation(catalogue.population_records, target);
	if (population_resolution.status === 'resolved')
		return reply(actionMessage(addPopulations([population_resolution.entry])));
	if (gene_resolution.candidates.length > 0)
		return unresolved('gene', target, gene_resolution.candidates, 'go_to_gene');
	return unresolved('population', target, population_resolution.candidates, 'add_populations');
};

/**
 * Routes one command to the resolvers and the action layer, and returns the
 * line the panel shows plus any candidate list the user may answer by number.
 * Every branch ends in either a validated action or a code-chosen question.
 */
export const routeCommand = async (catalogue, parsed_command) => {
	const { action, target, direction } = parsed_command;
	if (action === 'go_to_region')
		return routeRegion(target);
	if (action === 'go_to_gene')
		return routeGene(catalogue, target);
	if (action === 'set_statistic')
		return routeStatistic(target);
	if (action === 'set_sort')
		return routeSort(target, direction);
	if (action === 'add_populations')
		return routePopulations(catalogue, target, addPopulations, 'add_populations');
	if (action === 'replace_populations')
		return routePopulations(catalogue, target, replacePopulations, 'replace_populations');
	if (action === 'filter_populations')
		return routeFilter(catalogue, target);
	if (action === 'set_annotation')
		return routeAnnotation(catalogue, target);
	if (action === 'answer_state')
		return routeState(target);
	if (action === 'resolve_token')
		return routeToken(catalogue, target);
	return reply(NOT_UNDERSTOOD);
};
