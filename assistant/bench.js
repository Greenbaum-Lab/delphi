import { startNamedModel, unloadModel, listModelIds } from '/assistant/model.js';
import { probeSet, summarize, confusion, checkExtractions, summarizeEndToEnd } from '/assistant/diagnose.js';
import { SELECTION_SET } from '/assistant/eval_selection.js';
import { FINAL_SET } from '/assistant/eval_final.js';

/**
 * The models compared. The first is the incumbent D-013 names. The second is
 * the candidate: a different family in the same memory class, chosen because
 * the failures being chased are instruction-following failures rather than
 * extraction failures. The third is out of scope for v1 by D-013 and is here as
 * a ceiling reading only, to show whether the remaining errors move with model
 * capability at all. If the 3B fails the same categories, no model swap is the
 * answer and the design is what needs changing.
 */
export const MODEL_CANDIDATES = [
	'Llama-3.2-1B-Instruct-q4f16_1-MLC',
	'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
	'Llama-3.2-3B-Instruct-q4f16_1-MLC'
];

const shortName = model_id => model_id.replace('-Instruct-q4f16_1-MLC', '');

/**
 * Confirms every candidate is loadable by the pinned WebLLM build before any
 * long run starts. A misspelled id costs nothing here and costs a whole arm
 * once loading has begun.
 */
export const checkCandidates = async () => {
	const available = await listModelIds();
	const missing = MODEL_CANDIDATES.filter(model_id => !available.includes(model_id));
	missing.forEach(model_id => console.log(`MISSING: ${model_id}`));
	MODEL_CANDIDATES.filter(model_id => available.includes(model_id)).forEach(model_id => console.log(`ok: ${model_id}`));
	return missing.length === 0;
};

const loadTimed = async model_id => {
	const started_at = performance.now();
	const engine = await startNamedModel(model_id, progress => console.log(progress.text));
	const load_ms = Math.round(performance.now() - started_at);
	console.log(`${shortName(model_id)} loaded in ${load_ms}ms`);
	return { engine, load_ms };
};

/**
 * One model against one set, loaded and released around the run so the next
 * candidate starts with the GPU to itself.
 *
 * This is the resumable unit. Three separate console calls are safer than one
 * long one, because a tab that dies halfway through compare() loses every arm
 * rather than the current one.
 */
export const benchOne = async (model_id, set_name, items) => {
	const { engine, load_ms } = await loadTimed(model_id);
	const label = `${shortName(model_id)} on ${set_name}`;
	const probed_rows = await probeSet(engine, label, items);
	const rows = await checkExtractions(probed_rows);
	summarize(label, rows);
	summarizeEndToEnd(label, rows);
	confusion(label, rows);
	await unloadModel(engine);
	return { model_id, set_name, load_ms, rows };
};

export const benchSelection = model_id => benchOne(model_id, 'SELECTION', SELECTION_SET);

/**
 * Every candidate against SELECTION_SET, one at a time, printing a comparison
 * once they have all run.
 *
 * Budget roughly an hour of wall clock for three models over 128 utterances,
 * plus a cold download per model. Nothing here writes an option or dispatches
 * an event, so DELPHI is untouched by a run.
 *
 *   (await import('/assistant/bench.js')).compare()
 */
export const compare = async () => {
	const results = [];
	for (const model_id of MODEL_CANDIDATES) {
		results.push(await benchOne(model_id, 'SELECTION', SELECTION_SET));
	}
	report(results);
	return results;
};

const rateFor = (rows, expected) => {
	const group = rows.filter(row => row.expected === expected);
	return group.length === 0 ? '-' : (group.filter(row => row.passed).length / group.length).toFixed(2);
};

const medianLatency = rows => {
	const sorted = rows.map(row => row.ms).sort((left, right) => left - right);
	return sorted[Math.floor(sorted.length / 2)];
};

const reportLine = (capability, results) => `${capability.padEnd(20)} ${results.map(result => String(rateFor(result.rows, capability)).padEnd(10)).join('')}`;

/**
 * The comparison table. Per capability, never pooled into one headline alone,
 * per D-029, with overall and latency underneath so a model that wins on
 * accuracy and loses the 20-second budget (D-033) is visible as both.
 */
export const report = results => {
	const capabilities = [...new Set(SELECTION_SET.map(item => item.expected))];
	console.log(`\ncapability           ${results.map(result => shortName(result.model_id).padEnd(10)).join('')}`);
	capabilities.forEach(capability => console.log(reportLine(capability, results)));
	console.log(`${'OVERALL'.padEnd(20)} ${results.map(result => (result.rows.filter(row => row.passed).length / result.rows.length).toFixed(2).padEnd(10)).join('')}`);
	console.log(`${'latency p50 ms'.padEnd(20)} ${results.map(result => String(medianLatency(result.rows)).padEnd(10)).join('')}`);
	console.log(`${'load ms'.padEnd(20)} ${results.map(result => String(result.load_ms).padEnd(10)).join('')}`);
};

/**
 * The reporting run, against FINAL_SET, on the one configuration already chosen
 * on SELECTION_SET.
 *
 * Run this once. Its number is the assistant's number. Running it on several
 * models and keeping the best would make it a second selection set and it would
 * stop meaning anything, which is the mistake run 1 made in miniature.
 */
export const final = model_id => benchOne(model_id, 'FINAL (report once)', FINAL_SET);
