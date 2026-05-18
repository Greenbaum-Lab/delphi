
const generateID = (k=16) => Array(k).fill(0).map(() => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.charAt(Math.floor(Math.random() * 62))).join('');

const pollResult = async (url, init_time=Math.round(new Date().getTime() / 1000), timeout=600, increment=5) => {
	const time_offset = Math.round(new Date().getTime() / 1000) - init_time;
	let retries = -1;
	while ((retries === -1 ? 0 : time_offset) + (++retries * (retries * increment) / 2) <= timeout) {
		await new Promise(resolve => setTimeout(resolve, increment * retries * 1000));
		try {
			const response = await fetch(url, {cache: 'no-cache', headers: {'Cache-Control': 'no-cache'}});
			if (!response.ok)
				throw 'Request failed';
			return response.json();
		} catch (e) {
			// Depending on fetch error, maybe stop polling
		}
	}
	throw 'Failed to load S3 object';
};

const deployToAWS = async (job) => { // Compression on payload
	const api_url = 'https://d.modelrxiv.org/adna';
	const request = await fetch(api_url, {method: 'post', body: JSON.stringify(job)}).then(res => res.json());
	return {job_id: request.job_uid};
};

const deployToWorker = (workers, job, job_id = generateID()) => {
	const worker = new Worker('/worker.js');
	workers.push(worker);
	worker.postMessage({job_id, job});
	const handle_response = e => {
		const message = e.data;
		if (message.type === 'error') {
			console.log('worker error', message);
			worker.terminate();
		}
	};
	worker.addEventListener('message', handle_response);
	return {job_id};
};

export const attachWorker = async (elem) => {
	const worker = new Worker('/worker.dedicated.js');
	elem.dataset.worker = 'dedicated';
	elem.addEventListener('worker_message', e => {
		const request = e.detail;
		worker.postMessage(request);
	});
	worker.addEventListener('message', async e => {
		const request = e.data;
		switch (true) {
			case request.type === 'error':
				elem.dispatchEvent(new CustomEvent('worker_error', {detail: request}));
				break;
			default:
				elem.dispatchEvent(new CustomEvent('worker_response', {detail: request}));
		}
	});
	worker.addEventListener('error', async e => {
		elem.dispatchEvent(new CustomEvent('error', {detail: {error: e.message}}));
	});
	elem.addEventListener('worker_terminate', e => {
		worker.terminate();
	});
	window.addEventListener('beforeunload', e => {
		worker.terminate();
	});
};

export const collect = async (result) => {
	// Try to download parts of job, stop once one fails
	const parts = [];
	for (const request of result.requests) {
		const result_part = request.job_id ? await pollResult(`/results/${request.job_id}.json`, result.time) : [];
		if (result_part === null)
			throw 'Empty result received';
		parts.push(result_part);
	}
	return parts;
};

export const distribute = async (params, bed_prefixes, subsets, workers = [], result_id = generateID()) => {
	const bed_by_location = bed_prefixes.reduce((a, bed_prefix) => { a[bed_prefix.startsWith('poseidon') ? 'aws' : 'local'].push(bed_prefix); return a }, {aws: [], local: []});
	const requests = await Promise.all(Object.entries(bed_by_location).filter(([_, bed_files]) => bed_files.length > 0).map(([job_type, bed_files]) => {
		switch(job_type) {
			case 'aws':
				return deployToAWS({params, bed_files, subsets});
			default:
				return deployToWorker(workers, {params, bed_files, subsets});
		}
	}));
	return {result_id, requests, time: Math.round(new Date().getTime() / 1000)};
};
