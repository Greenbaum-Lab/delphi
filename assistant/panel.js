const MAX_INPUT_LENGTH = 200;

const createElement = (tag_name, class_name, text) => {
	const element = document.createElement(tag_name);
	element.className = class_name;
	if (text !== undefined)
		element.textContent = text;
	return element;
};

const buildToggle = () => {
	const toggle = createElement('button', 'assistant-toggle', 'Assistant');
	toggle.type = 'button';
	toggle.setAttribute('aria-expanded', 'false');
	toggle.setAttribute('aria-controls', 'assistant-panel');
	return toggle;
};

const buildInput = () => {
	const input = createElement('input', 'assistant-input');
	input.type = 'text';
	input.maxLength = MAX_INPUT_LENGTH;
	input.placeholder = 'Name a gene, a region, or what to show';
	input.setAttribute('aria-label', 'Ask the assistant');
	return input;
};

const buildPanel = () => {
	const panel = createElement('div', 'assistant-panel');
	panel.id = 'assistant-panel';
	panel.hidden = true;
	panel.setAttribute('role', 'dialog');
	panel.setAttribute('aria-label', 'DELPHI assistant');
	return panel;
};

const buildLog = () => {
	const log = createElement('div', 'assistant-log');
	log.setAttribute('role', 'log');
	log.setAttribute('aria-live', 'polite');
	return log;
};

const buildForm = input => {
	const form = createElement('form', 'assistant-form');
	const send = createElement('button', 'assistant-send', 'Send');
	send.type = 'submit';
	form.append(input, send);
	return form;
};

const assemble = container => {
	const toggle = buildToggle();
	const panel = buildPanel();
	const log = buildLog();
	const status = createElement('div', 'assistant-status', '');
	const input = buildInput();
	panel.append(log, status, buildForm(input));
	container.append(toggle, panel);
	return { toggle, panel, log, status, input };
};

/**
 * Appends one line to the transcript. Text arrives from data of every
 * provenance, including gene and population names read from files, so it is
 * written with textContent and never as markup. There is no CSP behind this.
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

const wireKeyboard = (elements, onOpen) => {
	elements.toggle.addEventListener('click', () => {
		const is_open = elements.panel.hidden;
		setOpen(elements, is_open);
		if (is_open)
			onOpen();
	});
	elements.panel.addEventListener('keydown', event => {
		if (event.key === 'Escape')
			setOpen(elements, false);
	});
};

const wireForm = (elements, onSubmit) => {
	elements.panel.querySelector('.assistant-form').addEventListener('submit', event => {
		event.preventDefault();
		const request_text = elements.input.value.trim();
		if (request_text === '')
			return;
		elements.input.value = '';
		addLine(elements, 'user', request_text);
		onSubmit(request_text);
	});
};

/**
 * Builds the panel shell and returns the only four things the rest of the
 * assistant may do to it. The panel holds no knowledge of commands, resolvers
 * or actions; it passes the typed text out and writes text back.
 */
export const createPanel = (container, { onSubmit, onOpen }) => {
	const elements = assemble(container);
	wireKeyboard(elements, onOpen);
	wireForm(elements, onSubmit);
	return {
		say: text => addLine(elements, 'assistant', text),
		setStatus: text => { elements.status.textContent = text; },
		setBusy: is_busy => { elements.input.disabled = is_busy; },
		close: () => setOpen(elements, false)
	};
};
