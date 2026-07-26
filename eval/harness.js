import { CAPTURES } from './captures.js';
import { parseState, recordsOfKind } from './state_parser.js';
import { readCatalogues } from './catalogues.js';
import { buildTaskSet } from './templates.js';
import { SCHEMAS } from './schemas.js';
import { buildMessages, buildStatelessMessages } from './prompt.js';
import { loadEngine, generate, MODEL_METADATA } from './model_runner.js';
import { scoreTask, parseOutput, markModelCapability } from './scoring.js';
import { summarizeByType, summarizeStateTokens } from './metrics.js';

const geneTrackId = capture => {
	const gene_record = recordsOfKind(parseState(capture), 'ann').find(record => record.fields[1] === 'gene');
	return gene_record ? gene_record.fields[0] : null;
};

const readJavascriptHeap = () => performance.memory ? { used_mb: Math.round(performance.memory.usedJSHeapSize / 1048576), limit_mb: Math.round(performance.memory.jsHeapSizeLimit / 1048576) } : null;

const readAdapter = async () => {
	const adapter = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
	return adapter ? { features: [...adapter.features], max_buffer_size: adapter.limits.maxBufferSize } : null;
};

const readEnvironment = async () => ({ user_agent: navigator.userAgent, adapter: await readAdapter(), javascript_heap: readJavascriptHeap() });

const runOne = async (engine, task, catalogues) => {
	const generation = await generate(engine, buildMessages(task), SCHEMAS[task.schema_name]);
	const model_output = parseOutput(generation.raw_text);
	return { task, raw_text: generation.raw_text, model_output, score: scoreTask(task, model_output, catalogues), latency_ms: generation.latency_ms, prompt_tokens: generation.prompt_tokens, completion_tokens: generation.completion_tokens, steps: 1 };
};

const runAll = async (engine, tasks, catalogues) => {
	const results = [];
	for (const task of tasks) {
		results.push(await runOne(engine, task, catalogues));
		if (results.length % 20 === 0)
			console.log(`ran ${results.length}/${tasks.length}`);
	}
	return results;
};

const probeTask = fixture => ({ serialized_state: fixture.serialized_state, utterance: 'which chromosome am I on' });

const measureFixtureTokens = async (engine, fixture) => {
	const probe_task = probeTask(fixture);
	const with_state = await generate(engine, buildMessages(probe_task), SCHEMAS.answer_state, 1);
	const without_state = await generate(engine, buildStatelessMessages(probe_task), SCHEMAS.answer_state, 1);
	return { fixture_id: fixture.fixture_id, characters: fixture.serialized_state.length, full_prompt_tokens: with_state.prompt_tokens, state_block_tokens: with_state.prompt_tokens - without_state.prompt_tokens };
};

const measureStateTokens = async (engine, fixtures) => {
	const rows = [];
	for (const fixture of fixtures)
		rows.push(await measureFixtureTokens(engine, fixture));
	return rows;
};

const downloadResults = report => {
	const blob_url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 1)], { type: 'application/json' }));
	const anchor = document.createElement('a');
	anchor.href = blob_url;
	anchor.download = `gate4a_${Date.now()}.json`;
	anchor.click();
	URL.revokeObjectURL(blob_url);
};

const reportSummary = report => {
	console.table(Object.fromEntries(Object.entries(report.per_capability).map(([task_type, summary]) => [task_type, { tasks: summary.tasks, success: summary.success_rate, nominal: summary.success_rate_nominal, edge: summary.success_rate_edge, p50_ms: summary.latency_ms.p50, p50_tokens: summary.prompt_tokens.p50 }])));
	console.table(Object.fromEntries(Object.entries(report.per_capability).map(([task_type, summary]) => [task_type, summary.failure_split])));
	console.log('state block tokens', report.state_tokens.state_block_tokens);
};

/**
 * Runs Gate 4a: accuracy, failure split and real token counts for the v1 model
 * against the generated task set, with DELPHI live in the same tab. Latency and
 * heap are recorded but are not the Gate 4b figures, which need the 8GB
 * reference machine.
 */
export const runGate4a = async () => {
	const environment_before = await readEnvironment();
	const catalogues = await readCatalogues(geneTrackId(CAPTURES[0]));
	const { fixtures, tasks } = buildTaskSet(catalogues);
	console.log(`fixtures ${fixtures.length}, tasks ${tasks.length}`);
	const engine = await loadEngine(progress => console.log(progress.text));
	const environment_after_load = await readEnvironment();
	const state_token_rows = await measureStateTokens(engine, fixtures);
	const results = markModelCapability(await runAll(engine, tasks, catalogues));
	const report = {
		gate: '4a',
		recorded_at: new Date().toISOString(),
		model: MODEL_METADATA,
		environment: { before_load: environment_before, after_load: environment_after_load, at_end: await readEnvironment() },
		catalogue_sizes: { genes: catalogues.gene_map.size, populations: catalogues.populations.length },
		fixture_count: fixtures.length,
		per_capability: summarizeByType(results),
		state_tokens: summarizeStateTokens(state_token_rows),
		results: results.map(result => ({ task_id: result.task.task_id, task_type: result.task.task_type, template_id: result.task.template_id, fixture_id: result.task.fixture_id, edge: result.task.edge, utterance: result.task.utterance, expected: result.task.expected, raw_text: result.raw_text, score: result.score, latency_ms: Math.round(result.latency_ms), prompt_tokens: result.prompt_tokens, completion_tokens: result.completion_tokens, steps: result.steps }))
	};
	reportSummary(report);
	downloadResults(report);
	return report;
};
