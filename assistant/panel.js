import { MAX_QUERY_LENGTH } from '/assistant/config.js';

const createElement = (tag_name, class_name, text) => {
	const element = document.createElement(tag_name);
	element.className = class_name;
	if (text !== undefined)
		element.textContent = text;
	return element;
};

const createButton = (class_name, label) => {
	const button = createElement('button', class_name, label);
	button.type = 'button';
	return button;
};

const buildToggle = () => {
	const toggle = createButton('assistant-toggle', 'Assistant');
	toggle.setAttribute('aria-expanded', 'false');
	toggle.setAttribute('aria-controls', 'assistant-panel');
	return toggle;
};

const buildInput = () => {
	const input = createElement('input', 'assistant-input');
	input.type = 'text';
	input.maxLength = MAX_QUERY_LENGTH;
	input.placeholder = 'Where do you want to look?';
	input.setAttribute('aria-label', 'Tell the assistant where to look');
	return input;
};

const buildPreview = () => {
	const preview = createElement('div', 'assistant-preview');
	preview.hidden = true;
	const sentence = createElement('div', 'assistant-preview-text');
	const actions = createElement('div', 'assistant-preview-actions');
	const go = createButton('assistant-go', 'Go');
	const cancel = createButton('assistant-cancel', 'Cancel');
	actions.append(go, cancel);
	preview.append(sentence, actions);
	return { preview, sentence, go, cancel };
};

const assemble = container => {
	const toggle = buildToggle();
	const panel = createElement('div', 'assistant-panel');
	panel.id = 'assistant-panel';
	panel.hidden = true;
	panel.setAttribute('role', 'dialog');
	panel.setAttribute('aria-label', 'DELPHI navigation assistant');
	const log = createElement('div', 'assistant-log');
	log.setAttribute('role', 'log');
	log.setAttribute('aria-live', 'polite');
	const status = createElement('div', 'assistant-status', '');
	const preview_parts = buildPreview();
	const input = buildInput();
	const form = createElement('form', 'assistant-form');
	form.append(input, createElement('button', 'assistant-send', 'Send'));
	panel.append(log, preview_parts.preview, status, form);
	container.append(toggle, panel);
	return { toggle, panel, log, status, input, form, ...preview_parts };
};

/**
 * Appends one line to the transcript. Gene names, population labels and
 * anything else of data provenance land here, so text is written with
 * textContent and never as markup.
 */
const addLine = (elements, role, text) => {
	elements.log.append(createElement('div', `assistant-line assistant-${role}`, text));
	elements.log.scrollTop = elements.log.scrollHeight;
};

const setOpen = (elements, is_open) => {
	elements.panel.hidden = !is_open;
	elements.toggle.setAttribute('aria-expanded', String(is_open));
	if (is_open)
		elements.input.focus();
	else
		elements.toggle.focus();
};

const showPreview = (elements, sentence) => {
	elements.sentence.textContent = sentence;
	elements.preview.hidden = false;
	elements.go.focus();
};

const clearPreview = elements => {
	elements.preview.hidden = true;
	elements.sentence.textContent = '';
};

const wireOpening = (elements, onOpen) => {
	elements.toggle.addEventListener('click', () => {
		const is_open = elements.panel.hidden;
		setOpen(elements, is_open);
		if (is_open)
			onOpen();
	});
};

const wireEscape = (elements, onCancel) => {
	elements.panel.addEventListener('keydown', event => {
		if (event.key !== 'Escape')
			return;
		if (elements.preview.hidden)
			return setOpen(elements, false);
		clearPreview(elements);
		onCancel();
		elements.input.focus();
	});
};

const wireForm = (elements, onSubmit) => {
	elements.form.addEventListener('submit', event => {
		event.preventDefault();
		const query = elements.input.value.trim();
		if (query === '')
			return;
		elements.input.value = '';
		clearPreview(elements);
		addLine(elements, 'user', query);
		onSubmit(query);
	});
};

const wireDecision = (elements, onConfirm, onCancel) => {
	elements.go.addEventListener('click', () => {
		clearPreview(elements);
		onConfirm();
		elements.input.focus();
	});
	elements.cancel.addEventListener('click', () => {
		clearPreview(elements);
		onCancel();
		elements.input.focus();
	});
};

/**
 * Builds the panel shell and returns the only things the rest of the assistant
 * may do to it. The panel knows nothing about parsing, patches or the proxy: it
 * passes typed text out, shows a proposed change, and reports Go or Cancel.
 */
export const createPanel = (container, { onSubmit, onOpen, onConfirm, onCancel }) => {
	const elements = assemble(container);
	wireOpening(elements, onOpen);
	wireEscape(elements, onCancel);
	wireForm(elements, onSubmit);
	wireDecision(elements, onConfirm, onCancel);
	return {
		say: text => addLine(elements, 'assistant', text),
		setStatus: text => { elements.status.textContent = text; },
		setBusy: is_busy => { elements.input.disabled = is_busy; },
		propose: sentence => showPreview(elements, sentence),
		close: () => setOpen(elements, false)
	};
};
