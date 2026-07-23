#test to remove later#
import * as webllm from 'https://esm.run/@mlc-ai/web-llm@0.2.84';

const MODEL_FLOAT16 = 'Llama-3.2-3B-Instruct-q4f16_1-MLC';
const MODEL_FLOAT32 = 'Llama-3.2-3B-Instruct-q4f32_1-MLC';

const requestAdapter = () =>
	navigator.gpu ? navigator.gpu.requestAdapter().catch(() => null) : Promise.resolve(null);

export const isEngineSupported = async () => Boolean(await requestAdapter());

const selectModel = async () => {
	const adapter = await requestAdapter();
	return adapter && adapter.features.has('shader-f16') ? MODEL_FLOAT16 : MODEL_FLOAT32;
};

export const loadEngine = async on_progress =>
	webllm.CreateMLCEngine(await selectModel(), { initProgressCallback: on_progress });

const buildRequest = (messages, schema) => schema
	? { messages, temperature: 0, response_format: { type: 'json_object', schema: JSON.stringify(schema) } }
	: { messages, temperature: 0 };

export const generatePlan = async (engine, messages, schema) => {
	'Generate a reply from the loaded engine, returning parsed JSON when a schema is given and plain text otherwise.';
	const completion = await engine.chat.completions.create(buildRequest(messages, schema));
	const content = completion.choices[0].message.content;
	return schema ? JSON.parse(content) : content;
};
