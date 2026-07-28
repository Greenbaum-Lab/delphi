export const MEASURES = ['heterozygosity', 'fst', 'tajimasd', 'fulif'];

export const SORT_FIELDS = ['Distance_from_Africa', 'genetic_distance', 'time', 'Temperature_index', 'Precipitation_index'];

export const SORT_DIRECTIONS = ['asc', 'desc'];

export const STATE_FIELDS = ['chr', 'region', 'zoom', 'window', 'mode', 'measure', 'sort', 'sort_dir', 'populations', 'annotations'];

export const NUMERIC_FIELDS = ['time', 'Distance_from_Africa', 'Temperature_index', 'Precipitation_index', 'Urbanization_onset', 'Agriculture_extensiveness', 'Latitude', 'Longitude'];

export const COMPARATORS = ['>=', '<=', '>', '<', '='];

export const POPULATION_INTENTS = ['add', 'replace'];

export const ACTIONS = [
	'go_to_region',
	'go_to_gene',
	'set_statistic',
	'set_sort',
	'add_populations',
	'replace_populations',
	'filter_populations',
	'set_annotation',
	'answer_state',
	'clarify'
];

export const MEASURE_LABELS = {
	heterozygosity: 'heterozygosity',
	fst: 'FST',
	tajimasd: "Tajima's D",
	fulif: "Fu and Li's F"
};

export const SORT_FIELD_LABELS = {
	Distance_from_Africa: 'distance from Africa',
	genetic_distance: 'genetic distance',
	time: 'time',
	Temperature_index: 'temperature',
	Precipitation_index: 'precipitation'
};
