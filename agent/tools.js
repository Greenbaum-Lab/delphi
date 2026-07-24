import { getOptions } from '/apc/common.js';
import { getPopsData } from '/browser/pops.js';

export const RESPONSE_SCHEMA = {
	type: 'object',
	properties: {
		reply: { type: 'string' },
		proposed_actions: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					tool: {
						type: 'string',
						enum: ['select_populations', 'create_population', 'set_measure', 'navigate_to_gene', 'navigate_to_region', 'set_sort', 'set_window', 'clear_populations']
					},
					args: { type: 'object' }
				},
				required: ['tool', 'args']
			}
		}
	},
	required: ['reply', 'proposed_actions']
};

const PROMPT_HEADER = [
	'You are the assistant for DELPHI, an on-device genome browser for population genetics (human, hg19 assembly).',
	'Turn the user request into a short reply plus a list of browser actions.',
	'ALWAYS write one short sentence in reply, even when proposed_actions is empty.',
	'You cannot read files or data back. You only propose actions; the app resolves gene symbols, filters samples, and applies the changes.',
	'Only propose actions that match the request. Never invent population labels, gene coordinates, or field names.',
	'',
	'Available actions:',
	'- select_populations: show an exact set of existing populations. args: { labels: [string] }. This REPLACES the current selection, so list the full set you want shown. Use only labels from the catalog below; map an acronym or a misspelling to the nearest catalog label (for example YRI to Yoruba-1KGP).',
	'- create_population: build a new population from ancient DNA (AADR) samples. args: { label, region, date_start_kya, date_end_kya }. The app filters the samples by region and age; you only choose the range. region is one of: Africa, Europe, Middle East, Central/South Asia, East Asia, Oceania, America. date_start_kya and date_end_kya are thousands of years before present. Use only when no catalog population fits.',
	'- clear_populations: remove all selected populations. args: {}',
	'- set_measure: set the statistic shown. args: { measure } one of: heterozygosity, fst, tajimasd, fulif. Read "diversity" as heterozygosity and "differentiation" or "divergence" as fst (fst is pairwise and needs at least 2 populations). For "selection" or "sweep", ask whether to use tajimasd or fulif.',
	'- set_sort: order the tracks by a metadata field. args: { field, direction }. direction is asc or desc. field is one of: time, Distance_from_Africa, Latitude, Longitude, Temperature_index, Precipitation_index, Agriculture_extensiveness, Urbanization_onset, genetic_distance, signal.',
	'- set_window: set the genomic window size in base pairs. args: { size } one of: 10000, 100000, 1000000.',
	'- navigate_to_gene: move the view to a gene by exact symbol. args: { gene_symbol }. Pass the symbol only (for example LCT); the app resolves it to coordinates. For a gene under selection or a phenotype, choose a well-known gene from your own knowledge (for example LCT, EDAR, SLC24A5, HERC2, ACKR1, TYR, MC1R).',
	'- navigate_to_region: move the view to explicit coordinates. args: { chr, start, end } (for example chr4, 5000, 55000). Use only when the user gives coordinates; never convert a gene name to coordinates yourself.',
	'',
	'Guidance:',
	'- Prefer select_populations with exact catalog labels; use create_population only to build a new ancient group.',
	'- For a multi-step request, emit the actions in order (for example set the measure, then select populations, then navigate).',
	'- If the request is ambiguous or a tool value is missing, leave proposed_actions empty and put a short clarifying question in reply that lists the options.'
].join('\n');

const formatCatalog = catalog => {
	'List selectable population labels grouped by era so the model chooses exact existing labels.';
	const modern = catalog.filter(population => population.Dataset !== 'AADR').map(population => population.label);
	const ancient = catalog.filter(population => population.Dataset === 'AADR').map(population => population.label);
	const lines = [];
	if (modern.length)
		lines.push(`modern: ${modern.join(', ')}`);
	if (ancient.length)
		lines.push(`ancient (AADR): ${ancient.join(', ')}`);
	return lines.length ? lines.join('\n') : 'none loaded';
};

const formatCurrentState = current_state => {
	const region = `${current_state.chr}:${current_state.start}-${current_state.end}`;
	const populations = current_state.populations.length ? current_state.populations.join(', ') : 'none';
	return `measure: ${current_state.measure}; region: ${region}; window: ${current_state.window_size}; sort: ${current_state.sort} ${current_state.sort_dir}; selected populations: ${populations}`;
};

export const buildSystemPrompt = (current_state, catalog = []) =>
	`${PROMPT_HEADER}\n\nAvailable populations (choose labels from here):\n${formatCatalog(catalog)}\n\nCurrent browser state (what the user sees):\n${formatCurrentState(current_state)}`;

export const gatherContext = async () => {
	'Read the current browser state and the population catalog used to ground the system prompt.';
	const options = getOptions();
	const catalog = await getPopsData();
	const current_state = {
		measure: options.measure,
		chr: options.chr,
		start: options.start,
		end: options.end,
		sort: options.sort,
		sort_dir: options.sort_dir,
		window_size: options.window_size,
		populations: options.populations
	};
	return { current_state, catalog };
};
