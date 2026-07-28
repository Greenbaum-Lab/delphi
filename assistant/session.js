import { startModel, generate } from '/assistant/model.js';
import { buildMessages } from '/assistant/prompt.js';
import { COMMAND_SCHEMA } from '/assistant/schemas.js';

const MAX_TURNS = 40;

const PRIMING_UTTERANCE = 'hi';

let messages = [];

let turns = 0;

/**
 * This module is the one deliberately stateful piece of the assistant, because
 * the thing it mirrors is stateful: WebLLM keeps a KV cache, and reuses it when
 * a request continues the conversation it already holds. The array below is
 * what makes a request a continuation.
 */
const resetSession = () => {
	messages = [];
	turns = 0;
};

const extend = utterance => {
	const [system_message, user_message] = buildMessages('', utterance);
	messages = messages.length === 0 ? [system_message, user_message] : [...messages, user_message];
};

/**
 * One model turn, appended to the running conversation.
 *
 * Sending a fresh system prompt and user message on every call, which is what
 * this replaced, made WebLLM reset and prefill the whole prompt each time: 570
 * tokens, measured at 44 of every 46 seconds on the slow Intel machine.
 * Continuing the conversation prefills only the new message, 12 to 36 tokens,
 * and took that machine from a p50 of 47.8s to 8.1s.
 *
 * The conversation is reset every MAX_TURNS. Forty is what was measured: over
 * forty turns with no reset, accuracy on a round-robin set was 33/40 against a
 * stateless 30/40, so the growing context did no harm at that length. Beyond it
 * nothing has been measured, and the reset is there rather than an assumption
 * that it stays harmless. The turn after a reset pays the full prompt again.
 */
export const askModel = async utterance => {
	const engine = await startModel();
	if (turns >= MAX_TURNS)
		resetSession();
	extend(utterance);
	const raw_text = await generate(engine, messages, COMMAND_SCHEMA);
	messages = [...messages, { role: 'assistant', content: raw_text }];
	turns += 1;
	return raw_text;
};

/**
 * Reads the instructions once, when the panel opens, so no user ever waits for
 * it. Without this the first thing typed pays the full prefill, which on the
 * slow machine is 44 seconds before a word comes back.
 *
 * The reply is discarded. Only the cache it leaves behind matters.
 */
export const primeSession = async () => {
	await askModel(PRIMING_UTTERANCE);
};
