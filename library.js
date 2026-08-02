import { addHooks, errorBox, getOptions } from '/apc/common.js';
import { addBox } from '/apc/form.js';
import { getIDBObject, listIDBTable } from '/apc/cache.js';
import { COLUMN_DESCRIPTIONS } from '/common.js';
import { CONFIG, getMetadata, listAnnotations, getAnnotationEntry } from '/assets.js';
import { getPopsData, getPopData, addPopulation, deletePopulations } from '/browser/pops.js';

const formatRowCount = (count, noun) => {
	const label = count === 1 ? noun.replace(/s$/, '') : noun;
	return `${count} ${label}`;
};

const urlCellRenderer = (url_field) => params => {
	const url = params.data[url_field];
	if (!url)
		return document.createTextNode(params.value || '');
	const link = document.createElement('a');
	link.href = url;
	link.target = '_blank';
	link.rel = 'noopener';
	link.textContent = params.value || url;
	return link;
};

const loadTable = async (label, data, buttons = '', columns = [], categorical_columns = [], link_columns = [], select_rows = 'multiRow', selected_rows = {}, row_noun = 'rows') => {
	const form = addBox(document.querySelector('[data-module="browser"]'), `${label}`, '<div class="ag-grid-container"></div>', `<span class="row-count"></span>${buttons}`);
	if (!form)
		return;
	form.classList.add('aggrid');
	form.dataset.cols = 1;
	form.style.height = '80%';
	form.style.maxHeight = '80%';

	const column_descriptions = await COLUMN_DESCRIPTIONS;

	const custom_column_defs = Object.fromEntries(
		categorical_columns.map(col_label => ([
			col_label,
			{
				field: col_label,
				headerTooltip: column_descriptions[col_label],
				filter: 'agTextColumnFilter',
				cellRenderer: params => {
					const link = document.createElement('a');
					link.href = '#';
					link.textContent = params.value;
					link.addEventListener('click', async ev => {
						ev.preventDefault();
						const api = params.api;
						const colId = params.column.getColId();
						const active = api.getColumnFilterModel(colId);
						const same = active && active.type === 'equals' && active.filter === params.value;
						await api.setColumnFilterModel(
							colId,
							same ? null : { filterType: 'text', type: 'equals', filter: params.value }
						);
						api.onFilterChanged();
					});
					return link;
				}
			}
		]))
	);

	const link_column_defs = Object.fromEntries(
		link_columns.map(link_column => ([
			link_column.label,
			{
				field: link_column.label,
				headerTooltip: column_descriptions[link_column.label],
				filter: true,
				cellRenderer: link_column.url ? urlCellRenderer(link_column.url) : params => {
					const a = document.createElement('a');
					a.dataset.linkTable = link_column.table;
					a.dataset.linkId = params.data[link_column.source];
					a.textContent = params.value;
					return a;
				}
			}
		]))
	);

	const rowData = data.map(row => Object.assign({}, row));

	const column_labels = columns.length > 0 ? columns : Object.keys(rowData[0]);
	const getFirstValue = (row_array, col_key, limit=1000) => {
		for (let i = 0; i < limit && i < row_array.length; i++) {
			const v = row_array[i][col_key];
			if (v != null && v !== 'N/A') return v;
		}
		return null;
	};
	const column_defs = column_labels.map(label =>
		link_column_defs[label] ||
		custom_column_defs[label] ||
		(() => {
			const first_sample_value = getFirstValue(rowData, label);
			return {
				field: label,
				headerTooltip: column_descriptions[label],
				sortable: true,
				filter: true,
				pinned: label === 'Poseidon_ID' ? 'left' : undefined,
				valueFormatter: p => p.value == null ? 'N/A' : p.value.toLocaleString(),
				cellDataType: (!Array.isArray(first_sample_value) && !isNaN(first_sample_value)) ? 'number' : 'text',
				hide: Array.isArray(first_sample_value)
			};
		})()
	);

	if (column_defs.length < 5)
		column_defs.forEach(col => col.flex = 1);

	if (Object.keys(selected_rows).length > 0) {
		const [selected_field, selected_values] = Object.entries(selected_rows)[0];
		rowData.forEach(r => r.selected_first = selected_values.includes(r[selected_field]) ? 1 : 0);
		column_defs.unshift({field: 'selected_first', sortable: true, hide: true});
	}

	const grid_elem = form.querySelector('.ag-grid-container');
	const row_count_elem = form.querySelector('.row-count');

	let grid_ready_resolve;
	const grid_ready_promise = new Promise(resolve => { grid_ready_resolve = resolve; });

	const grid_options = {
		animateRows: false,
		suppressColumnMoveAnimation: true,
		pagination: false,
		enableCellTextSelection: true,
		ensureDomOrder: true,
		rowSelection: select_rows === 'none' ? false : { mode: select_rows, enableClickSelection: false, selectAll: 'filtered' },
		onRowClicked: params => params.node.setSelected(!params.node.isSelected()),
		onGridReady: params => {
			if ('selected_first' in rowData[0]) {
				params.api.applyColumnState({
					state: [{colId: 'selected_first', sort: 'desc'}],
					defaultState: {sort: null}
				});
				params.api.forEachNode(n => {
					if (n.data.selected_first) n.setSelected(true);
				});
			}
			grid_ready_resolve(grid_elem);
		},
		onSelectionChanged: () => grid_elem.dispatchEvent(new CustomEvent('agselection', { bubbles: true })),
		onModelUpdated: params => { row_count_elem.textContent = formatRowCount(params.api.getDisplayedRowCount(), row_noun); },
		cellFlashDuration: 0,
		cellFadeDuration: 0,
		columnDefs: column_defs,
		selectionColumnDef: {pinned: 'left'},
		rowData
	};

	const grid_api = agGrid.createGrid(grid_elem, grid_options);
	grid_elem.api = grid_api;
	return grid_ready_promise;
};

