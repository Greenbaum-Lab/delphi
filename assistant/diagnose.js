import { startModel, generate, MODEL_METADATA } from '/assistant/model.js';
import { COMMAND_SCHEMA } from '/assistant/schemas.js';
import { observeState } from '/assistant/state_observer.js';
import { serializeState } from '/assistant/state_serializer.js';
import { buildMessages } from '/assistant/prompt.js';
import { EVAL_SET } from '/assistant/eval_set.js';

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

/**
 * A borrowed name is a free-text name the model lifted out of the state block
 * instead of the request. Closed enums are excluded deliberately: measure,
 * field and sort_field are grammar-constrained to valid values that also
 * appear in the state header, so counting those flags every correct answer.
 */
const borrowedName = (command, serialized_state) => {
	const name = command === null ? '' : freeTextName(command);
	return name !== '' && serialized_state.includes(name);
};

const probe = async (engine, serialized_state, item) => {
	const started_at = performance.now();
	const raw_text = await generate(engine, buildMessages(serialized_state, item.utterance), COMMAND_SCHEMA);
	const command = parseCommand(raw_text);
	const action = command && typeof command.action === 'string' ? command.action : 'unparseable';
	return { utterance: item.utterance, expected: item.expected, action, passed: action === item.expected, hard: Boolean(item.hard), extracted: command === null ? '' : freeTextName(command), borrowed: borrowedName(command, serialized_state), ms: Math.round(performance.now() - started_at) };
};

const rate = rows => rows.length === 0 ? null : Number((rows.filter(row => row.passed).length / rows.length).toFixed(2));

const byAction = rows => Object.fromEntries([...new Set(EVAL_SET.map(item => item.expected))].map(expected => {
	const group = rows.filter(row => row.expected === expected);
	return [expected, { tasks: group.length, passed: group.filter(row => row.passed).length, rate: rate(group) }];
}));

const runArm = async (engine, arm_name, serialized_state) => {
	console.log(`--- ${arm_name} (prompt state block: ${serialized_state.length} chars) ---`);
	const rows = [];
	for (const item of EVAL_SET) {
		const row = await probe(engine, serialized_state, item);
		console.log(`${row.passed ? 'pass' : 'FAIL'} ${row.ms}ms  ${row.utterance}  ->  ${row.action}${row.extracted ? ` (${row.extracted})` : ''}${row.borrowed ? '  BORROWED' : ''}`);
		rows.push(row);
	}
	return rows;
};

const summarize = (arm_name, rows) => {
	const latencies = rows.map(row => row.ms).sort((left, right) => left - right);
	console.log(`${arm_name}: overall ${rate(rows)}, excluding hard ${rate(rows.filter(row => !row.hard))}, borrowed ${rows.filter(row => row.borrowed).length}, latency p50 ${latencies[Math.floor(latencies.length / 2)]}ms max ${latencies[latencies.length - 1]}ms`);
	console.table(byAction(rows));
};

/**
 * Runs the held-out set twice against the same engine and the same utterances,
 * once with the serialized state in the prompt and once without it.
 *
 * The comparison exists because the first held-out run defaulted to values
 * visible in the state block, answering heterozygosity and gencode19_genes for
 * requests that named neither. The model needs no state to do its job: it picks
 * an action, extracts a name from the request, and for a state question picks
 * only the field name, which code then reads. If the without-state arm is not
 * worse, the block is costing prefill and supplying a wrong answer to copy.
 *
 * It acts on nothing: no option is written and no event dispatched.
 *
 *   (await import('/assistant/diagnose.js')).run()
 */
export const run = async () => {
	const engine = await startModel(progress => console.log(progress.text));
	const serialized_state = serializeState(await observeState());
	console.log(`${MODEL_METADATA.model_id}, ${EVAL_SET.length} held-out utterances, two arms`);
	const with_state = await runArm(engine, 'with state', serialized_state);
	const without_state = await runArm(engine, 'without state', '');
	summarize('with state', with_state);
	summarize('without state', without_state);
	return { with_state, without_state };
};
