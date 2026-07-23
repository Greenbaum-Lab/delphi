import { addHooks } from '/apc/common.js';
import { runAction, describeAction } from '/agent_actions.js';
import { isEngineSupported, loadEngine, generatePlan } from '/agent/engine.js';
import { RESPONSE_SCHEMA, buildSystemPrompt, gatherContext } from '/agent/tools.js';

const UNSUPPORTED_MESSAGE = 'On-device AI needs WebGPU with a compatible GPU. Use desktop Chrome or Edge on a machine with a working GPU, and check https://webgpureport.org to confirm support.';
const EMPTY_PROMPT = 'Ask me to set up populations, change the measure, or jump to a gene.';
const EMPTY_NOTE = 'Your first message downloads a one-time ~2 GB AI model that runs privately on your device, then stays cached.';
const PROGRESS_LABEL = 'Loading the on-device model';

const conversation_history = [];

let engine_promise = null;

const isEngineFatal = error => /not loaded|device|grammarmatcher|deleted object|gpu/i.test(error.message || '');

const buildEmptyState = () => {
	const empty = document.createElement('div');
	empty.className = 'agent-chat-empty';
	const prompt = empty.appendChild(document.createElement('p'));
	prompt.textContent = EMPTY_PROMPT;
	const note = empty.appendChild(document.createElement('p'));
	note.className = 'agent-chat-empty-note';
	note.textContent = EMPTY_NOTE;
	return empty;
};

const appendMessage = (container, role, text) => {
	const messages_container = container.querySelector('.agent-chat-messages');
	const empty_state = messages_container.querySelector('.agent-chat-empty');
	if (empty_state)
		empty_state.remove();
	const message_elem = document.createElement('div');
	message_elem.classList.add('agent-chat-message', `${role}-message`);
	message_elem.textContent = text;
	messages_container.appendChild(message_elem);
	messages_container.scrollTop = messages_container.scrollHeight;
	return message_elem;
};

const appendError = (container, text) =>
	appendMessage(container, 'assistant', text).classList.add('agent-chat-error');

const setStatus = (container, text) => {
	const messages_container = container.querySelector('.agent-chat-messages');
	const existing = messages_container.querySelector('.agent-chat-status');
	if (!text)
		return existing && existing.remove();
	const status = existing || messages_container.appendChild(document.createElement('div'));
	status.className = 'agent-chat-status';
	status.textContent = text;
	messages_container.scrollTop = messages_container.scrollHeight;
};

const buildProgress = () => {
	const progress = document.createElement('div');
	progress.className = 'agent-chat-progress';
	progress.innerHTML = '<div class="agent-chat-progress-head"><span class="agent-chat-progress-label"></span><span class="agent-chat-progress-percent"></span></div><div class="agent-chat-progress-track" role="progressbar" aria-label="Model download progress" aria-valuemin="0" aria-valuemax="100"><div class="agent-chat-progress-fill"></div></div>';
	progress.querySelector('.agent-chat-progress-label').textContent = PROGRESS_LABEL;
	return progress;
};

const setProgress = (container, report) => {
	const messages_container = container.querySelector('.agent-chat-messages');
	const progress = messages_container.querySelector('.agent-chat-progress') || messages_container.appendChild(buildProgress());
	const value = Math.round((report.progress || 0) * 100);
	const percent = `${value}%`;
	progress.querySelector('.agent-chat-progress-fill').style.width = percent;
	progress.querySelector('.agent-chat-progress-percent').textContent = percent;
	progress.querySelector('.agent-chat-progress-track').setAttribute('aria-valuenow', String(value));
	messages_container.scrollTop = messages_container.scrollHeight;
};

const clearProgress = container => {
	const progress = container.querySelector('.agent-chat-progress');
	if (progress)
		progress.remove();
};

const setBusy = (container, is_busy) => {
	container.dataset.busy = String(is_busy);
	const input = container.querySelector('.agent-chat-input');
	input.disabled = is_busy;
	container.querySelector('[data-action="send-agent-chat"]').setAttribute('aria-disabled', String(is_busy));
	if (!is_busy && !container.querySelector('.agent-chat-panel').hasAttribute('hidden'))
		input.focus();
};

const ensureEngine = container => {
	if (engine_promise)
		return engine_promise;
	engine_promise = loadEngine(report => setProgress(container, report))
		.then(engine => (clearProgress(container), engine))
		.catch(error => { engine_promise = null; clearProgress(container); throw error; });
	return engine_promise;
};

const buildMessages = context => [
	{ role: 'system', content: buildSystemPrompt(context.current_state) },
	...conversation_history
];