const convertSimpleFilter = (field, condition) => {
	switch (condition.type) {
		case 'equals':
			return { field, value: condition.filter };
		case 'notEqual':
			return { field, not_value: condition.filter };
		case 'lessThan':
		case 'lessThanOrEqual':
			return { field, range: [undefined, condition.filter] };
		case 'greaterThan':
		case 'greaterThanOrEqual':
			return { field, range: [condition.filter, undefined] };
		case 'inRange':
			return { field, range: [condition.filter, condition.filterTo] };
		case 'contains':
			return { field, contains: condition.filter };
		case 'notContains':
			return { field, not_contains: condition.filter };
		case 'blank':
			return { field, blank: true };
		case 'notBlank':
			return { field, not_blank: true };
		default:
			return null;
	}
};

const getColumnFilters = api => {
	const model = api.getFilterModel();
	const output = [];
	for (const [field, entry] of Object.entries(model)) {
		if (entry.filterType === 'set') {
			output.push({ field, values: entry.values.slice() });
			continue;
		}
		if (Array.isArray(entry.conditions) && entry.conditions.length) {
			const conditions = entry.conditions
				.map(c => convertSimpleFilter(field, c))
				.filter(Boolean);
			if (conditions.length)
				output.push({ field, operator: entry.operator, conditions });
		} else {
			const simple = convertSimpleFilter(field, entry);
			if (simple)
				output.push(simple);
		}
	}
	return output;
};

const mapSelectFunction = async (container, type, accession_ids) => {
	switch(type) {
		case 'add-population': {
			const label = container.querySelector('input[name="population_label"]').value;
			if (!label || accession_ids.length < 2 || accession_ids.length > 5000)
				return false;
			await addPopulation(label, 'User', accession_ids);
			document.querySelector('[data-module="browser"]').dispatchEvent(new Event('populations-changed'));
			return true;
		}
		case 'update-populations': {
			getOptions([['populations', accession_ids]]);
			document.querySelector('[data-module="browser"]').dispatchEvent(new Event('update'));
			return true;
		}
		case 'remove-population': {
			deletePopulations(accession_ids);
			return true;
		}
		case 'update-annotations': {
			getOptions([['annotations', accession_ids]]);
			document.querySelector('[data-module="browser"]').dispatchEvent(new Event('update'));
			return true;
		}
	}
};

const getAnnotationIndex = async () => {
	const response = await fetch(`${CONFIG.S3_BASE_URL}/${CONFIG.INDEX_PATH}`, {cache: 'no-cache'});
	if (!response.ok)
		throw new Error(`Failed to fetch annotation index: ${response.status}`);
	return response.json();
};

