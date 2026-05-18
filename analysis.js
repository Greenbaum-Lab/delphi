import { addHooks, errorBox, functionsFromPython } from '/apc/common.js';
import { addPopup, addBox, readForm, formError } from '/apc/form.js';
import { getIDBObject } from '/apc/cache.js';
import { addPythonPlot } from '/plot.js';
import { distribute, collect } from '/jobs.js';
import { getOptions } from '/common.js';
import { getWorkspace } from '/workspaces.js';

const htmlFromFields = (analysis, extras = '') =>
	`<div class="errors"></div>${extras}<a data-action="submit">Run</a>`;

const analysisTypes = [
	['frequency', 'Allele frequency', '<div class="field"><label>Variant</label><input name="variant_rsid" placeholder="Variant rsID (e.g., rs1234)"></div>', 'Track allele frequency over time in each subset'],
	['heterozygosity', 'Heterozygosity', '', 'Track changes in heterozygosity using impHet'],
	['fst', 'FST', '', 'Compute pairwise FST among all subsets'],
	['fst_mhc', 'FST (MHC)', '', 'Compute pairwise FST among all subsets (MHC-only)'],
	['emu_pca', 'PCA (EMU)', '', 'Run PCA on all samples in cohort using EMU'],
	['pgs', 'PGS', '', 'Compute PGS values for all samples in cohort'],
];

const validateForm = (form_data, form) => {
	const cohort_id = form.querySelector('[data-analysis-cohort]').dataset.analysisCohort;
	const type = form.querySelector('[data-analysis-type].selected')?.dataset.analysisType;
	if (cohort_id === '') {
		formError(form, 'Please choose a cohort first');
		return false;
	}
	if (!type) {
		formError(form, 'Please select an analysis type');
		return false;
	}
	if (form_data.type === 'frequency') {
		const variant_rsid = form.querySelector('[data-analysis-type="frequency"] [data-parameter="variant"]')?.dataset.value;
		if (!variant_rsid) {
			formError(form, 'Please specify a variant for the frequency analysis');
			return false;
		}
	} else if (form_data.type === 'pgs') {
		const pgs_id = form.querySelector('[data-analysis-type="pgs"] [data-parameter="pgs"]')?.dataset.value;
		if (!pgs_id) {
			formError(form, 'Please specify a PGS for the analysis');
			return false;
		}
	}
	return true;
};

const openAnalysisForm = (selected_cohort) => new Promise(async resolve => {
	const workspace = await getWorkspace();
	const current_cohort = selected_cohort ? workspace.cohorts.find(cohort => cohort.id === selected_cohort) : (workspace.cohorts.length > 0 ? workspace.cohorts.slice(-1)[0] : {id: '', label: 'No cohorts'});
	const container = document.querySelector('.map-container');
	const analysis_types_html = analysisTypes.map(analysis => `<a data-analysis-type="${analysis[0]}">${analysis[1]}<span class="parameters"></span><span class="description">${analysis[3]}</span></a>`).join('');
	const html_content = `<div class="field"><label>Label</label><input type="text" name="label" placeholder="Analysis label" class="analysis-label"></div><div class="field"><label>Cohort</label><a data-icon="E" data-action="show-table" data-table="cohorts" data-target="self" data-analysis-cohort="${current_cohort.id}" data-analysis-cohort-label="${current_cohort.label}">${current_cohort.label}</a></div><div class="field"><label>Variants</label><a class="edit-variants" data-action="show-table" data-table="variants" title="Variants">Select variants</a></div><div class="analysis-types">${analysis_types_html}</div><div class="errors"></div>`;
	const form = addBox(container, 'New analysis', html_content, '<a class="button" data-action="run-analysis">Run</a>');
	form.querySelector('[data-action="run-analysis"]').addEventListener('click', e => {
		const form_data = readForm(form);
		if (!validateForm(form_data, form))
			return;
		form_data.type = form.querySelector('[data-analysis-type].selected')?.dataset.analysisType;
		form_data.cohort = form.querySelector('[data-analysis-cohort]').dataset.analysisCohort;
		resolve([form_data, form]);
	});
	form.classList.add('form');
});

