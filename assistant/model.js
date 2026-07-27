const WEBLLM_MODULE_URL = 'https://esm.run/@mlc-ai/web-llm@0.2.79';
const MODEL_ID = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
const MAX_OUTPUT_TOKENS = 48;

let engine_promise = null;

/**
 * The whole WebLLM surface, isolated here: CreateMLCEngine and
 * chat.completions.create, nothing else. This module holds the only import()
 * in assistant/, of a URL that is a constant in this file and can be reached
 * by no other code path. Model output and quarantined data cannot influence
 * it, which is the property D-018 exists to protect; CLAUDE.md section 7
 * carves out the WebLLM runtime by name.
 */
const loadEngine = async progress_callback => {
	const web_llm = await import(WEBLLM_MODULE_URL);
	return web_llm.CreateMLCEngine(MODEL_ID, { initProgressCallback: progress_callback });
};

/**
 * Starts the model once and hands every later caller the same engine. Loading
 * is roughly 800MB on a cold cache, so it happens at startup and never inside a
 * request (D-033). A failed load is dropped so a later attempt can retry rather
 * than inheriting the rejection.
 */
export const startModel = progress_callback => {
	if (engine_promise === null) {
		engine_promise = loadEngine(progress_callback);
		engine_promise.catch(() => { engine_promise = null; });
	}
	return engine_promise;
};

export const modelReady = () => engine_promise !== null;

/**
 * Starts a named model for measurement, uncached, so two candidates can be
 * compared in one session. The shipping path is startModel and is unaffected:
 * it keeps its own single cached engine on the constant above.
 *
 * The caller owns the returned engine and must pass it to unloadModel before
 * loading the next one, or the second load competes with the first for GPU
 * memory on hardware that has little of it (D-031).
 */
export const startNamedModel = async (model_id, progress_callback) => {
	const web_llm = await import(WEBLLM_MODULE_URL);
	return web_llm.CreateMLCEngine(model_id, { initProgressCallback: progress_callback });
};

export const unloadModel = engine => engine && typeof engine.unload === 'function' ? engine.unload() : Promise.resolve();

/**
 * Every model id the pinned WebLLM build can load. Read rather than assumed, so
 * a candidate that does not exist is caught before a long run rather than
 * halfway through one.
 */
export const listModelIds = async () => {
	const web_llm = await import(WEBLLM_MODULE_URL);
	return web_llm.prebuiltAppConfig.model_list.map(entry => entry.model_id);
};

/**
 * One constrained generation. Temperature is zero and the token ceiling is
 * low, because every generated token costs roughly 0.44s on the integrated
 * chip D-031 makes the target and the whole budget is 20s (D-033). The schema
 * is passed unchanged on every call so the runtime can reuse its compiled
 * grammar rather than rebuilding it per request.
 */
export const generate = async (engine, messages, schema) => {
	const completion = await engine.chat.completions.create({
		messages,
		temperature: 0,
		max_tokens: MAX_OUTPUT_TOKENS,
		response_format: { type: 'json_object', schema: JSON.stringify(schema) }
	});
	return completion.choices[0].message.content;
};

export const MODEL_METADATA = { model_id: MODEL_ID, module_url: WEBLLM_MODULE_URL, max_output_tokens: MAX_OUTPUT_TOKENS };
