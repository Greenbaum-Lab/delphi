const WEBLLM_MODULE_URL = 'https://esm.run/@mlc-ai/web-llm@0.2.79';
const MODEL_ID = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
const MAX_OUTPUT_TOKENS = 96;

const readTokenCount = (usage, key) => usage && Number.isFinite(usage[key]) ? usage[key] : null;

/**
 * Loads the v1 design-target model on WebGPU. The module URL is pinned so the
 * harness runs against a known build; this is an eval harness and not the
 * shipping path, so no weight hash is verified here.
 */
export const loadEngine = async progress_callback => {
	const web_llm = await import(WEBLLM_MODULE_URL);
	return web_llm.CreateMLCEngine(MODEL_ID, { initProgressCallback: progress_callback });
};

export const generate = async (engine, messages, schema, max_tokens) => {
	const started_at = performance.now();
	const completion = await engine.chat.completions.create({
		messages,
		temperature: 0,
		max_tokens: max_tokens === undefined ? MAX_OUTPUT_TOKENS : max_tokens,
		response_format: { type: 'json_object', schema: JSON.stringify(schema) }
	});
	return {
		raw_text: completion.choices[0].message.content,
		prompt_tokens: readTokenCount(completion.usage, 'prompt_tokens'),
		completion_tokens: readTokenCount(completion.usage, 'completion_tokens'),
		latency_ms: performance.now() - started_at
	};
};

export const MODEL_METADATA = { model_id: MODEL_ID, module_url: WEBLLM_MODULE_URL, max_output_tokens: MAX_OUTPUT_TOKENS };