const respond = async (container, text) => {
	conversation_history.push({ role: 'user', content: text });
	try {
		if (!(await isEngineSupported()))
			return appendError(container, UNSUPPORTED_MESSAGE);
		const engine = await ensureEngine(container);
		setStatus(container, 'Thinking...');
		const context = gatherContext();
		const plan = await generatePlan(engine, buildMessages(context), RESPONSE_SCHEMA);
		setStatus(container, '');
		handleResponse(container, plan);
	} catch (error) {
		setStatus(container, '');
		if (isEngineFatal(error))
			engine_promise = null;
		appendError(container, `Model error: ${error.message}`);
	} finally {
		setBusy(container, false);
	}
};

const sendMessage = container => {
	if (container.dataset.busy === 'true')
		return;
	const input = container.querySelector('.agent-chat-input');
	const text = input.value.trim();
	if (!text)
		return;
	setBusy(container, true);
	appendMessage(container, 'user', text);
	input.value = '';
	respond(container, text);
};

const handleResponse = (container, { reply, proposed_actions }) => {
	appendMessage(container, 'assistant', reply);
	conversation_history.push({ role: 'assistant', content: reply });
	if (proposed_actions && proposed_actions.length > 0)
		renderActionPreview(container, proposed_actions);
};

const createButton = (label, on_click) => {
	const button = document.createElement('a');
	button.classList.add('button');
	button.setAttribute('role', 'button');
	button.setAttribute('tabindex', '0');
	button.textContent = label;
	button.addEventListener('click', on_click);
	return button;
};

const buildActionList = proposed_actions => {
	const list = document.createElement('ul');
	list.classList.add('agent-chat-action-list');
	for (const action of proposed_actions) {
		const item = document.createElement('li');
		item.textContent = describeAction(action);
		list.appendChild(item);
	}
	return list;
};

const buildPreviewButtons = (container, proposed_actions, preview) => {
	const row = document.createElement('div');
	row.classList.add('agent-chat-preview-actions');
	row.append(
		createButton('Apply', () => applyActions(container, proposed_actions, preview)),
		createButton('Cancel', () => cancelActions(container, preview))
	);
	return row;
};

const renderActionPreview = (container, proposed_actions) => {
	const messages_container = container.querySelector('.agent-chat-messages');
	const preview = document.createElement('div');
	preview.classList.add('agent-chat-preview');
	preview.append(buildActionList(proposed_actions), buildPreviewButtons(container, proposed_actions, preview));
	messages_container.appendChild(preview);
	messages_container.scrollTop = messages_container.scrollHeight;
};

const runOneAction = async action => {
	try {
		return await runAction(action);
	} catch (error) {
		return error.message;
	}
};

const applyActions = async (container, proposed_actions, preview) => {
	if (container.dataset.busy === 'true')
		return;
	setBusy(container, true);
	preview.remove();
	const results = [];
	for (const action of proposed_actions)
		results.push(await runOneAction(action));
	const summary = `Applied: ${results.join('; ')}`;
	appendMessage(container, 'assistant', summary);
	conversation_history.push({ role: 'assistant', content: summary });
	setBusy(container, false);
};

const cancelActions = (container, preview) => {
	preview.remove();
	appendMessage(container, 'assistant', 'Actions cancelled.');
};

const clearConversation = container => {
	if (container.dataset.busy === 'true')
		return;
	conversation_history.length = 0;
	const messages_container = container.querySelector('.agent-chat-messages');
	messages_container.replaceChildren(buildEmptyState());
};

const togglePanel = container => {
	const panel = container.querySelector('.agent-chat-panel');
	const bubble = container.querySelector('[data-action="toggle-agent-chat"]');
	const opening = panel.hasAttribute('hidden');
	panel.toggleAttribute('hidden', !opening);
	bubble.setAttribute('aria-expanded', String(opening));
	if (opening)
		container.querySelector('.agent-chat-input').focus();
};

const closePanel = container => {
	container.querySelector('.agent-chat-panel').setAttribute('hidden', '');
	const bubble = container.querySelector('[data-action="toggle-agent-chat"]');
	bubble.setAttribute('aria-expanded', 'false');
	bubble.focus();
};

const hooks = [
	['[data-action="toggle-agent-chat"]', 'click', e => togglePanel(e.target.closest('[data-module="agent_chat"]'))],
	['[data-action="close-agent-chat"]', 'click', e => closePanel(e.target.closest('[data-module="agent_chat"]'))],
	['[data-action="clear-agent-chat"]', 'click', e => clearConversation(e.target.closest('[data-module="agent_chat"]'))],
	['[data-action="send-agent-chat"]', 'click', e => sendMessage(e.target.closest('[data-module="agent_chat"]'))],
	['.agent-chat-input', 'keydown', e => {
		const container = e.target.closest('[data-module="agent_chat"]');
		if (e.key === 'Enter')
			sendMessage(container);
		else if (e.key === 'Escape')
			closePanel(container);
	}],
	['.agent-chat [role="button"]', 'keydown', e => {
		if (e.key !== 'Enter' && e.key !== ' ')
			return;
		e.preventDefault();
		e.target.click();
	}]
];

export const init = container => {
	addHooks(window, hooks);
	window.__agentInjectResponse = response => handleResponse(container, response);
};