const showTable = async (table_name, options={}) => {
	switch(table_name) {
		case 'samples': {
			try {
				const populations = options.populations ? await Promise.all(options.populations.map(getPopData)) : [];
				const sample_ids = populations.map(population => population.subset).flat();
				const samples = await getMetadata().then(samples => options.populations ? samples.filter(sample => sample_ids.includes(sample.Poseidon_ID)) : samples);
				const columns = Object.keys(samples[0]);
				const label = options.populations ? 'Population samples' : 'Select samples to create population';
				return loadTable(label, samples, options.populations ? '' : `<input type="text" name="population_label" placeholder="New population label"> <a data-action="select" data-select-col="Poseidon_ID" data-subfunction="add-population" class="button disabled" data-subfunction="add-population">Create population</a>`, columns, [], [], 'multiRow', {}, 'samples');
			} catch (e) {
				console.log(e);
				return errorBox('No samples found', 'Try refreshing your browser', document.querySelector('[data-module="browser"]'));
			}
		}
		case 'populations': {
			try {
				const populations_table = await getPopsData();
				const columns = Object.keys(populations_table[0]);
				return loadTable('Populations', populations_table, '<a data-action="select" data-select-col="label" data-subfunction="update-populations" class="button fright">Update</a>', columns, [], [], 'multiRow', {label: getOptions().populations}, 'populations');
			} catch (e) {
				console.log(e);
				return errorBox('No populations defined', 'Click "Generate new populations"', document.querySelector('[data-module="browser"]'));
			}
		}
		case 'annotations': {
			try {
				const annotation_keys = await listAnnotations();
				const [annotations, annotation_index] = await Promise.all([Promise.all(annotation_keys.map(getAnnotationEntry)), getAnnotationIndex()]);
				const annotation_rows = annotations.map(annotation => ({...annotation, ...annotation_index[annotation.label]}));
				return loadTable('Annotations', annotation_rows, '<a data-action="select" data-select-col="label" data-subfunction="update-annotations" class="button fright">Add annotations</a><a data-action="upload-annotation" class="button">Upload from computer</a>', ['Name', 'Category', 'Subcategory', 'Description', 'Reference'], ['Category', 'Subcategory'], [{label: 'Reference', url: 'Link'}], 'multiRow', {label: getOptions().annotations}, 'annotations');
			} catch (e) {
				console.log(e);
				return errorBox('No annotations available', '', document.querySelector('[data-module="browser"]'));
			}
		}
	}
};

const refreshTable = async (table_name, label) => {
	const popup = document.querySelector('[data-module="browser"]').querySelector(`.popup[data-title="${label}"]`);
	if (!popup)
		return;
	popup.remove();
	await showTable(table_name);
};

const hooks = [
	['[data-action="open-populations"]', 'click', e => {
		showTable('populations');
	}],
	['[data-action="new-population"]', 'click', e => {
		showTable('samples');
	}],
	['[data-action="open-annotations"]', 'click', e => {
		showTable('annotations');
	}],
	['[data-action="upload-annotation"]', 'click', e => {
		document.querySelector('[data-module="browser"]').dispatchEvent(new Event('upload-annotation'));
	}],
	['[data-module="browser"]', 'populations-changed', () => refreshTable('populations', 'Populations')],
	['[data-module="browser"]', 'annotations-changed', () => refreshTable('annotations', 'Annotations')],
	['[data-action="individuals"]', 'click', async e => {
		const track = e.target.closest('[data-module="track"]');
		const populations = track.dataset.population.split(';');
		showTable('samples', {populations});
	}],
	['[data-link-table]', 'click', async e => {
		const table_name = e.target.dataset.linkTable;
		const accession_id = e.target.dataset.linkId;
		e.target.closest('.popup').remove();
		showTable(table_name, {accession_id});
	}],
	['[data-action="show-table"]', 'click', async e => {
		const table_name = e.target.dataset.table || 'samples';
		const target = e.target.dataset.target ? e.target : undefined;
		const grid_elem = await showTable(table_name, {target});
		if (target)
			grid_elem.addEventListener('select', e => target.dispatchEvent(new CustomEvent('select', {detail: e.detail}), {once: true}));
	}],
	['.ag-grid-container', 'agselection', e => {
		const popup = e.target.closest('.popup');
		const selected = e.target.api.getSelectedRows().length;
		popup.querySelectorAll('[data-action="select"]').forEach(btn => btn.classList.toggle('disabled', selected === 0));
	}],
	['[data-action="select"]', 'click', async e => {
		const button = e.target;
		if (button.classList.contains('disabled'))
			return;
		const popup = button.closest('.popup');
		const column_name = button.dataset.selectCol;
		const subfunction = button.dataset.subfunction;
		const grid_elem = popup.querySelector('.ag-grid-container');
		const values = grid_elem.api.getSelectedRows().map(r => column_name !== undefined ? r[column_name] : r);
		if (subfunction)
			if (!(await mapSelectFunction(popup, subfunction, values)))
				return;
		grid_elem.dispatchEvent(new CustomEvent('select', { detail: { value: values.length === 1 ? values[0] : values } }));
		popup.remove();
	}],
];

export const init = async () => {
	addHooks(window, hooks);
	if (!window.agGrid) {
		await import('/aggrid/aggrid.js');
		const css = document.createElement('link');
		css.rel = 'stylesheet';
		css.href = '/aggrid/aggrid.css';
		document.head.appendChild(css);
	}
};
