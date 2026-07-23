import { getOptions } from '/apc/common.js';

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
	'You are the assistant for DELPHI, a genome browser for population genetics.',
	'Translate the user request into a short reply and a list of proposed actions that drive the browser.',
	'Only propose actions that match the request.',
	'',
	'Available actions:',
	'- select_populations: choose existing populations by exact label. args: { labels: [string] }',
	'- create_population: build a new population from ancient DNA samples by region and age. args: { label, region, date_start_kya, date_end_kya }. region is one of: Africa, Europe, Middle East, Central/South Asia, East Asia, Oceania, America.',
	'- set_measure: set the statistic shown. args: { measure } one of: heterozygosity, fst, tajimasd, fulif.',
	'- navigate_to_gene: move the view to a gene by exact symbol. args: { gene_symbol }',
	'- navigate_to_region: move the view to explicit coordinates. args: { chr, start, end }',
	'- set_sort: order the tracks by a metadata field. args: { field, direction }. direction is asc or desc. field is one of: time, Distance_from_Africa, Latitude, Longitude, Temperature_index, Precipitation_index, Agriculture_extensiveness, Urbanization_onset, genetic_distance, signal.',
	'- set_window: set the genomic window size in base pairs. args: { size } one of: 10000, 100000, 1000000.',
	'- clear_populations: remove all selected populations. args: {}',
	'',
	'Guidance:',
	'- Prefer select_populations with an exact existing population label. Use create_population only when no existing population matches.',
	'- Modern populations come from the gnomAD dataset. Ancient populations come from the AADR dataset.',
	'- For a request about a gene under selection or a phenotype, choose a specific gene from your own knowledge (for example LCT, EDAR, SLC24A5, HERC2, ACKR1, TYR, MC1R) and pass its exact symbol to navigate_to_gene. DELPHI has no gene category lookup, only exact symbols.',
	'- Do not convert a gene name to coordinates yourself. Pass the gene symbol to navigate_to_gene and let DELPHI resolve the exact position. Use navigate_to_region only when the user gives explicit coordinates. DELPHI uses the hg19 assembly.',
	'- If the request is ambiguous, put a clarifying question in reply and leave proposed_actions empty.'
].join('\n');

const formatCurrentState = current_state => {
	const region = `${current_state.chr}:${current_state.start}-${current_state.end}`;
	const populations = current_state.populations.length ? current_state.populations.join(', ') : 'none';
	return `measure: ${current_state.measure}; region: ${region}; selected populations: ${populations}`;
};

export const buildSystemPrompt = current_state =>
	`${PROMPT_HEADER}\n\nCurrent browser state:\n${formatCurrentState(current_state)}`;

export const gatherContext = () => {
	'Read the current browser state used to ground the system prompt.';
	const options = getOptions();
	const current_state = {
		measure: options.measure,
		chr: options.chr,
		start: options.start,
		end: options.end,
		populations: options.populations
	};
	return { current_state };
};
