import { startNamedModel, unloadModel, generateWithUsage } from '/assistant/model.js';
import { buildMessages } from '/assistant/prompt.js';
import { COMMAND_SCHEMA } from '/assistant/schemas.js';
import { SELECTION_SET } from '/assistant/eval_selection.js';

const CAPABILITY_STRIDE = 16;

const PER_CAPABILITY = 5;

/**
 * Five utterances from each of the eight capabilities, taken from the front of
 * each block of SELECTION_SET. Forty in all, and every one of them already has
 * a stateless result from run 5, so accuracy here is comparable to a baseline
 * rather than floating free.
 */
const probeItems = () => Array.from({ length: SELECTION_SET.length / CAPABILITY_STRIDE }, (unused, block) => block)
	.flatMap(block => SELECTION_SET.slice(block * CAPABILITY_STRIDE, block * CAPABILITY_STRIDE + PER_CAPABILITY));

const parseAction = raw_text => {
	try {
		return JSON.parse(raw_text).action;
	} catch (error) {
		return 'unparseable';
	}
};

/**
 * Appends one turn to a running conversation and returns the array to send.
 *
 * The first turn carries the system prompt; every later turn appends only the
 * new user message to everything that came before. WebLLM compares the request
 * against the conversation it already holds, and when the new one extends it,
 * prefills the last message alone and keeps the rest of the cache.
 */
const extend = (messages, utterance) => {
	const [system_message, user_message] = buildMessages('', utterance);
	return messages.length === 0 ? [system_message, user_message] : [...messages, user_message];
};

const runTurn = async (engine, messages, item) => {
	const started_at = performance.now();
	const { text, usage } = await generateWithUsage(engine, messages, COMMAND_SCHEMA);
	const action = parseAction(text);
	return { text, action, passed: action === item.expected, expected: item.expected, utterance: item.utterance, ms: Math.round(performance.now() - started_at), prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens };
};

const reportTurn = (turn_number, row) => console.log(`${String(turn_number).padStart(2)}. ${row.passed ? 'pass' : 'FAIL'} ${String(row.ms).padStart(6)}ms  prefill ${String(row.prompt_tokens).padStart(4)} tok  decode ${String(row.completion_tokens).padStart(3)} tok  ${row.utterance}  ->  ${row.action}`);

const rateFor = (rows, expected) => {
	const group = rows.filter(row => row.expected === expected);
	return `${group.filter(row => row.passed).length}/${group.length}`;
};

/**
 * What these same forty utterances scored stateless, read off run 5's
 * per-utterance output on the slow Intel machine. Printed beside the new result
 * so the comparison needs no second run and no memory of an earlier session.
 */
const STATELESS_BASELINE = 'stateless baseline on these 40: 30/40 = 0.75, p50 about 47800ms (gene 4/5, region 5/5, statistic 4/5, add_population 1/5, replace_population 4/5, sort 5/5, question 5/5, clarify 2/5)';

const summarize = rows => {
	const latencies = rows.map(row => row.ms).sort((left, right) => left - right);
	const prefills = rows.map(row => row.prompt_tokens);
	console.log(`\naccuracy ${rows.filter(row => row.passed).length}/${rows.length}, latency p50 ${latencies[Math.floor(latencies.length / 2)]}ms, min ${latencies[0]}ms, max ${latencies[latencies.length - 1]}ms`);
	console.log(`prefill tokens: first ${prefills[0]}, second ${prefills[1]}, last ${prefills[prefills.length - 1]}, total ${prefills.reduce((sum, count) => sum + count, 0)}`);
	[...new Set(rows.map(row => row.expected))].forEach(expected => console.log(`  ${expected}: ${rateFor(rows, expected)}`));
	console.log(`\n${STATELESS_BASELINE}`);
};

/**
 * Forty commands down one unbroken conversation, so the system prompt is read
 * once at the start and never again.
 *
 * The cost probe showed 570 tokens re-prefilled on every call, roughly 44 of
 * every 46 seconds on the slow machine. If the reuse works, prefill drops to
 * the length of one message after turn one and the whole fixed cost disappears.
 *
 * What it buys is measured against what it costs: the conversation is never
 * reset, so each turn sees every earlier turn, and accuracy here is directly
 * comparable to the stateless run because these same forty utterances were
 * scored there. A drop is the confusion that growing context was expected to
 * cause, and it is the reason to measure rather than assume.
 *
 * Watch the console for WebLLM's own line, "Multiround chatting, reuse
 * KVCache". If it does not appear, the reuse is not happening and the prefill
 * column will say so.
 *
 *   (await import('/assistant/session_probe.js')).probeSession()
 */
export const probeSession = async model_id => {
	const engine = await startNamedModel(model_id, progress => console.log(progress.text));
	const items = probeItems();
	console.log(`--- session probe, ${model_id}, ${items.length} turns, no reset ---`);
	let messages = [];
	const rows = [];
	for (const item of items) {
		messages = extend(messages, item.utterance);
		const row = await runTurn(engine, messages, item);
		messages = [...messages, { role: 'assistant', content: row.text }];
		reportTurn(rows.length + 1, row);
		rows.push(row);
	}
	summarize(rows);
	await unloadModel(engine);
	return rows;
};
