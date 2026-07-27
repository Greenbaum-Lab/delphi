import { addHooks } from '/apc/common.js';
import { runCommand, HELP } from '/assistant/commands.js';

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
 * Runs one command and keeps the panel usable whatever happens. The catch is
 * deliberate and narrow: a rejected catalogue read must not leave the input
 * disabled and the user with no message, which is the one reason this layer
 * continues past an error rather than letting it surface.
 */
const runAndReport = async line => {
	try {
		return await runCommand(line);
	} catch (error) {
		console.error(error);
		return { ok: false, message: 'That command failed before it reached the browser.' };
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

const ACTIVATION_KEYS = ['Enter', ' '];

const hooks = [
	['[data-action="toggle-assistant"], [data-action="close-assistant"]', 'keydown', e => {
		if (!ACTIVATION_KEYS.includes(e.key))
			return;
		e.preventDefault();
		e.target.click();
	}],
	['[data-action="toggle-assistant"]', 'click', e => {
		const panel = document.querySelector('.assistant-panel');
		togglePanel(panel, panel.hasAttribute('hidden'));
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
 * data-module attribute, so nothing else has to import it. Stage 4 wires the
 * panel to the deterministic command path only; no model is loaded here.
 */
export const init = container => {
	appendMessage(container, 'reply', HELP);
	addHooks(window, hooks);
	return container;
};