const runAnalysis = async (selected_cohort) => {
	const [params, form] = await openAnalysisForm(selected_cohort);
	const workspace = await getWorkspace();
	const cohort = workspace.cohorts.find(cohort => cohort.id === params.cohort);
	const subsets = cohort.subsets;
	if (params.type === 'frequency') {
		const variant_rsid = form.querySelector('[data-analysis-type="frequency"] [data-parameter="variant"]')?.dataset.value;
		params.variants = [{variant_rsid}];
	} else if (params.type === 'pgs') {
		params.pgs_id = form.querySelector('[data-analysis-type="pgs"] [data-parameter="pgs"]')?.dataset.value;
		params.variants = getOptions().variants;
	} else if (params.type === 'fst_mhc') {
		params.variants = [{"type":"region","range":"chr6:29690552-31478901","variant_coverage_min":0,"variant_maf_min":0,"variants_n":100000,"random_seed":5040,"chr":"6","start":29690552,"end":31478901}];
		params.type = 'fst';
	} else
		params.variants = getOptions().variants;
	form.classList.add('loading');
	const requests = await distribute(params, cohort.datasets, subsets);
	const analysis_metadata = Object.assign({}, params, {
		analysis_id: requests.result_id,
		timestamp: new Date().toLocaleString(),
		cohort,
		subsets,
		requests: requests.requests
	});
	await getIDBObject('dora', 'analyses', analysis_metadata.analysis_id, analysis_metadata);
	form.remove();
	showAnalysis(requests.result_id);
};

const showAnalysis = async (accession) => {
	const analysis_metadata = await getIDBObject('dora', 'analyses', accession);
	const box = errorBox('Loading results', `The results of "${analysis_metadata.label}" will be available in the analysis list and at the following URL when completed:</p><p><input class="copy-link" type="text" value="https://adna.modelrxiv.org/#analysis/${analysis_metadata.analysis_id}" readonly>`, document.querySelector('.map-container'));
	const results = await collect(analysis_metadata);
	addPythonPlot(analysis_metadata.label, analysis_metadata.type, {options: analysis_metadata, results});
	box.remove();
};

const setAnalysisLabel = () => {
	const elem = document.querySelector('.analysis-label');
	if (elem.dataset.status === 'edited')
		return;
	const cohort = elem.closest('.form').querySelector('[data-analysis-cohort]')?.dataset.analysisCohortLabel || '';
	const analysis_type = document.querySelector('[data-analysis-type].selected')?.dataset.analysisType || '';
	const analysis_label = analysis_type !== '' ? analysisTypes.find(analysis => analysis[0] === analysis_type)[1] : '';
	if (cohort === '' || analysis_label === '')
		return;
	elem.value = `${analysis_label} (${cohort})`;
};

const handleUrls = (hash) => {
	const parts = hash.slice(1).split('/');
	switch(parts[0]) {
		case 'analysis':
			return showAnalysis(parts[1]);
	}
};

