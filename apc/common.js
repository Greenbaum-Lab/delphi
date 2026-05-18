
export const color_cycle = [
	[31,119,180],
	[255,127,14],
	[44,160,44],
	[214,39,40],
	[148,103,189],
	[140,86,75],
	[227,119,194],
	[127,127,127],
	[188,189,34],
	[23,190,207],
	[60,119,180],
	[255,167,14],
	[44,160,74],
	[244,39,40],
	[148,143,189],
	[140,86,115],
	[255,119,194],
	[127,170,127],
	[188,189,70],
	[70,190,207]
];

export const range = (start, end, step=1) => Array.from(Array(Math.floor((end-start)/step))).map((v,i)=>start + i * step);
export const linspace = (start, end, n) => Array.from(Array(n)).map((v,i)=>start + i * ((end - start) / (n - 1)));
export const round = (n,p) => { var f = Math.pow(10, p); return Math.round(n * f) / f };
export const max = arr => arr.map((v,i) => [v, i]).sort((a,b) => b[0]-a[0])[0][1];
export const sum = (arr) => arr.reduce((a,v)=>a+v,0);
export const cumsum = arr => { let sum = 0; const out = []; for (const v of arr) { sum += v; out.push(sum) } return out; }
export const mean = arr => arr.reduce((a,v) => a+v, 0) / arr.length;
export const numericize = v => Array.isArray(v) ? v.map(numericize) : typeof v === 'object' ? Object.keys(v).reduce((a,_v)=>Object.assign(a, {[_v]: numericize(v[_v])}), {}) : (v !== '' && v !== null && !isNaN(v) ? +(v) : v);
export const queryFromPath = (path, defaults = {}) => numericize(path.substring(1).split('/').reduce((a,v,i,arr)=>i%2===0&&arr[i+1]!==undefined?Object.assign(a, {[v]: arr[i+1]}):a, defaults));
export const vcomp = (a,b,m) => a.map((v,i) => Array.isArray(v)?vcomp(v,b[i],m):b[i]!=null?(m==2?v*b[i]:m==1?v-b[i]:v+b[i]):v);
export const stddev = arr => Math.pow(vcomp(Array(arr.length).fill(-mean(arr)),arr).map((v)=>Math.pow(v,2)).reduce((a,b)=>a+b) / (arr.length - 1), 0.5);
export const unique = arr => arr.length === 0 ? [] : Object.keys(arr.reduce((a,v)=>Object.assign(a, {[v]: 1}), {}));
export const generateID = (k=8) => Array(k).fill(0).map(() => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.charAt(Math.floor(Math.random() * 62))).join('');

export const replaceStrings = obj => {
	Object.entries(obj).forEach(([prop, value]) => document.querySelectorAll(`[data-content="${prop}"]`).forEach(elem => elem.value !== undefined ? elem.value = value : elem.innerHTML = value));
	Object.entries(obj).forEach(([prop, value]) => document.querySelectorAll(`[data-href="${prop}"]`).forEach(elem => value.startsWith('/') ? elem.href = value : elem.href = elem.href + value));
};

export const shortNotation = (n) => {
	if (n === 0 || (n < 1000 && n >= 0.01))
		return n;
	const e = Math.floor(Math.log10(n));
	return `${round(n/Math.pow(10, e), 1)}e${e}`;
};

