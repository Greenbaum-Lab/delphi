import { makeTask } from './task.js';
import { CLARIFY, MEASURES } from './schemas.js';

const CLASSIFY_CASES = [
	['navigate', ['go to chr1:1000000-2000000', 'take me to chr2 500000 to 900000', 'jump to position 4200941 on chr8']],
	['select_gene', ['show me BRCA1', 'find the gene TP53', 'go to gene DDX11L1']],
	['select_statistic', ['switch to FST', 'show tajimas d', 'display heterozygosity']],
	['select_population', ['add the Basque population', 'select San', 'include Russian']],
	['select_sort', ['sort the tracks by time', 'order the tracks by temperature index', 'sort by distance from africa']],
	['answer_state', ['which statistic am I viewing', 'what chromosome is shown', 'how many populations are selected']],
	[CLARIFY, ['show me the interesting part', 'do the thing', 'make it better', 'what about that one', 'fix this']]
];

const MEASURE_NAMES = { heterozygosity: 'heterozygosity', fst: 'FST', tajimasd: "Tajima's D", fulif: 'Fu and Li F' };

const MEASURE_PHRASINGS = [
	measure_name => `switch to ${measure_name}`,
	measure_name => `show me ${measure_name}`,
	measure_name => `display the ${measure_name} track`,
	measure_name => `i want to see ${measure_name.toLowerCase()}`
];

const UNAVAILABLE_MEASURES = ['nucleotide diversity pi', 'linkage disequilibrium', 'allele frequency spectrum'];

const ANSWER_CASES = [
	['chr', ['which chromosome am I on', 'what chromosome is displayed']],
	['region', ['what region is shown', 'which coordinates am I viewing']],
	['zoom', ['what zoom level is this', 'which zoom level am I at']],
	['window', ['what is the window size', 'what bin size is in use']],
	['mode', ['what mode am I in', 'which data mode is active']],
	['measure', ['which statistic am I viewing', 'what measure is displayed']],
	['sort', ['what are the tracks sorted by', 'which sort field is active']],
	['sort_dir', ['what direction are the tracks sorted', 'is the sort ascending or descending']],
	['guides', ['are the coordinate guides on', 'is the guide setting enabled']],
	['populations', ['how many populations are selected', 'what is the population count']],
	['annotations', ['how many annotation tracks are active', 'what is the annotation count']],
	['viewfinder', ['what are the viewfinder bounds', 'which range does the viewfinder cover']]
];

const OUT_OF_SCOPE_QUESTIONS = ['what is the value at position 2000000', 'what is the heterozygosity here', 'which population has the highest value', 'generate a population from the ancient samples'];

const isUnusable = value => value === '?' || value === '-' || String(value).endsWith('~');

const classifyTasks = fixture => CLASSIFY_CASES.flatMap(([expected_action, utterances]) => utterances.map((utterance, phrasing_index) => makeTask({
	task_type: 'T-classify',
	schema_name: 'classify',
	fixture,
	template_id: `intent.${expected_action}`,
	phrasing_index,
	utterance,
	expected: { action: expected_action },
	comparators: {},
	edge: expected_action === CLARIFY
})));

const measureTasks = fixture => MEASURES.flatMap(measure => MEASURE_PHRASINGS.map((phrase, phrasing_index) => makeTask({
	task_type: 'T-select-statistic',
	schema_name: 'select_statistic',
	fixture,
	template_id: `statistic.${measure}`,
	phrasing_index,
	utterance: phrase(MEASURE_NAMES[measure]),
	expected: { action: 'select_statistic', measure },
	comparators: { measure: 'exact' },
	edge: false
})));

const unavailableMeasureTasks = fixture => UNAVAILABLE_MEASURES.map((measure_name, phrasing_index) => makeTask({
	task_type: 'T-select-statistic',
	schema_name: 'select_statistic',
	fixture,
	template_id: 'statistic.unavailable',
	phrasing_index,
	utterance: `switch to ${measure_name}`,
	expected: { action: CLARIFY },
	comparators: {},
	edge: true
}));

const answerTask = (fixture, field, utterance, phrasing_index) => {
	const header_value = fixture.parsed_state.header[field];
	const unusable = isUnusable(header_value);
	return makeTask({
		task_type: 'T-answer-state',
		schema_name: 'answer_state',
		fixture,
		template_id: `answer.${field}`,
		phrasing_index,
		utterance,
		expected: unusable ? { action: CLARIFY } : { action: 'answer_state', field, value: header_value },
		comparators: unusable ? {} : { field: 'exact', value: 'exact' },
		edge: unusable
	});
};

const answerTasks = fixture => ANSWER_CASES.flatMap(([field, utterances]) => utterances.map((utterance, phrasing_index) => answerTask(fixture, field, utterance, phrasing_index)));

const outOfScopeTasks = fixture => OUT_OF_SCOPE_QUESTIONS.map((utterance, phrasing_index) => makeTask({
	task_type: 'T-answer-state',
	schema_name: 'answer_state',
	fixture,
	template_id: 'answer.out_of_scope',
	phrasing_index,
	utterance,
	expected: { action: CLARIFY },
	comparators: {},
	edge: true
}));

export const INTENT_TEMPLATES = [
	classifyTasks,
	measureTasks,
	unavailableMeasureTasks,
	answerTasks,
	outOfScopeTasks
];
