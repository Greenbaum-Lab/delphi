import { startModel, generate, MODEL_METADATA } from '/assistant/model.js';
import { COMMAND_SCHEMA } from '/assistant/schemas.js';
import { buildMessages } from '/assistant/prompt.js';
import { DEV_SET, HELD_OUT_SET, TEST_SET } from '/assistant/eval_set.js';

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
	Object.entries(byAction(rows)).forEach(([action, summary]) => console.log(`  ${set_name} ${action}: ${summary.passed}/${summary.tasks} = ${summary.rate}`));
};

/**
 * Runs both sets against one engine, no state in the prompt, and reports each
 * separately.
 *
 * TEST is the only unburned set and the only number worth quoting. The two
 * burned sets run beside it as controls: a change that does not move the sets
 * it was written against has not done what it claimed, and a run where those
 * rise while TEST does not is the signature of memorising.
 *
 * TEST runs first so a run cut short still produces the number that counts.
 *
 * It acts on nothing: no option is written and no event dispatched.
 *
 *   (await import('/assistant/diagnose.js')).run()
 */
export const run = async () => {
	const engine = await startModel(progress => console.log(progress.text));
	console.log(`${MODEL_METADATA.model_id}, ${DEV_SET.length + HELD_OUT_SET.length + TEST_SET.length} utterances over three sets`);
	const test_rows = await runSet(engine, 'TEST (unburned)', TEST_SET);
	const dev_rows = await runSet(engine, 'dev (burned)', DEV_SET);
	const held_out_rows = await runSet(engine, 'held-out round 2 (burned)', HELD_OUT_SET);
	summarize('TEST (unburned)', test_rows);
	summarize('dev (burned)', dev_rows);
	summarize('held-out round 2 (burned)', held_out_rows);
	return { test: test_rows, dev: dev_rows, held_out: held_out_rows };
};
