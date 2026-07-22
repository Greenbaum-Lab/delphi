import * as webllm from 'https://esm.run/@mlc-ai/web-llm@0.2.84';

const MODEL_ID = 'Llama-3.2-3B-Instruct-q4f16_1-MLC';

export const isEngineSupported = async () => {
	if (!navigator.gpu)
		return false;
	const adapter = await navigator.gpu.requestAdapter().catch(() => null);
	return Boolean(adapter);
};

export const loadEngine = on_progress =>
	webllm.CreateMLCEngine(MODEL_ID, { initProgressCallback: on_progress });

const buildRequest = (messages, schema) => schema
	? { messages, temperature: 0, response_format: { type: 'json_object', schema: JSON.stringify(schema) } }
	: { messages, temperature: 0 };

export const generatePlan = async (engine, messages, schema) => {
	'Generate a reply from the loaded engine, returning parsed JSON when a schema is given and plain text otherwise.';
	const completion = await engine.chat.completions.create(buildRequest(messages, schema));
	const content = completion.choices[0].message.content;
	return schema ? JSON.parse(content) : content;
};