export const mathNotation = text => {
	const label = text.replace(/(^|[^a-zA-Z])([^\s\p{P}])(_|\^)(\{([^\{]+)\}|[^\s\p{P}])/u, (_, pre, name, type, sub, sub_curly) => `${pre}${name}<${type === '_' ? 'sub' : 'sup'}>${sub_curly || sub}</${type === '_' ? 'sub' : 'sup'}>`);
	return text.match(/^[^\s\p{P}](_|$)/u) ? `<i>${label}</i>` : label;
};

export const functionsFromPython = (code, ignore_functions=['run_analysis']) =>
	Object.fromEntries(Array.from(
		code.matchAll(
			/(?:^|\n)(?![ \t])(?:@[\w.]+\s*(?:\([^)]*\))?\s*\n(?![ \t]))*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\((?:[^()#]|#.*|\\\n|\n[^\S\n]*)*\)\s*(?:->\s*[^\s:]+)?\s*:[\s\S]*?(?=\n(?![ \t])(?:def\s|async\s+def\s|class\s|@|$))/g
		)
	)
		.filter(f => !f[1].startsWith('_') && !ignore_functions.includes(f[1]))
		.map(f => [f[1], {
			name: f[1],
			label: f[1].replace(/__(.*?)__/, ' ($1)').replace(/_/g, ' '),
			code: f[0]
		}]));

export const toCSV = (filename, data) => {
	const output = Object.keys(data[0]).join(',') + '\n' + data.map(line => Object.values(line).join(',')).join('\n') + '\n';
	const elem = document.createElement('a');
	elem.href = URL.createObjectURL(new Blob([output], {type: 'text/plain'}));
	elem.download = filename;
	document.body.appendChild(elem);
	elem.click();
	elem.remove();
};

export const confirmBox = (title, text, container=document.body) => new Promise(resolve => {
	const box = document.createElement('div');
	box.classList.add('popup', 'message');
	box.innerHTML = `<div class="header"><a data-icon="x" data-action="close" class="right"></a>${title}</div><div class="text"><p>${text}</p></div><div class="actions"><a class="button" data-action="confirm">Confirm</a><a class="button" data-action="cancel">Cancel</a></div>`;
	container.appendChild(box);
	box.querySelector('[data-action="confirm"]').addEventListener('click', () => {
		box.remove();
		resolve(1);
	});
	box.querySelector('[data-action="cancel"]').addEventListener('click', () => {
		box.remove();
		resolve(0);
	});
	box.querySelector('[data-action="close"]').addEventListener('click', () => {
		box.remove();
		resolve(0);
	});
});

export const errorBox = (title, text, container=document.body) => {
	const box = document.createElement('div');
	box.classList.add('popup', 'narrow');
	box.innerHTML = `<div class="header"><a data-icon="x" data-action="close" class="right"></a><h3>${title}</h3></div><div class="content"><p>${text}</p></div>`;
	container.appendChild(box);
	return box;
};

export const parseJSON = (json_string, default_value) => {
	try {
		return json_string === null ? default_value : JSON.parse(json_string);
	} catch {
		return default_value;
	}
};

export const getOptions = (update = [], defaults = {}, key_name = 'site_options') => {
	const options = parseJSON(localStorage.getItem(key_name), defaults);
	if (options === defaults)
		localStorage.setItem(key_name, JSON.stringify(defaults));
	if (update.length === 0)
		return options;
	for (const [key, value] of update)
		options[key] = value;
	localStorage.setItem(key_name, JSON.stringify(options));
	return options;
};

export const addModule = async (elem, name, options, replace_element=false) => {
	try {
		const module = await import(`/${name}.js`);
		const module_elem = replace_element ? elem : elem.appendChild(document.createElement('div'));
		module_elem.dataset.module = name;
		for (const prop in options)
			module_elem.dataset[prop] = options[prop];
		if (module.init)
			return module.init(module_elem);
	} catch (e) {
		console.log(`Failed to load module ${name}`);
	}
};


export const addHooks = (elem, hooks) => {
	const types = Array.from(new Set(hooks.map(h => h[1])));
	types.forEach(type => {
		const opts = { capture: true };
		if (type === 'wheel') opts.passive = false;
		elem.addEventListener(type, e => {
			hooks.forEach(([sel, t, fn]) => {
				if (t === type && e.target.matches(sel)) fn(e);
			});
		}, opts);
	});
};

export const hooks = [
	['[data-tab]', 'click', e => {
		const tabbed_content = e.target.closest('.tabbed-content');
		const tab_name = e.target.querySelector('select')?.value || e.target.dataset.tab;
		const multiple = tabbed_content.classList.contains('multiple-tabs');
		if (multiple) {
			e.target.classList.toggle('selected');
			tabbed_content.querySelector(`[data-tab-content="${tab_name}"]`).classList.toggle('selected');
		} else {
			tabbed_content.querySelectorAll('[data-tab]').forEach(elem => elem.classList.remove('selected'));
			tabbed_content.querySelectorAll('[data-tab-content]').forEach(elem => elem.classList.remove('selected'));
			e.target.classList.add('selected');
			tabbed_content.querySelector(`[data-tab-content="${tab_name}"]`).classList.add('selected');
		}
	}],
	['.shorten [data-action="more"]', 'click', e => {
		e.target.closest('.shorten').classList.toggle('show');
	}],
	['[data-action="close"], .close-popup', 'click', e => {
		e.target.closest('.popup').remove();
	}],
	['.copy-link', 'click', e => {
		e.target.select();
	}],
	['.checkbox', 'click', e => {
		e.target.classList.toggle('checked');
		e.target.dispatchEvent(new Event('change'));
	}],
	['.moveable .header, .moveable .header *', 'mousedown', e => {
		e.preventDefault();
		if (e.target.closest('.minimized-tables'))
			return;
		const panel = e.target.closest('.moveable');
		const container = panel.closest('.map-container') || panel.parentElement;
		const containerRect = container.getBoundingClientRect();
		const panelRect = panel.getBoundingClientRect();
		const offset = [e.clientX - panelRect.left, e.clientY - panelRect.top];
	
		const track = e => {
			e.preventDefault();
			const insideContainer =
				e.clientX >= containerRect.left &&
				e.clientX <= containerRect.right &&
				e.clientY >= containerRect.top &&
				e.clientY <= containerRect.bottom;
	
			if (!insideContainer) {
				return window.removeEventListener('mousemove', track);
			}
	
			panel.style.left = (e.clientX - containerRect.left - offset[0]) + 'px';
			panel.style.top = (e.clientY - containerRect.top - offset[1]) + 'px';
		};
	
		window.addEventListener('mousemove', track);
		window.addEventListener('mouseup', () => {
			window.removeEventListener('mousemove', track);
		}, {once: true});
	}],
];
