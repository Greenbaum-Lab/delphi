'use strict';

importScripts('/pyodide/dist/pyodide.js');

const pre_plot_code = (pyodide) => {
	const code = `import os
os.environ['MPLBACKEND'] = 'AGG'
import matplotlib.pyplot as plt
import io
import base64

saved_images = []
csv_text = []

def save_image():
	image_bytes = io.BytesIO()
	plt.savefig(image_bytes, format='png', dpi=300)
	plt.close()
	image_bytes.seek(0)
	saved_images.append(base64.b64encode(image_bytes.read()).decode('utf-8'))
	image_bytes.close()

def save_csv(data):
	csv_text.append(data.to_csv(index=False))

cache_key = ','.join(sorted(options['cohort']['datasets']))
if not cache_key in sample_cache:
	raw_sample_metadata = await get_sample_metadata(options['cohort']['datasets'])
	sample_cache[cache_key] = pd.DataFrame(raw_sample_metadata)
	sample_cache[cache_key].set_index('Poseidon_ID', inplace=True)
samples_metadata = sample_cache[cache_key]

plt.show = save_image
`;
	return pyodide.runPythonAsync(code);
};

const stat_fs = (pyodide) => async (path) => {
	const fs = pyodide.FS;
	const dir = path.slice(0, path.lastIndexOf('/')) || '/';
	try {
		fs.stat(dir);
	} catch {
		fs.mkdir(dir);
		fs.mount(fs.filesystems.IDBFS, {}, dir);
	}
	await new Promise(r => fs.syncfs(true, r));
	try {
		fs.stat(path);
		return true;
	} catch {
	}
	const url = '/pyodide_fs' + path;
	const data = new Uint8Array(await fetch(url).then(r => r.arrayBuffer()));
	fs.writeFile(path, data);
	await new Promise(r => fs.syncfs(false, r));
	return false;
};

const get_sample_metadata = (pyodide) => (datasets) => new Promise(resolve => {
	const request = {request_id: parseInt(Math.random()*1e9).toString(), type: 'data', data: datasets.toJs({dict_converter: it => Object.fromEntries(it)})};
	self.addEventListener('message', e => {
		const response = e.data;
		if (response.request_id !== request.request_id)
			return;
		resolve(pyodide.toPy(response.data));
	});
	self.postMessage(request);
});

const load_pyodide = async (cache) => {
	if (cache.pyodide)
		return cache.pyodide;
	const pyodide = await loadPyodide({ stderr: () => {} });
	pyodide.setStdout({ batched: msg => console.log(msg) });
	pyodide.setStderr({ batched: msg => console.error(msg) });
	pyodide.registerJsModule('js_utils', {stat_fs: stat_fs(pyodide), get_sample_metadata: get_sample_metadata(pyodide)});
	await pyodide.loadPackage(['micropip', 'numpy', 'pandas', 'matplotlib', 'scikit-learn'], { messageCallback(){}, errorCallback(){} });
	await pyodide.runPythonAsync(`import os
import pandas as pd
from js_utils import stat_fs, get_sample_metadata
os.environ['MPLBACKEND'] = 'AGG'
sample_cache = {}
await stat_fs('/fonts/OpenSans-Regular.ttf')
from matplotlib import font_manager, rcParams
font_manager.fontManager.addfont('/fonts/OpenSans-Regular.ttf')
rcParams.update({'svg.fonttype': 'none', 'pdf.fonttype': 42, 'ps.fonttype': 42, 'font.family': 'Open Sans', 'xtick.labelsize': 12, 'ytick.labelsize': 12})
`);
	cache.pyodide = pyodide;
	return pyodide;
};

const generate_plot = async (cache, script, python_globals) => {
	const pyodide = await load_pyodide(cache);
	for (const prop in python_globals)
		pyodide.globals.set(prop, pyodide.toPy(python_globals[prop]));
	await pre_plot_code(pyodide);
	await pyodide.runPythonAsync(script);
	const saved_images_proxy = pyodide.globals.get('saved_images');
	const csv_text_proxy = pyodide.globals.get('csv_text');
	const saved_images = saved_images_proxy?.toJs ? saved_images_proxy.toJs({dict_converter: it => Object.fromEntries(it)}) : saved_images_proxy;
	const csv_text = csv_text_proxy?.toJs ? csv_text_proxy.toJs({dict_converter: it => Object.fromEntries(it)}) : csv_text_proxy;
	saved_images_proxy?.destroy ? saved_images_proxy.destroy() : 0;
	csv_text_proxy?.destroy ? csv_text_proxy.destroy() : 0;
	return {saved_images, csv_text};
};

const run_code = async (cache, script, python_globals) => {
	const pyodide = await load_pyodide(cache);
	for (const prop in python_globals)
		pyodide.globals.set(prop, pyodide.toPy(python_globals[prop]));
	try {
		await pyodide.runPythonAsync(script);
	} catch (e) {
		console.log('Failed to run Python script', e);
	}
	const outputPr = pyodide.globals.get('output');
	const result = outputPr?.toJs ? outputPr.toJs({dict_converter: it => Object.fromEntries(it)}) : outputPr;
	outputPr?.destroy ? outputPr.destroy() : 0;
	return result;
};

const run_local_analysis = async (cache, script, analysis, worker_queue) => {
	const {distribute} = await import('/jobs.js');
	const job = await distribute(analysis.jobs, worker_queue);
	//const cache = await caches.open('mdx_cache_adna');
	/* saveAsset
	await cache.put(
		`/analysis/${ticket.result_id}.json`,
		new Response(JSON.stringify(job), {headers: {'Content-Type': 'application/json'}}) // Check what this saves
	);
	*/
	return ticket;
};

const processRequest = async (request, worker_queue, cache) => {
	const { type, request_id, script, python_globals } = request;
	const request_map = {code: run_code, plot: generate_plot, analysis: run_local_analysis};
	if (request_map[type] === undefined) {
		self.postMessage({request_id, type: 'error', error: 'Invalid request type'});
		return;
	}
	try {
		const output = await request_map[type](cache, script, python_globals, worker_queue);
		self.postMessage({request_id, type: 'result', data: output});
	} catch (e) {
		self.postMessage({request_id, type: 'error', data: e});
	}
};

(async (worker_queue = {}, cache = {}, job_queue = []) => {
	let is_processing = false;
	const processQueue = async () => {
		if (is_processing)
			return;
		is_processing = true;
		while (job_queue.length > 0) {
			const request = job_queue.shift();
			await processRequest(request, worker_queue, cache);
		}
		is_processing = false;
	};
	self.addEventListener('message', async e => {
		const request = e.data;
		if (request.type === 'data')
			return;
		job_queue.push(request);
		processQueue();
	});
})();
