const REGION_PATTERN = /(chr[0-9xym]+)\s*:\s*([0-9,]+)(?:\s*-\s*([0-9,]+))?/i;
const SCALED_NUMBER = /([0-9]+(?:\.[0-9]+)?)\s*(kb?|mb?)\b/gi;
const SCALES = { k: 1000, kb: 1000, m: 1000000, mb: 1000000 };

const MEASURE_WORDS = {
	heterozygosity: 'heterozygosity',
	diversity: 'heterozygosity',
	het: 'heterozygosity',
	fst: 'fst',
	differentiation: 'fst',
	divergence: 'fst',
	tajima: 'tajimasd',
	tajimasd: 'tajimasd',
	fulif: 'fulif'
};

const SORT_WORDS = {
	time: 'time',
	date: 'time',
	age: 'time',
	distance: 'Distance_from_Africa',
	'distance from africa': 'Distance_from_Africa',
	'genetic distance': 'genetic_distance',
	temperature: 'Temperature_index',
	precipitation: 'Precipitation_index',
	rainfall: 'Precipitation_index'
};

const STATE_WORDS = {
	statistic: 'measure',
	measure: 'measure',
	region: 'region',
	position: 'region',
	coordinates: 'region',
	chromosome: 'chr',
	zoom: 'zoom',
	window: 'window',
	mode: 'mode',
	sort: 'sort',
	order: 'sort',
	population: 'populations',
	populations: 'populations',
	annotation: 'annotations',
	annotations: 'annotations'
};

const DESCENDING_WORDS = /\b(descending|desc|reverse|reversed|highest|largest|furthest)\b/i;
const ASCENDING_WORDS = /\b(ascending|asc|lowest|smallest|nearest|closest)\b/i;
const REPLACE_WORDS = /\b(only|just|instead|replace|switch to)\b/i;

const command = (action, target, direction = null) => ({ action, target, direction });

const expandScales = text => text.replace(SCALED_NUMBER, (match, number, unit) => String(Math.round(Number(number) * SCALES[unit.toLowerCase()])));

const matchWordTable = (text, word_table) => {
	const lowered_text = text.toLowerCase();
	const matched_word = Object.keys(word_table).sort((first, second) => second.length - first.length).find(word => lowered_text.includes(word));
	return matched_word ? word_table[matched_word] : null;
};

export const readDirection = text => {
	if (DESCENDING_WORDS.test(text))
		return 'desc';
	return ASCENDING_WORDS.test(text) ? 'asc' : null;
};

const parseRegionCommand = text => {
	const region_match = expandScales(text).match(REGION_PATTERN);
	if (!region_match)
		return null;
	const start = region_match[2].replace(/,/g, '');
	const end = region_match[3] === undefined ? start : region_match[3].replace(/,/g, '');
	return command('go_to_region', `${region_match[1].toLowerCase()}:${start}-${end}`);
};

const parseStateCommand = text => {
	if (!/^(what|which|where)\b/i.test(text.trim()))
		return null;
	const state_field = matchWordTable(text, STATE_WORDS);
	return state_field ? command('answer_state', state_field) : null;
};

const parseSortCommand = text => {
	if (!/\bsort|\border by|\brank\b/i.test(text))
		return null;
	const sort_field = matchWordTable(text, SORT_WORDS);
	return sort_field ? command('set_sort', sort_field, readDirection(text)) : null;
};

const parseStatisticCommand = text => {
	const measure = matchWordTable(text, MEASURE_WORDS);
	return measure ? command('set_statistic', measure) : null;
};

const parseFilterCommand = text => {
	const filter_match = text.match(/\b(?:from|in|filter(?:\s+to)?|populations?\s+(?:in|from))\s+(.+)$/i);
	if (!filter_match)
		return null;
	return command('filter_populations', filter_match[1].trim());
};

const parsePopulationCommand = text => {
	const population_match = text.match(/\b(?:add|show|include|display|select|replace with|switch to)\s+(.+)$/i);
	if (!population_match)
		return null;
	const action = REPLACE_WORDS.test(text) ? 'replace_populations' : 'add_populations';
	return command(action, population_match[1].trim());
};

const parseBareToken = text => {
	const trimmed_text = text.trim();
	return /^[A-Za-z0-9_.-]{2,32}$/.test(trimmed_text) ? command('resolve_token', trimmed_text) : null;
};

const PARSERS = [parseRegionCommand, parseStateCommand, parseSortCommand, parseStatisticCommand, parseBareToken, parseFilterCommand, parsePopulationCommand];

/**
 * Turns a request into a command without a model, or returns null so the caller
 * falls through to one. Every word table here maps onto a closed enum this code
 * owns; no table maps onto a population, gene or annotation name, because those
 * are data and only exact resolution may name them.
 */
export const parseCommand = text => {
	if (typeof text !== 'string' || text.trim() === '')
		return null;
	for (const parser of PARSERS) {
		const parsed_command = parser(text);
		if (parsed_command)
			return parsed_command;
	}
	return null;
};