const hooks = [
	['*', 'analysis', e => {
		const cohort = e.detail?.cohort || '';
		runAnalysis(cohort);
	}],
	['[data-link-table="plots"]', 'click', e => {
		const accession = e.target.dataset.linkId;
		showAnalysis(accession);
	}],
	['[data-analysis-cohort]', 'select', async e => {
		const workspace = await getWorkspace();
		const cohort = workspace.cohorts.find(cohort => cohort.id === e.detail.value);
		e.target.dataset.analysisCohort = cohort.id;
		e.target.dataset.analysisCohortLabel = cohort.label;
		e.target.innerText = cohort.label;
		setAnalysisLabel();
	}],
	['.analysis-label:not([data-status="edited"])', 'keyup', async e => {
		e.target.dataset.status = 'edited';
	}],
	['.popup.results [data-action="close"]', 'click', async e => {
		window.location.hash = '';
	}],
	['.code-console [data-action="hide"]', 'click', e => {
		e.target.closest('.code-console').classList.remove('show');
		document.querySelectorAll('[data-action="show-code"]').forEach(elem => elem.classList.remove('selected'));
	}],
	['.code-console .resize', 'mousedown', e => {
		const console_elem = e.target.closest('.code-console');
		const cm_elem = console_elem.querySelector('.CodeMirror');
		const cm_instance = cm_elem && cm_elem.CodeMirror;
		if (!cm_instance) return;
		const min_height = 100;
		const max_height = window.innerHeight / 2;
		const resize_offset = e.target.offsetTop;
		const tracking = e => {
			const pointer_height = window.innerHeight - e.clientY + resize_offset;
			const height = Math.max(min_height, Math.min(max_height, pointer_height));
			console_elem.style.height = height + 'px';
			const available_height = console_elem.clientHeight - cm_elem.offsetTop;
			cm_instance.setSize(null, available_height + 'px');
			cm_instance.refresh();
		};
		window.addEventListener('mousemove', tracking);
		window.addEventListener('mouseup', () => {
			window.removeEventListener('mousemove', tracking);
			cm_instance.refresh();
		}, {once: true});
	}],
	['.code-console [data-action="run-code"]', 'click', async e => {
		const code_console = e.target.closest('.code-console');
		const function_code = code_console.querySelector('textarea').value + '\n';
		const key = code_console.querySelector('.title').innerText.split(':');
		const current_functions = await getIDBObject('dora', 'analysis_functions', key[0]);
		const analysis_functions = Object.values(functionsFromPython(function_code));
		for (const analysis_function of analysis_functions)
			current_functions[analysis_function.name] = analysis_function;
		await getIDBObject('dora', 'analysis_functions', key[0], current_functions);
		code_console.plot.dispatchEvent(new Event('refresh'));
	}],
	['.code-console [data-action="reset-code"]', 'click', async e => {
		const code_console = e.target.closest('.code-console');
		code_console.classList.remove('show');
		document.querySelectorAll('[data-action="show-code"]').forEach(elem => elem.classList.remove('selected'));
		const key = code_console.querySelector('.title').innerText.split(':');
		code_console.querySelector('.title').innerText = '';
		const code = await fetch(key[0]).then(r => r.text());
		await getIDBObject('dora', 'analysis_functions', key[0], functionsFromPython(code));
		document.querySelectorAll('.popup.results').forEach(elem => elem.dispatchEvent(new Event('refresh')));
	}],
	['.code-console [data-action="show-errors"]', 'click', async e => {
		const code_console = e.target.closest('.code-console');
		code_console.classList.toggle('show-errors');
	}],
	['[data-analysis-type], [data-analysis-type] [data-parameter]', 'click', e => {
		const button = e.target.closest('[data-analysis-type]');
		if (button.classList.contains('selected') && !e.target.matches('[data-parameter]'))
			return;
		document.querySelectorAll('[data-analysis-type]').forEach(b => b.classList.remove('selected'));
		button.classList.add('selected');
		setAnalysisLabel();
		const parameter_selection = {
			frequency: { param: 'variant', table: 'bim' },
			pgs: { param: 'pgs', table: 'pgs-catalog' }
		}[button.dataset.analysisType];
		if (!parameter_selection || (button.querySelector('[data-parameter]') && !e.target.matches('[data-parameter]')))
			return;
		e.target.addEventListener('select', e => {
			const value = e.detail.value;
			if (!button.querySelector(`.parameters [data-parameter="${parameter_selection.param}"]`)) {
				const a = document.createElement('a');
				a.dataset.parameter = parameter_selection.param;
				button.querySelector('.parameters').appendChild(a);
			}
			const param_elem = button.querySelector(`.parameters [data-parameter="${parameter_selection.param}"]`);
			param_elem.dataset.value = value;
			param_elem.innerText = `(${value})`;
		}, {once:true});
		document.body.dispatchEvent(new CustomEvent('showtable', {detail: {table: parameter_selection.table, target: e.target}}));
	}],
	['[data-action="new-analysis"]', 'click', e => {
		const cohort = e.target.dataset.cohort || '';
		runAnalysis(cohort);
	}]
];

export const init = () => {
	addHooks(window, hooks);
	handleUrls(window.location.hash);
	window.addEventListener('hashchange', e => handleUrls(window.location.hash));
};
