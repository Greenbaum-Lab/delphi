import { startNamedModel, unloadModel, generateWithUsage } from '/assistant/model.js';
import { buildMessages } from '/assistant/prompt.js';
import { COMMAND_SCHEMA } from '/assistant/schemas.js';

/**
 * Five requests chosen to vary output length while holding the system prompt
 * fixed. The last repeats the first, so an identical request is asked twice and
 * any reuse of work between them shows up as a difference between the two.
 */
const PROBE_UTTERANCES = ['hi', 'add BantuKenya', 'what is the zoom level', 'chr14:23000000-24000000', 'hi'];

const round = value => Math.round(value * 100) / 100;

const decodeSeconds = usage => usage.extra.decode_tokens_per_s > 0 ? usage.completion_tokens / usage.extra.decode_tokens_per_s : 0;

const probeOne = async (engine, utterance) => {
	const started_at = performance.now();
	const { usage } = await generateWithUsage(engine, buildMessages('', utterance), COMMAND_SCHEMA);
	return {
		utterance,
		ms: Math.round(performance.now() - started_at),
		prompt_tokens: usage.prompt_tokens,
		completion_tokens: usage.completion_tokens,
		grammar_s: round(usage.extra.grammar_init_s || 0),
		prefill_s: round(usage.extra.time_to_first_token_s),
		decode_s: round(decodeSeconds(usage)),
		prefill_rate: round(usage.extra.prefill_tokens_per_s),
		decode_rate: round(usage.extra.decode_tokens_per_s)
	};
};

const reportRow = row => console.log(`${String(row.ms).padStart(6)}ms  prefill ${String(row.prompt_tokens).padStart(4)} tok in ${String(row.prefill_s).padStart(6)}s at ${row.prefill_rate}/s  |  decode ${String(row.completion_tokens).padStart(3)} tok in ${String(row.decode_s).padStart(6)}s at ${row.decode_rate}/s  |  grammar ${row.grammar_s}s  |  ${row.utterance}`);

/**
 * States, in plain terms, what the numbers mean.
 *
 * The question is whether the roughly 585-token system prompt is prefilled on
 * every call. If prompt_tokens stays high and constant across five requests,
 * it is, and shortening the prompt cuts that cost proportionally. If it falls
 * after the first call, the runtime is already reusing it and prompt length is
 * not where the time goes.
 */
const verdict = rows => {
	const first_prompt_tokens = rows[0].prompt_tokens;
	const later_prompt_tokens = rows.slice(1).map(row => row.prompt_tokens);
	const reused = later_prompt_tokens.every(count => count < first_prompt_tokens / 2);
	console.log(`\nfirst call prefilled ${first_prompt_tokens} tokens; later calls prefilled ${later_prompt_tokens.join(', ')}`);
	console.log(reused
		? 'REUSED: the runtime is not re-reading the system prompt. Prompt length is not the fixed cost.'
		: 'RE-READ: the system prompt is prefilled on every call. Shortening it cuts the fixed cost in proportion.');
};

const shareOfTime = rows => {
	const total = rows.reduce((sum, row) => sum + row.ms, 0) / 1000;
	const grammar = rows.reduce((sum, row) => sum + row.grammar_s, 0);
	const prefill = rows.reduce((sum, row) => sum + row.prefill_s, 0);
	const decode = rows.reduce((sum, row) => sum + row.decode_s, 0);
	console.log(`\nover ${rows.length} calls, ${round(total)}s total: grammar ${round(grammar)}s, prefill ${round(prefill)}s, decode ${round(decode)}s, unaccounted ${round(total - grammar - prefill - decode)}s`);
};

/**
 * Splits one request into the three things it spends time on: compiling the
 * output grammar, reading the prompt, and writing the answer.
 *
 * Every timing before this was wall clock around the whole call, which is why
 * the 45-second floor on the slow machine could only be attributed by
 * inference. This reads the runtime's own counters instead.
 *
 * It acts on nothing: no option is written and no event dispatched. Five calls,
 * so it costs about a minute even on the slow machine.
 *
 *   (await import('/assistant/cost_probe.js')).probeCost()
 */
export const probeCost = async (model_id) => {
	const engine = await startNamedModel(model_id, progress => console.log(progress.text));
	console.log(`--- cost probe, ${model_id} ---`);
	const rows = [];
	for (const utterance of PROBE_UTTERANCES) {
		const row = await probeOne(engine, utterance);
		reportRow(row);
		rows.push(row);
	}
	verdict(rows);
	shareOfTime(rows);
	await unloadModel(engine);
	return rows;
};
