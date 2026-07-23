import * as webllm from 'https://esm.run/@mlc-ai/web-llm@0.2.84';

const MODEL = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';

let model_limits = null;
let last_usage = null;

const requestAdapter = () =>
	navigator.gpu ? navigator.gpu.requestAdapter().catch(() => null) : Promise.resolve(null);

export const isEngineSupported = async () => Boolean(await requestAdapter());

const readModelLimits = () => {
	'Read the loaded model context window and VRAM estimate from the WebLLM catalog.';
	const record = webllm.prebuiltAppConfig.model_list.find(entry => entry.model_id === MODEL);
	const context_window_size = record && (record.overrides?.context_window_size ?? record.context_window_size ?? null);
	const vram_required_mb = record ? record.vram_required_MB ?? null : null;
	model_limits = { context_window_size, vram_required_mb };
	console.log(`[agent] model ${MODEL}: context_window_size=${context_window_size}, vram_required_MB=${vram_required_mb}`);
	return model_limits;
};

export const getModelLimits = () => model_limits;

export const getLastUsage = () => last_usage;

export const loadEngine = async on_progress => {
	'Load the model, log its context and VRAM limits, and return the engine.';
	readModelLimits();
	return webllm.CreateMLCEngine(MODEL, { initProgressCallback: on_progress });
};

const buildRequest = (messages, schema) => schema
	? { messages, temperature: 0, response_format: { type: 'json_object', schema: JSON.stringify(schema) } }
	: { messages, temperature: 0 };

const logRuntimeStats = async engine => {
	try {
		console.log(`[agent] runtime: ${await engine.runtimeStatsText()}`);
	} catch (error) {
		console.log(`[agent] runtime stats unavailable: ${error.message}`);
	}
};

export const generatePlan = async (engine, messages, schema) => {
	'Generate a reply from the loaded engine, returning parsed JSON when a schema is given and plain text otherwise.';
	const completion = await engine.chat.completions.create(buildRequest(messages, schema));
	last_usage = completion.usage || null;
	console.log('[agent] usage', last_usage, 'messages', messages.length);
	await logRuntimeStats(engine);
	const content = completion.choices[0].message.content;
	return schema ? JSON.parse(content) : content;
};
