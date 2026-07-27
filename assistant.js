import { addHooks } from '/apc/common.js';
import { getMetadata } from '/assets.js';
import { runCommand, isTypedCommand, HELP } from '/assistant/commands.js';
import { route } from '/assistant/router.js';
import { startModel, modelReady } from '/assistant/model.js';

const ACTIVATION_KEYS = ['Enter', ' '];

const MESSAGE_CLASSES = {
	request: 'assistant-message-request',
	reply: 'assistant-message-reply',
	failure: 'assistant-message-failure'
};

/**
 * Appends one line to the transcript. Output is written with textContent and
 * never with innerHTML. Under D-019 nothing stands behind this rule: there is
 * no Content-Security-Policy on this branch, so it is the whole defence
 * between a population label and script execution.
 */
const appendMessage = (panel, kind, text) => {
	const log = panel.querySelector('[data-assistant="log"]');
	const message = document.createElement('div');
	message.className = `assistant-message ${MESSAGE_CLASSES[kind]}`;
	message.textContent = text;
	log.append(message);
	log.scrollTop = log.scrollHeight;
};

const setStatus = (panel, text) => {
	const status = panel.querySelector('[data-assistant="status"]');
	status.textContent = text;
	status.toggleAttribute('hidden', text === '');
};

/**
 * Pulls the 11MB per-sample metadata into memory ahead of any request. Stage 1
 * established that DELPHI only loads it when a population is missing from
 * IndexedDB, so in a warm session it is absent and the first request that needs
 * it would pay the parse inside the 20s budget (D-033, D-036). The failure is
 * logged rather than surfaced because this is a warm-up: nothing has been asked
 * for yet, and every path that needs the file loads it again on demand.
 */
const warmCatalogues = () => {
	getMetadata().catch(error => console.error(error));
};

/**
 * Loads the model once, on the first open of the panel rather than on page
 * load. CLAUDE.md says startup, and this is the startup of the assistant: a
 * genome browser must not download 800MB for every visitor who never opens the
 * panel, and the assistant is additive. The cost is that the first request
 * after a cold open waits for the download; every later one does not.
 */
const startAssistant = async panel => {
	if (modelReady())
		return;
	setStatus(panel, 'Loading the model. First load downloads about 800MB, cached after that.');
	warmCatalogues();
	try {
		await startModel(progress => setStatus(panel, progress.text));
		setStatus(panel, '');
		appendMessage(panel, 'reply', 'Model ready.');
	} catch (error) {
		console.error(error);
		setStatus(panel, '');
		appendMessage(panel, 'failure', 'The model could not start, so plain language is unavailable. Typed commands still work.');
	}
};

const togglePanel = (panel, open) => {
	const toggle = document.querySelector('[data-action="toggle-assistant"]');
	panel.toggleAttribute('hidden', !open);
	toggle.setAttribute('aria-expanded', String(open));
	if (open)
		panel.querySelector('[data-assistant="input"]').focus();
	else
		toggle.focus();
};

/**
 * Runs one line and keeps the panel usable whatever happens. A line beginning
 * with a known command word takes the deterministic path and never reaches the
 * model; anything else is a request for the model to classify. The catch is
 * deliberate and narrow: a rejected catalogue read or a model fault must not
 * leave the input disabled and the user with no message.
 */
const runAndReport = async line => {
	try {
		return isTypedCommand(line) ? await runCommand(line) : await route(line);
	} catch (error) {
		console.error(error);
		return { ok: false, message: 'That request failed before it reached the browser.' };
	}
};

const submitCommand = async panel => {
	const input = panel.querySelector('[data-assistant="input"]');
	const line = input.value.trim();
	if (line === '')
		return;
	appendMessage(panel, 'request', line);
	input.value = '';
	input.disabled = true;
	const result = await runAndReport(line);
	input.disabled = false;
	appendMessage(panel, result.ok ? 'reply' : 'failure', result.message);
	input.focus();
};

const hooks = [
	['[data-action="toggle-assistant"], [data-action="close-assistant"]', 'keydown', e => {
		if (!ACTIVATION_KEYS.includes(e.key))
			return;
		e.preventDefault();
		e.target.click();
	}],
	['[data-action="toggle-assistant"]', 'click', e => {
		const panel = document.querySelector('.assistant-panel');
		const opening = panel.hasAttribute('hidden');
		togglePanel(panel, opening);
		if (opening)
			startAssistant(panel);
	}],
	['[data-action="close-assistant"]', 'click', e => {
		togglePanel(e.target.closest('.assistant-panel'), false);
	}],
	['[data-assistant="input"]', 'keydown', e => {
		if (e.key === 'Enter')
			submitCommand(e.target.closest('.assistant-panel'));
	}],
	['.assistant-panel, .assistant-panel *', 'keydown', e => {
		if (e.key === 'Escape')
			togglePanel(e.target.closest('.assistant-panel'), false);
	}]
];

/**
 * Starts the assistant panel. init.js finds this module from the panel's
 * data-module attribute, so nothing else has to import it. The model is not
 * loaded here; see startAssistant.
 */
export const init = container => {
	appendMessage(container, 'reply', HELP);
	addHooks(window, hooks);
	return container;
};
