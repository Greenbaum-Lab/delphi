import { startModel, generate, MODEL_METADATA } from '/assistant/model.js';
import { COMMAND_SCHEMA } from '/assistant/schemas.js';
import { observeState } from '/assistant/state_observer.js';
import { serializeState } from '/assistant/state_serializer.js';
import { buildMessages } from '/assistant/prompt.js';

const UTTERANCES = [
	'show me population Basque',
	'take me to the lactase gene',
	'switch to FST',
	'what statistic am I looking at',
	'sort by distance from Africa, descending',
	'go to chr2:136545000-136594000',
	'add the San as well',
	'make me a sandwich'
];

const parseOutcome = raw_text => {
	try {
		const command = JSON.parse(raw_text);
		return typeof command.action === 'string' ? command.action : 'no action field';
	} catch (error) {
		return 'unparseable';
	}
};

const probe = async (engine, serialized_state, utterance) => {
	const started_at = performance.now();
	try {
		const raw_text = await generate(engine, buildMessages(serialized_state, utterance), COMMAND_SCHEMA);
		return { utterance, outcome: parseOutcome(raw_text), raw: raw_text, ms: Math.round(performance.now() - started_at) };
	} catch (error) {
		return { utterance, outcome: 'threw', raw: error.message, ms: Math.round(performance.now() - started_at) };
	}
};

/**
 * Asks the model for one command per fixed utterance and reports exactly what
 * came back, unedited. This is the instrument the router deliberately lacks:
 * the router discards raw output once it has parsed it, so a model that emits
 * the wrong shape is indistinguishable from one that emits nothing.
 *
 * It acts on nothing. No option is written and no event is dispatched, so the
 * view is the same after a run as before it, and the state every utterance was
 * shown is identical.
 *
 * Run it from the DELPHI page console:
 *   (await import('/assistant/diagnose.js')).run()
 */
export const run = async () => {
	const engine = await startModel(progress => console.log(progress.text));
	const serialized_state = serializeState(await observeState());
	console.log(`model ${MODEL_METADATA.model_id}, state ${serialized_state.length} chars, schema ${JSON.stringify(COMMAND_SCHEMA).length} chars`);
	const rows = [];
	for (const utterance of UTTERANCES) {
		const row = await probe(engine, serialized_state, utterance);
		console.log(`${row.ms}ms  ${row.outcome}  ${row.utterance}  ->  ${row.raw}`);
		rows.push(row);
	}
	console.table(rows.map(row => ({ utterance: row.utterance, outcome: row.outcome, ms: row.ms })));
	return rows;
};
