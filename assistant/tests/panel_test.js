import { createPanel } from '/assistant/panel.js';

const HOSTILE_TEXT = '<img src=x onerror="window.injected = true">';

const mountPanel = () => {
	const container = document.createElement('div');
	container.className = 'assistant';
	document.body.append(container);
	const submitted = [];
	const opened = [];
	const panel = createPanel(container, { onSubmit: text => submitted.push(text), onOpen: () => opened.push(true) });
	return { container, panel, submitted, opened };
};

const open = mounted => mounted.container.querySelector('.assistant-toggle').click();

const submit = (mounted, text) => {
	mounted.container.querySelector('.assistant-input').value = text;
	mounted.container.querySelector('.assistant-form').dispatchEvent(new Event('submit'));
};

const pressEscape = mounted => mounted.container.querySelector('.assistant-panel').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

const CASES = [
	['the panel starts closed', () => mountPanel().container.querySelector('.assistant-panel').hidden === true],
	['the toggle reports its state', () => mountPanel().container.querySelector('.assistant-toggle').getAttribute('aria-expanded') === 'false'],
	['opening unhides the panel', () => { const mounted = mountPanel(); open(mounted); return mounted.container.querySelector('.assistant-panel').hidden === false; }],
	['opening moves focus into the panel', () => { const mounted = mountPanel(); open(mounted); return document.activeElement === mounted.container.querySelector('.assistant-input'); }],
	['opening is reported once', () => { const mounted = mountPanel(); open(mounted); return mounted.opened.length === 1; }],
	['escape closes the panel', () => { const mounted = mountPanel(); open(mounted); pressEscape(mounted); return mounted.container.querySelector('.assistant-panel').hidden === true; }],
	['escape returns focus to the toggle', () => { const mounted = mountPanel(); open(mounted); pressEscape(mounted); return document.activeElement === mounted.container.querySelector('.assistant-toggle'); }],
	['submitting passes the text out', () => { const mounted = mountPanel(); submit(mounted, ' LCT '); return mounted.submitted[0] === 'LCT'; }],
	['submitting clears the input', () => { const mounted = mountPanel(); submit(mounted, 'LCT'); return mounted.container.querySelector('.assistant-input').value === ''; }],
	['an empty request is not passed out', () => { const mounted = mountPanel(); submit(mounted, '   '); return mounted.submitted.length === 0; }],
	['the request is echoed to the log', () => { const mounted = mountPanel(); submit(mounted, 'LCT'); return mounted.container.querySelector('.assistant-user').textContent === 'LCT'; }],
	['input length is capped', () => mountPanel().container.querySelector('.assistant-input').maxLength === 200],
	['markup in a reply stays text', () => { const mounted = mountPanel(); mounted.panel.say(HOSTILE_TEXT); return mounted.container.querySelector('.assistant-assistant').textContent === HOSTILE_TEXT; }],
	['markup in a reply creates no element', () => { const mounted = mountPanel(); mounted.panel.say(HOSTILE_TEXT); return mounted.container.querySelector('img') === null && window.injected === undefined; }],
	['markup in a request stays text', () => { const mounted = mountPanel(); submit(mounted, HOSTILE_TEXT); return mounted.container.querySelector('img') === null; }],
	['the status line is plain text', () => { const mounted = mountPanel(); mounted.panel.setStatus(HOSTILE_TEXT); return mounted.container.querySelector('.assistant-status').textContent === HOSTILE_TEXT; }],
	['busy disables the input', () => { const mounted = mountPanel(); mounted.panel.setBusy(true); return mounted.container.querySelector('.assistant-input').disabled === true; }]
];

const runCase = ([description, test_function]) => {
	try {
		return { description, passed: test_function() === true };
	} catch (error) {
		return { description, passed: false, error: error.message };
	}
};

const renderResult = (container, result) => {
	const line = document.createElement('div');
	line.className = result.passed ? 'pass' : 'fail';
	line.textContent = `${result.passed ? 'PASS' : 'FAIL'} ${result.description}${result.error ? ` (${result.error})` : ''}`;
	container.append(line);
};

export const runTests = () => {
	const container = document.querySelector('[data-results]');
	const results = CASES.map(runCase);
	results.forEach(result => renderResult(container, result));
	const failed = results.filter(result => !result.passed);
	const summary = document.createElement('div');
	summary.className = failed.length === 0 ? 'summary pass' : 'summary fail';
	summary.textContent = `${results.length - failed.length}/${results.length} passed`;
	container.append(summary);
	return { total: results.length, failed: failed.length };
};
