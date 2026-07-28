import { createPanel } from '/assistant/panel.js';
import { loadCatalogue } from '/assistant/catalogue.js';
import { parseCommand } from '/assistant/parser.js';
import { routeCommand } from '/assistant/router.js';
import { isModelSupported, loadModel, readCommand } from '/assistant/model.js';
import { observeState } from '/assistant/state_observer.js';
import { serializeState } from '/assistant/state_serializer.js';
import { NOT_UNDERSTOOD, NO_MODEL, THINKING } from '/assistant/messages.js';

const READY_STATUS = 'Ready.';
const DIRECT_ONLY_STATUS = 'Direct commands only.';

/**
 * Reads a reply to a question the assistant asked. A bare number picks one of
 * the candidates the resolver offered, and the exact name held in code is what
 * goes on to the action, not anything the user retyped.
 */
const answerPending = (session, request_text) => {
	if (!session.pending || !/^[0-9]+$/.test(request_text.trim()))
		return null;
	const candidate = session.pending.candidates[Number(request_text.trim()) - 1];
	return candidate ? { action: session.pending.action, target: candidate, direction: null } : null;
};

const modelCommand = async (session, request_text) => {
	if (!session.engine)
		return null;
	session.panel.setStatus(THINKING);
	const serialized_state = serializeState(await observeState());
	const parsed_command = await readCommand(session.engine, serialized_state, request_text);
	session.panel.setStatus(READY_STATUS);
	return parsed_command;
};

const respond = async (session, parsed_command) => {
	const { message, pending } = await routeCommand(session.catalogue, parsed_command);
	session.panel.say(message);
	session.pending = pending;
};

/**
 * Deterministic first: a request that the parser understands never reaches the
 * model, which is what keeps the common cases instant against the twenty-second
 * budget. The model is consulted only for what the parser could not read.
 */
const handleSubmit = async (session, request_text) => {
	if (!session.catalogue)
		return session.panel.say('Still reading the catalogue, try again in a moment.');
	session.panel.setBusy(true);
	try {
		const parsed_command = answerPending(session, request_text) || parseCommand(request_text) || await modelCommand(session, request_text);
		session.pending = null;
		if (parsed_command)
			await respond(session, parsed_command);
		else
			session.panel.say(session.engine ? NOT_UNDERSTOOD : NO_MODEL);
	} finally {
		session.panel.setBusy(false);
	}
};

/**
 * Sets up once, on first open rather than on page load, so a visitor who never
 * opens the assistant never downloads a model. Everything expensive happens
 * here and nothing is rebuilt per request.
 */
const prepare = async session => {
	if (session.prepared)
		return;
	session.prepared = true;
	session.panel.setStatus('Reading the catalogue.');
	session.catalogue = await loadCatalogue().catch(() => null);
	if (!session.catalogue) {
		session.prepared = false;
		return session.panel.setStatus('DELPHI has not finished loading its data. Open this again in a moment.');
	}
	if (!isModelSupported())
		return session.panel.setStatus('This browser has no WebGPU, so direct commands only.');
	session.panel.setStatus('Loading the local model, first time only.');
	session.engine = await loadModel(progress_text => session.panel.setStatus(progress_text));
	session.panel.setStatus(session.engine ? READY_STATUS : DIRECT_ONLY_STATUS);
};

export const init = async container => {
	const session = { panel: null, catalogue: null, engine: null, pending: null, prepared: false };
	session.panel = createPanel(container, {
		onOpen: () => prepare(session),
		onSubmit: request_text => handleSubmit(session, request_text)
	});
	session.panel.say('Ask me to move the view. Try a gene name, chr2:136500000-136600000, fst, or sort by time.');
};
