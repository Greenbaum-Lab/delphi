import {mathNotation} from '/apc/common.js';

export const formError = (form, error, timeout=10000) => {
	const error_elem = document.createElement('div');
	error_elem.classList.add('error');
	error_elem.innerHTML = error;
	console.log(error);
	form.querySelector('.errors').appendChild(error_elem);
	setTimeout(() => error_elem.remove(), timeout);
};

export const formNotice = (form, notice, timeout=10000) => {
	const error_elem = document.createElement('div');
	error_elem.classList.add('error', 'success');
	error_elem.innerHTML = notice;
	form.querySelector('.errors').appendChild(error_elem);
	setTimeout(() => error_elem.remove(), timeout);
};

export const parametersForm = (params) => {
	return params.map(param => {
		const {name, label, value: default_value, description, values} = param;
		switch(true) {
			case values !== undefined:
				return `<div class="option" data-name="${name}" data-label="${label}"><label title="${description}">${mathNotation(label)}</label><div class="values"><select class="value" name="${name}" title="${description}">${values.split(',').map(value => `<option name="${value}"${default_value === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div></div>`;
			default:
				return `<div class="option" data-name="${name}" data-label="${label}"><label title="${description}">${mathNotation(label)}</label><div class="values"><input type="text" class="value" name="${name}" value="${default_value}" title="${description}"></div></div>`;
		}
	}).join('');
};

export const htmlFromFields = (fields, submit_action='submit', submit_label='Submit') => {
	const field_html = fields.map(field => {
		switch(field.type) {
			case 'hidden':
				return `<input type="hidden" name="${field.name}" value="${field.value || ''}">`;
			case 'password':
				return `<div class="field"><label>${field.label}</label><input type="password" name="${field.name}" placeholder="${field.placeholder || field.label}" title="${field.placeholder || field.label}" autocomplete="${field.value || ''}"></div>`;
			case 'select':
				const options = field.values.map(value => `<option value="${value}" ${value === field.value ? 'selected' : ''}>${value}</option>`).join('');
				return `<div class="field"><label>${field.label}</label><select name="${field.name}" title="${field.placeholder || field.label}">${options}</select></div>`;
			default:
				return `<div class="field"><label>${field.label}</label><input type="${field.type}" name="${field.name}" placeholder="${field.placeholder || field.label}" title="${field.placeholder || field.label}" value="${field.value || ''}"></div>`;
		}
	}).join('');
	return `<div class="errors"></div><form>${field_html}</form><a class="fright button" data-action="${submit_action}">${submit_label}</a>`;
};

export const readForm = (form, defaults = {}) => {
	if (!form)
		return defaults;
	const args = {};
	if (form.closest('.form.tabbed-content'))
		args['type'] = form.closest('.form.tabbed-content').querySelector('[data-tab].selected').dataset.tab;
	Array.from(form.querySelectorAll('[name]')).filter(item => item.closest('.form, [data-tab-content]') === form).forEach(item => {
		const name = item.getAttribute('name');
		const value = item.dataset.value || item.value;
		if (item.getAttribute('type') === 'checkbox')
			return item.checked ? Object.assign(args, {[name]: args[name] ? args[name].concat(value) : [value]}) : 0;
		if (item.tagName === 'SELECT' && item.getAttribute('multiple'))
			return Object.assign(args, {[name]: Array.from(item.children).filter(option => option.selected).map(option => option.value)});
		switch(item.dataset.type) {
			case 'json':
				Object.assign(args, {[name]: JSON.parse(value)});
				break;
			case 'vector':
				Object.assign(args, {[name]: value.split(',').map(v => +(v))});
				break;
			default:
				Object.assign(args, {[name]: value});
		}
	});
	Array.from(form.querySelectorAll('[data-entry]')).filter(item => item.parentElement.closest('.form, [data-tab-content]') === form).forEach(entry => {
		const name = entry.dataset.entry;
		const data = readForm(entry);
		if (data.name)
			Object.assign(args, {[name]: args[name] ? args[name].concat(data) : [data]});
	});
	return Object.assign(defaults, args);
};

export const addBox = (container, title, content, footer='', duplicate=false) => {
	const existing = container.querySelector(`.popup[data-title="${title}"]`);
	if (!duplicate && existing) {
		if (existing.closest('.minimized-tables'))
			container.appendChild(existing);
		return false;
	}
	const box = document.createElement('div');
	box.classList.add('popup');
	box.dataset.title = title;
	box.innerHTML = `<div class="header"><a data-action="close" data-icon="x"></a><a class="right" data-action="minimize"></a><h3>${title}</h3></div><div class="content">${content}</div><div class="form-footer">${footer}</div>`;
	container.append(box);
	return box;
};

export const addPopup = (container, title, tabs, callback, duplicate=false) => {
	if (!duplicate && container.querySelector(`.popup[data-title="${title}"]`))
		return;
	const form = document.createElement('div');
	form.dataset.title = title;
	form.classList.add('popup', 'form');
	container.append(form);
	form.classList.add('tabbed-content');
	const tabs_html = tabs.map(tab => `<a data-tab="${tab.name}" class="selected">${tab.label}</a>`).join('');
	const tab_content = tabs.map(tab => `<div data-tab-content="${tab.name}">${tab.form ? htmlFromFields(tab.form) : tab.content}</div>`).join('');
	form.innerHTML = `<div class="header"><a data-action="close" data-icon="x"></a><h3>${title}</h3></div><div class="cols"><div class="tabs">${tabs_html}</div>${tab_content}</div>`;
	form.addEventListener('click', e => {
		if (e.target.matches('[data-action="submit"]'))
			callback(readForm(e.target.closest('[data-tab-content], .form')), e.target.closest('[data-tab-content], .form'));
	});
	form.addEventListener('keyup', e => {
		if (e.keyCode !== 13)
			return;
		if (e.target.matches('[data-action="submit"]'))
			callback(readForm(form), form);
	});
	if (form.querySelector('[data-tab]'))
		form.querySelector('[data-tab]').dispatchEvent(new Event('click'));
	return form;
};
