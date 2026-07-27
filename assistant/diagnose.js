import { startModel, generate, MODEL_METADATA } from '/assistant/model.js';
import { COMMAND_SCHEMA } from '/assistant/schemas.js';
import { observeState } from '/assistant/state_observer.js';
import { serializeState } from '/assistant/state_serializer.js';
import { buildMessages } from '/assistant/prompt.js';
import { EVAL_SET } from '/assistant/eval_set.js';

const NAME_KEYS = ['gene_name', 'population_label', 'measure', 'sort_field', 'field', 'chr'];

const parseCommand = raw_text => {
	try {
		return JSON.parse(raw_text);
	} catch (error) {
		return null;
	}
};

const extractedName = command => {
	const key = NAME_KEYS.find(name_key => command[name_key] !== undefined);
	return key === undefined ? '' : String(command[key]);
};

const probe = async (engine, serialized_state, item) => {
	const started_at = performance.now();
	const raw_text = await generate(engine, buildMessages(serialized_state, item.utterance), COMMAND_SCHEMA);
	const command = parseCommand(raw_text);
	const action = command && typeof command.action === 'string' ? command.action : 'unparseable';
	return { utterance: item.utterance, expected: item.expected, action, passed: action === item.expected, hard: Boolean(item.hard), extracted: command ? extractedName(command) : '', borrowed: Boolean(command) && serialized_state.includes(extractedName(command)) && extractedName(command) !== '', ms: Math.round(performance.now() - started_at) };
};

const rate = rows => rows.length === 0 ? null : Number((rows.filter(row => row.passed).length / rows.length).toFixed(2));

const byAction = rows => Object.fromEntries([...new Set(rows.map(row => row.expected))].map(expected => {
	const group = rows.filter(row => row.expected === expected);
	return [expected, { tasks: group.length, passed: group.filter(row => row.passed).length, rate: rate(group) }];
}));

/**
 * Runs the held-out set and reports per-action success, never one headline
 * number, because a pooled figure hides which capability is usable.
 *
 * borrowed flags an extracted name that appears verbatim in the state block.
 * That is the failure the first tuned run exposed, where the model answered
 * with DELPHI_STATE 1 and gencode19_genes as gene names, and it needs its own
 * count because exact-match resolution hides it behind an ordinary clarify.
 *
 * It acts on nothing: no option is written, no event dispatched, and every
 * utterance sees identical state.
 *
 *   (await import('/assistant/diagnose.js')).run()
 */
export const run = async () => {
	const engine = await startModel(progress => console.log(progress.text));
	const serialized_state = serializeState(await observeState());
	console.log(`${MODEL_METADATA.model_id}, ${EVAL_SET.length} held-out utterances, state ${serialized_state.length} chars`);
	const rows = [];
	for (const item of EVAL_SET) {
		const row = await probe(engine, serialized_state, item);
		console.log(`${row.passed ? 'pass' : 'FAIL'} ${row.ms}ms  ${row.utterance}  ->  ${row.action}${row.extracted ? ` (${row.extracted})` : ''}${row.borrowed ? '  BORROWED-FROM-STATE' : ''}`);
		rows.push(row);
	}
	const latencies = rows.map(row => row.ms).sort((left, right) => left - right);
	console.table(byAction(rows));
	console.log(`overall ${rate(rows)}, excluding hard ${rate(rows.filter(row => !row.hard))}, borrowed names ${rows.filter(row => row.borrowed).length}, latency p50 ${latencies[Math.floor(latencies.length / 2)]}ms max ${latencies[latencies.length - 1]}ms`);
	return rows;
};
