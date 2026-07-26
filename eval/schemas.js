export const CLARIFY = 'clarify';
export const MEASURES = ['heterozygosity', 'fst', 'tajimasd', 'fulif'];
export const SORT_FIELDS = ['Distance_from_Africa', 'genetic_distance', 'time', 'Temperature_index', 'Precipitation_index'];
export const STATE_FIELDS = ['chr', 'region', 'viewfinder', 'zoom', 'window', 'mode', 'measure', 'sort', 'sort_dir', 'guides', 'ylimits', 'populations', 'annotations'];
export const ACTIONS = ['navigate', 'select_gene', 'select_statistic', 'select_population', 'select_sort', 'answer_state', CLARIFY];

const objectSchema = properties => ({ type: 'object', properties, required: ['action'], additionalProperties: false });

const actionEnum = action_name => ({ type: 'string', enum: [action_name, CLARIFY] });

export const SCHEMAS = {
	classify: objectSchema({ action: { type: 'string', enum: ACTIONS } }),
	navigate: objectSchema({ action: actionEnum('navigate'), chr: { type: 'string' }, start: { type: 'integer' }, end: { type: 'integer' } }),
	select_gene: objectSchema({ action: actionEnum('select_gene'), gene_name: { type: 'string' } }),
	select_statistic: objectSchema({ action: actionEnum('select_statistic'), measure: { type: 'string', enum: MEASURES } }),
	select_population: objectSchema({ action: actionEnum('select_population'), population_label: { type: 'string' } }),
	answer_state: objectSchema({ action: actionEnum('answer_state'), field: { type: 'string', enum: STATE_FIELDS }, value: { type: 'string' } })
};

export const REQUIRED_PARAMETERS = {
	classify: [],
	navigate: ['chr', 'start', 'end'],
	select_gene: ['gene_name'],
	select_statistic: ['measure'],
	select_population: ['population_label'],
	answer_state: ['field', 'value']
};
