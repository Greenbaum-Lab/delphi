import * as webllm from 'https://esm.run/@mlc-ai/web-llm@0.2.84';

const MODEL = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
const PREFILL_CHUNK_WEAK = 128;
const PREFILL_CHUNK_STRONG = 2048;

let model_limits = null;
let last_usage = null;

const requestAdapter = () =>
	navigator.gpu ? navigator.gpu.requestAdapter().catch(() => null) : Promise.resolve(null);

export const isEngineSupported = async () => Boolean(await requestAdapter());

const getAdapterInfo = async adapter => {
	'Return the adapter GPU identity, tolerating both the property and legacy request forms.';
	if (!adapter)
		return null;
	try {
		return adapter.info || (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : null);
	} catch {
		return null;
	}
};

const isWeakGpu = info => {
	'Treat integrated, mobile, software, and unknown adapters as weak so the chunk size stays safe.';
	if (!info)
		return true;
	const text = `${info.vendor || ''} ${info.architecture || ''} ${info.description || ''}`.toLowerCase();
	return /intel|adreno|mali|integrated|swiftshader|llvmpipe|software|microsoft basic/.test(text);
};

const buildAppConfig = prefill_chunk_size => ({
	...webllm.prebuiltAppConfig,
	model_list: webllm.prebuiltAppConfig.model_list.map(record =>
		record.model_id === MODEL
			? { ...record, overrides: { ...record.overrides, prefill_chunk_size } }
			: record)
});

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
	'Load the model, adapting prefill chunk size to the detected GPU to avoid driver timeouts on weak hardware.';
	const info = await getAdapterInfo(await requestAdapter());
	const weak = isWeakGpu(info);
	const prefill_chunk_size = weak ? PREFILL_CHUNK_WEAK : PREFILL_CHUNK_STRONG;
	console.log(`[agent] gpu vendor=${info?.vendor || 'unknown'} architecture=${info?.architecture || 'unknown'} description=${info?.description || 'unknown'} weak=${weak} prefill_chunk_size=${prefill_chunk_size}`);
	readModelLimits();
	return webllm.CreateMLCEngine(MODEL, { appConfig: buildAppConfig(prefill_chunk_size), initProgressCallback: on_progress });
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
