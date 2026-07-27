import { startModel, generate, MODEL_METADATA } from '/assistant/model.js';
import { COMMAND_SCHEMA } from '/assistant/schemas.js';
import { buildMessages } from '/assistant/prompt.js';
import { DEV_SET, HELD_OUT_SET } from '/assistant/eval_set.js';

const FREE_TEXT_KEYS = ['gene_name', 'population_label'];

const parseCommand = raw_text => {
	try {
		return JSON.parse(raw_text);
	} catch (error) {
		return null;
	}
};

const freeTextName = command => {
	const key = FREE_TEXT_KEYS.find(name_key => typeof command[name_key] === 'string' && command[name_key] !== '');
	return key === undefined ? '' : command[key];
};

const probe = async (engine, serialized_state, item) => {
	const started_at = performance.now();
	const raw_text = await generate(engine, buildMessages(serialized_state, item.utterance), COMMAND_SCHEMA);
	const command = parseCommand(raw_text);
	const action = command && typeof command.action === 'string' ? command.action : 'unparseable';
	return { utterance: item.utterance, expected: item.expected, action, passed: action === item.expected, hard: Boolean(item.hard), extracted: command === null ? '' : freeTextName(command), ms: Math.round(performance.now() - started_at) };
};

const rate = rows => rows.length === 0 ? null : Number((rows.filter(row => row.passed).length / rows.length).toFixed(2));

const byAction = rows => Object.fromEntries([...new Set(rows.map(row => row.expected))].map(expected => {
	const group = rows.filter(row => row.expected === expected);
	return [expected, { tasks: group.length, passed: group.filter(row => row.passed).length, rate: rate(group) }];
}));

const runSet = async (engine, set_name, items) => {
	console.log(`--- ${set_name}, ${items.length} utterances ---`);
	const rows = [];
	for (const item of items) {
		const row = await probe(engine, '', item);
		console.log(`${row.passed ? 'pass' : 'FAIL'} ${row.ms}ms  ${row.utterance}  ->  ${row.action}${row.extracted ? ` (${row.extracted})` : ''}`);
		rows.push(row);
	}
	return rows;
};

const summarize = (set_name, rows) => {
	const latencies = rows.map(row => row.ms).sort((left, right) => left - right);
	console.log(`${set_name}: overall ${rate(rows)}, excluding hard ${rate(rows.filter(row => !row.hard))}, latency p50 ${latencies[Math.floor(latencies.length / 2)]}ms max ${latencies[latencies.length - 1]}ms`);
	console.table(byAction(rows));
};

/**
 * Runs both sets against one engine, no state in the prompt, and reports each
 * separately.
 *
 * The held-out number is the one that means anything. The development number
 * is reported beside it because a prompt change that does not move the set it
 * was written against has not done what it claimed, and because a large gap
 * between the two is the signature of a fix that memorised rather than
 * generalised.
 *
 * It acts on nothing: no option is written and no event dispatched.
 *
 *   (await import('/assistant/diagnose.js')).run()
 */
export const run = async () => {
	const engine = await startModel(progress => console.log(progress.text));
	console.log(`${MODEL_METADATA.model_id}, dev ${DEV_SET.length} + held-out ${HELD_OUT_SET.length} utterances`);
	const dev_rows = await runSet(engine, 'development (burned)', DEV_SET);
	const held_out_rows = await runSet(engine, 'held out', HELD_OUT_SET);
	summarize('development (burned)', dev_rows);
	summarize('held out', held_out_rows);
	return { dev: dev_rows, held_out: held_out_rows };
};
