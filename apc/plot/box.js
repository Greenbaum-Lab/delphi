import { range } from '/apc/graphics/core.js';
import { getIDBObject } from '/apc/cache.js';

const functionsFromCode = code =>
	Object.fromEntries(Array.from(
		code.matchAll(
			/(?:^|\n)(?![ \t])(?:@[\w.]+\s*(?:\([^)]*\))?\s*\n(?![ \t]))*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\((?:[^()#]|#.*|\\\n|\n[^\S\n]*)*\)\s*(?:->\s*[^\s:]+)?\s*:[\s\S]*?(?=\n(?![ \t])(?:def\s|async\s+def\s|class\s|@|$))/g
		)
	)
		.filter(f => f[1] !== 'run_analysis')
		.map(f => [f[1], {
			name: f[1],
			label: f[1].replace(/__(.*?)__/, ' ($1)').replace(/_/g, ' '),
			code: f[0]
		}]));

const toggleLoader = (elem, off = false) => {
	if (off) {
		elem.querySelector('.loader')?.remove();
		return;
	}
	const ld = document.createElement('div');
	ld.classList.add('loader');
	ld.style.width = `${elem.offsetWidth}px`;
	ld.style.height = `${elem.offsetHeight}px`;
	ld.innerHTML =
		'<svg width="50" height="50" viewBox="0 0 50 50">' +
		'<circle cx="25" cy="25" r="20" fill="none" stroke="#aaa" stroke-width="6" stroke-dasharray="40 60"></circle>' +
		'<circle cx="25" cy="25" r="20" fill="none" stroke="#ccc" stroke-width="6" stroke-dasharray="50 60"></circle>' +
		'</svg>';
	elem.appendChild(ld);
};

const runPythonInWorker = (script, params) => new Promise(resolve => {
	const worker_elem = document.querySelector('[data-worker="dedicated"]');
	const request_id = crypto.randomUUID();
	const handler = e => {
		const msg = e.detail;
		if (msg.request_id !== request_id)
			return;
		worker_elem.removeEventListener('worker_response', handler);
		if (msg.type === 'error')
			return console.error(msg.data);
		resolve(msg.data);
	};
	worker_elem.addEventListener('worker_response', handler);
	worker_elem.addEventListener('worker_error', handler);

	worker_elem.dispatchEvent(new CustomEvent('worker_message', {
		detail: {
			request_id,
			type: 'plot',
			script,
			params
		}
	}));
});

const initImageContainer = (container, ratio = 2) => {
	const dims = [container.offsetWidth, container.offsetWidth / ratio];
	container.dataset.width = dims[0];
	container.dataset.height = dims[1];
	container.style.width = dims[0];
	container.style.height = dims[1];
	return container;
};

const generatePlot = async (plot_box, code_functions, analysis_options, results) => {
	const img_container = plot_box.querySelector('.img-content');
	toggleLoader(img_container);
	const show_detail = plot_box.querySelector('.checkbox[data-name="show_detail"]').classList.contains('checked');
	const current_plot = plot_box.querySelector('[name="plot_function_name"]').value;
	const function_code = code_functions[current_plot].code;
	const complete_script = `${function_code}\n\noutput = ${current_plot}(options, results)`;
	const options = Object.assign({}, analysis_options, {show_detail});
	const base64_png = await runPythonInWorker(
		complete_script,
		{options, results, dims: [img_container.dataset.width, img_container.dataset.height]}
	);
	const png_blob = await fetch(`data:image/png;base64,${base64_png}`).then(r => r.blob());
	const img_id = Math.round(Math.random() * 1e8);
	const img_req = new Request(`/images/plot_${img_id}.png`);
	const img_resp = new Response(png_blob, { headers: { 'Content-Type': 'image/png' } });
	const cache = await caches.open('mdx_cache_adna');
	await cache.put(img_req, img_resp);
	img_container.innerHTML = `<img src="/images/plot_${img_id}.png">`;
	toggleLoader(img_container, true);
};

export const addPythonPlot = async (id, code, options, results) => {
	const plot_box = document.createElement('div');
	plot_box.classList.add('popup', 'narrow', 'moveable');
	const user_functions = await getIDBObject('apc', 'plots', id) || {};
	const code_functions = Object.assign(functionsFromCode(code), user_functions);
	const function_selector = Object.values(code_functions).map((f,i) => `<option value="${f.name}">${f.label}</option>`).join('');
	plot_box.innerHTML = `<div class="header"><a data-icon="x" data-action="close" class="right"></a><a class="right" data-action="minimize"></a><h3>${options.params.label || 'Plot results'}</h3></div><div class="img-content"></div><div class="popup-footer"><select name="plot_function_name" value="${Object.keys(code_functions)[0]}">${function_selector}</select> <a class="checkbox" data-name="show_detail">Show detail</a><a class="right" data-action="save">Save</a><a class="right" data-action="export-data">Export</a><a class="right" data-icon="E" data-action="show-code">Edit code</a></div>`;
	document.querySelector('.map-container').appendChild(plot_box);
	initImageContainer(plot_box.querySelector('.img-content'));
	plot_box.querySelectorAll('[name="plot_function_name"], [data-name="show_detail"]').forEach(elem => elem.addEventListener('change', e => generatePlot(plot_box, code_functions, options, results)));
	plot_box.querySelector('[name="plot_function_name"]').dispatchEvent(new Event('change'));
};
