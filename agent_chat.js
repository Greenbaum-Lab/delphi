import { addHooks } from '/apc/common.js';
import { runAction, describeAction } from '/agent_actions.js';
import { isEngineSupported, loadEngine, generatePlan } from '/agent/engine.js';

const SYSTEM_PROMPT = 'You are the DELPHI genome browser assistant. Answer briefly.';
const UNSUPPORTED_MESSAGE = 'On-device AI needs a WebGPU browser such as desktop Chrome or Edge.';

const conversation_history = [];

let engine_promise = null;

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
};

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

const ensureEngine = container => {
	if (engine_promise)
		return engine_promise;
	engine_promise = loadEngine(report => setStatus(container, report.text))
		.then(engine => (setStatus(container, ''), engine))
		.catch(error => { engine_promise = null; throw error; });
	return engine_promise;
};

const buildMessages = () => [{ role: 'system', content: SYSTEM_PROMPT }, ...conversation_history];

const respond = async (container, text) => {
	conversation_history.push({ role: 'user', content: text });
	if (!isEngineSupported())
		return appendMessage(container, 'assistant', UNSUPPORTED_MESSAGE);
	try {
		const engine = await ensureEngine(container);
		const reply = await generatePlan(engine, buildMessages(), null);
		appendMessage(container, 'assistant', reply);
		conversation_history.push({ role: 'assistant', content: reply });
	} catch (error) {
		setStatus(container, '');
		appendMessage(container, 'assistant', `Model error: ${error.message}`);
	}
};

const sendMessage = container => {
	const input = container.querySelector('.agent-chat-input');
	const text = input.value.trim();
	if (!text)
		return;
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
	preview.remove();
	const results = [];
	for (const action of proposed_actions)
		results.push(await runOneAction(action));
	const summary = `Applied: ${results.join('; ')}`;
	appendMessage(container, 'assistant', summary);
	conversation_history.push({ role: 'assistant', content: summary });
};

const cancelActions = (container, preview) => {
	preview.remove();
	appendMessage(container, 'assistant', 'Actions cancelled.');
};

const togglePanel = container => {
	const panel = container.querySelector('.agent-chat-panel');
	const bubble = container.querySelector('[data-action="toggle-agent-chat"]');
	const opening = panel.hasAttribute('hidden');
	panel.toggleAttribute('hidden', !opening);
	bubble.setAttribute('aria-expanded', String(opening));
};

const closePanel = container => {
	container.querySelector('.agent-chat-panel').setAttribute('hidden', '');
	container.querySelector('[data-action="toggle-agent-chat"]').setAttribute('aria-expanded', 'false');
};

const hooks = [
	['[data-action="toggle-agent-chat"]', 'click', e => togglePanel(e.target.closest('[data-module="agent_chat"]'))],
	['[data-action="close-agent-chat"]', 'click', e => closePanel(e.target.closest('[data-module="agent_chat"]'))],
	['[data-action="send-agent-chat"]', 'click', e => sendMessage(e.target.closest('[data-module="agent_chat"]'))],
	['.agent-chat-input', 'keypress', e => {
		if (e.key === 'Enter')
			sendMessage(e.target.closest('[data-module="agent_chat"]'));
	}]
];

export const init = container => {
	addHooks(window, hooks);
	window.__agentInjectResponse = response => handleResponse(container, response);
};
