import { addHooks, addModule, errorBox, getOptions } from '/apc/common.js';
import { getPops, initPopCache, getPopData, pairwiseSort } from '/browser/pops.js'; 
import { zoomToLevel, updateRegionFromInput, updateRegionInput } from '/browser/helpers.js';
import { addAnnotation } from '/custom_annotation.js';

const syncSortDropdown = (is_pairwise, current_sort) => {
	const selector = is_pairwise ? '.sort-selector-pairwise' : '.sort-selector';
	const dropdown = document.querySelector(selector);
	const valid_values = Array.from(dropdown.options).map(opt => opt.value);
	if (valid_values.includes(current_sort)) {
		dropdown.value = current_sort;
	} else {
		dropdown.value = dropdown.options[0].value;
		getOptions([['sort', dropdown.value]]);
	}
};

const DEFAULTS = {
	chr: 'chr1',
	start: 1000000,
	end: 2000000,
	viewfinder_start: 500000,
	viewfinder_end: 2500000,
	zoom_level: 15,
	mode: 'gnomad',
	measure: 'heterozygosity',
	sort: 'date',
	sort_dir: 'asc',
	window_size: 10000,
	show_guides: false,
	populations: [],
	annotations: ['gencode19_genes'],
	y_limits: {}
};

const defaultBounds = (measure) => {
	if (measure === 'fst') return '0,1';
	if (measure === 'heterozygosity') return '0,0.5';
	return '';
};

const boundsFor = (measure) => {
	const override = (getOptions().y_limits || {})[measure];
	return override ? override.join(',') : defaultBounds(measure);
};

const applyYLimits = () => {
	const bounds = boundsFor(getOptions().measure);
	document.querySelectorAll('.signal-tracks-container [data-module="track"][data-type="signal"]').forEach(track => {
		track.dataset.bounds = bounds;
		track.dispatchEvent(new Event('refresh'));
	});
};

const syncYLimitInputs = () => {
	const options = getOptions();
	const override = (options.y_limits || {})[options.measure];
	document.querySelector('[data-control="ymin"]').value = override ? override[0] : '';
	document.querySelector('[data-control="ymax"]').value = override ? override[1] : '';
};

const hooks = [
  	['[data-module="browser"]', 'refresh', async e => {
		const options = getOptions();
		const all_tracks = Array.from(e.target.querySelectorAll('[data-module="track"]'));
		const signal_tracks = Array.from(e.target.querySelectorAll('.signal-tracks-container [data-module="track"][data-type="signal"]'));
		const responses = [];
		for (const track of all_tracks) {
			if (track.dataset.type === 'signal') {
				responses.push(new Promise(resolve => {
					track.addEventListener('refreshed', e => resolve([track, e]), {once: true});
				}));
			}
			track.dispatchEvent(new Event('refresh'));
		}
		if (options.sort === 'signal') {
			const data = await Promise.all(responses).then(responses => responses.filter(([track]) => signal_tracks.includes(track)).map(([track, response]) => [track, response.detail?.signal || 0]));
			const tracks_container = e.target.querySelector('.signal-tracks-container');
			const sorted_tracks = data.sort((a, b) => options.sort_dir === 'desc' ? b[1] - a[1] : a[1] - b[1]);
			for (const track_data of sorted_tracks) {
				tracks_container.appendChild(track_data[0]);
			}
		}
    }],
	['[data-module="browser"]', 'update', async e => {
		const container = e.target.querySelector('.signal-tracks-container');
		const tracks = Array.from(container.querySelectorAll('[data-module="track"][data-type="signal"]'));
		const options = getOptions();
		const annotation_container = e.target.querySelector('.annotation-tracks-container');
		const existing_annotations = Array.from(annotation_container.querySelectorAll('[data-module="track"][data-type="annotation"]'));
		existing_annotations.filter(track => !options.annotations.includes(track.dataset.source)).forEach(track => track.remove());
		const existing_labels = existing_annotations.map(track => track.dataset.source);
		await Promise.all(options.annotations.filter(label => !existing_labels.includes(label)).map(label => addModule(annotation_container, 'track', {type: 'annotation', source: label})));
		const populations_metadata = await Promise.all(options.populations.map(getPopData));
		options.mode = populations_metadata.filter(population => population.Dataset === 'User' || population.Dataset === 'AADR').length > 0 ? 'adna' : 'gnomad';
		document.querySelector('.mode').innerHTML = options.mode === 'adna' ? '<a class="adna" data-icon="t" title="Data will be generated on the file using AADR genotypes">aDNA</a>' : '<a data-icon="I" title="Data will be generated using genotypes from gnomAD v3.1.2">gnomAD</a>'; // Temporarily here
		getOptions([['mode', options.mode]]);
		if (options.populations.length > 0 && container.querySelector('.empty-state'))
			container.querySelector('.empty-state').remove();
		tracks.forEach(track => track.remove());
		if (options.measure === 'fst') {
			document.querySelector('.tracks-controls').classList.add('pairwise');
			const pairs = [];
			const pair_metadata = [];
			for (let i = 0; i < populations_metadata.length; i++) {
				for (let j = i + 1; j < populations_metadata.length; j++) {
					pairs.push(`${populations_metadata[i].label};${populations_metadata[j].label}`);
					pair_metadata.push({
						pair: `${populations_metadata[i].label};${populations_metadata[j].label}`,
						sort_value: pairwiseSort(populations_metadata[i], populations_metadata[j], options.sort)
					});
				}
			}
			const sorted_pairs = pair_metadata.sort((pair1, pair2) => options.sort_dir === 'desc' ? pair2.sort_value - pair1.sort_value : pair1.sort_value - pair2.sort_value);
			await Promise.all(sorted_pairs.map(pair => addModule(container, 'track', {type: 'signal', population: pair.pair, style: 'binned', bounds: boundsFor(options.measure)})));
			syncSortDropdown(true, options.sort);
		} else {
			document.querySelector('.tracks-controls').classList.remove('pairwise');
			syncSortDropdown(false, options.sort);
			const sorted_populations = populations_metadata.sort((pop1, pop2) => options.sort_dir === 'desc' ? pop2[options.sort] - pop1[options.sort] : pop1[options.sort] - pop2[options.sort]);
			await Promise.all(sorted_populations.map(pop => addModule(container, 'track', {type: 'signal', population: pop.label, style: 'binned', bounds: boundsFor(options.measure)})));
		}
		document.querySelector('[data-module="browser"]').dispatchEvent(new Event('refresh'));
    }],
	['[data-action="search-annotation"]', 'click', e => {
		updateRegionFromInput();
	}],
	['[data-action="zoom-in"]', 'click', e => {
		const options = getOptions();
		zoomToLevel(options.zoom_level - 1);
	}],
 	['[data-action="zoom-out"]', 'click', e => {
 		const options = getOptions();
		zoomToLevel(options.zoom_level + 1);
	}],
	['.region-query', 'keypress', e => {
		if (e.key === 'Enter')
			updateRegionFromInput();
	}],
	['*', 'keydown', e => {
		if (e.key !== 'Escape') return;
		const popup = document.querySelector('.popup');
		if (popup) popup.remove();
	}],
	['.measure-selector', 'change', e => {
		const options = getOptions([['measure', e.target.value]]);
		document.querySelector('.y-axis-control').classList.remove('invalid');
		syncYLimitInputs();
		const browser = document.querySelector('[data-module="browser"]');
		browser.dispatchEvent(new Event('update'));
	}],
	['.window-selector', 'change', e => {
      	getOptions([['window_size', +e.target.value]]);
		e.target.closest('[data-module="browser"]').dispatchEvent(new Event('refresh'));
	}],
	['[data-action="toggle-sort"]', 'click', e => {
		const sort_dir = getOptions().sort_dir;
      	getOptions([['sort_dir', sort_dir === 'asc' ? 'desc' : 'asc']]);
		e.target.closest('[data-module="browser"]').dispatchEvent(new Event('update'));
	}],
	['[data-control="sort"]', 'change', e => {
      	getOptions([['sort', e.target.value]]);
		e.target.closest('[data-module="browser"]').dispatchEvent(new Event('update')); // Create new sort event
	}],
	['.track-move', 'mousedown', e => {
		e.target.closest('[data-module="track"]').classList.add('dragging-enabled');
	}],
	['.track-move', 'mouseup', e => {
		e.target.closest('[data-module="track"]').classList.remove('dragging-enabled');
	}],
	['[data-module="track"]', 'dragstart', e => {
		const track = e.target.closest('[data-module="track"]');
		if (!track.classList.contains('dragging-enabled'))
			return e.preventDefault();
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('text/html', track.innerHTML);
		track.classList.add('dragging');
	}],
	['[data-module="track"], [data-module="track"] *', 'dragenter', e => {
		const track = e.target.closest('[data-module="track"]');
		const dragging = document.querySelector('.dragging');
		if (track !== dragging && dragging) {
			const bounding = track.getBoundingClientRect();
			const offset = bounding.y + (bounding.height / 2);
			track.classList.remove('drop-above', 'drop-below');
			track.classList.add(e.clientY < offset ? 'drop-above' : 'drop-below');
		}
	}],
	['[data-module="track"], [data-module="track"] *', 'dragover', e => {
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
	}],
	['[data-module="track"], [data-module="track"] *', 'dragleave', e => {
		const track = e.target.closest('[data-module="track"]');
		if (!track.contains(e.relatedTarget))
			track.classList.remove('drop-above', 'drop-below');
	}],
	['[data-module="track"], [data-module="track"] *', 'drop', e => {
		e.preventDefault();
		const track = e.target.closest('[data-module="track"]');
		const dragging = document.querySelector('.dragging');
		if (!dragging || track === dragging)
			return;
		const insert_before = track.classList.contains('drop-above');
		track.parentNode.insertBefore(dragging, insert_before ? track : track.nextSibling);
		track.classList.remove('drop-above', 'drop-below');
		dragging.classList.remove('dragging', 'dragging-enabled');
	}],
	['[data-module="track"]', 'dragend', e => {
		e.target.closest('.tracks-container').querySelectorAll('[data-module="track"]').forEach(track => {
			track.classList.remove('dragging', 'drop-above', 'drop-below');
			track.classList.remove('dragging-enabled');
		});
	}],
	['[data-action="increase-track-size"]', 'click', e => {
		const root = document.documentElement;
		const current_height = parseInt(getComputedStyle(root).getPropertyValue('--track-height')) || 100;
		const new_height = Math.min(current_height + 10, 160);
		root.style.setProperty('--track-height', `${new_height}px`);
		e.target.closest('[data-module="browser"]').dispatchEvent(new Event('update'));
	}],
	['[data-action="decrease-track-size"]', 'click', e => {
		const root = document.documentElement;
		const current_height = parseInt(getComputedStyle(root).getPropertyValue('--track-height')) || 100;
		const new_height = Math.max(current_height - 10, 80);
		root.style.setProperty('--track-height', `${new_height}px`);
		e.target.closest('[data-module="browser"]').dispatchEvent(new Event('update'));
	}],
	['[data-action="display"]', 'click', e => {
		const track = document.querySelector('.signal-tracks-container [data-module="track"]');
		const current_display = track.dataset.style;
		const display_types = ['binned', 'line', 'scatter'];
		const next_style = display_types[(display_types.indexOf(current_display) + 1) % display_types.length];
		document.querySelectorAll('.signal-tracks-container [data-module="track"]').forEach(track => { track.dataset.style = next_style; track.dispatchEvent(new Event('refresh')) });	
	}],
	['[data-control="ymin"], [data-control="ymax"]', 'change', e => {
		const options = getOptions();
		if (!options.y_limits) options.y_limits = {};
		const min_input = document.querySelector('[data-control="ymin"]').value.trim();
		const max_input = document.querySelector('[data-control="ymax"]').value.trim();
		// Both blank clears the override and returns the current measure to auto-fit.
		if (min_input === '' && max_input === '') {
			delete options.y_limits[options.measure];
			getOptions([['y_limits', options.y_limits]]);
			applyYLimits();
			return;
		}
		const min = parseFloat(min_input);
		const max = parseFloat(max_input);
		if (isNaN(min) || isNaN(max) || min >= max) {
			e.target.closest('.y-axis-control').classList.add('invalid');
			return;
		}
		e.target.closest('.y-axis-control').classList.remove('invalid');
		options.y_limits[options.measure] = [min, max];
		getOptions([['y_limits', options.y_limits]]);
		applyYLimits();
	}],
	['[data-action="toggle-guides"]', 'click', e => {
		const show_guides = !getOptions().show_guides;
		getOptions([['show_guides', show_guides]]);
		document.querySelector('[data-action="toggle-guides"]').classList.toggle('active', show_guides);
		e.target.closest('[data-module="browser"]').dispatchEvent(new Event('refresh'));
	}],
	['[data-action="reset-defaults"]', 'click', e => {
		getOptions(Object.entries(DEFAULTS));
		document.querySelector('[data-control="measure"]').value = DEFAULTS.measure;
		document.querySelector('[data-control="window"]').value = DEFAULTS.window_size;
		syncSortDropdown(DEFAULTS.measure === 'fst', DEFAULTS.sort);
		document.querySelector('.y-axis-control').classList.remove('invalid');
		syncYLimitInputs();
		document.querySelector('[data-action="toggle-guides"]').classList.toggle('active', DEFAULTS.show_guides);
		updateRegionInput(DEFAULTS.chr, DEFAULTS.start, DEFAULTS.end);
		e.target.closest('[data-module="browser"]').dispatchEvent(new Event('update'));
	}],
	['[data-module="browser"]', 'upload-annotation', e => {
		addAnnotation(e.target);
	}],
	['[data-action="toggle-more-menu"]', 'click', e => {
		const menu = e.target.closest('.more-menu');
		const panel = menu.querySelector('[data-more-panel]');
		const opening = panel.hasAttribute('hidden');
		panel.toggleAttribute('hidden', !opening);
		menu.querySelector('.more-toggle').setAttribute('aria-expanded', String(opening));
	}],
	['*', 'click', e => {
		const menu = document.querySelector('.more-menu');
		if (!menu || menu.contains(e.target)) return;
		const panel = menu.querySelector('[data-more-panel]');
		if (!panel || panel.hasAttribute('hidden')) return;
		panel.setAttribute('hidden', '');
		menu.querySelector('.more-toggle').setAttribute('aria-expanded', 'false');
	}],
	['*', 'keydown', e => {
		if (e.key !== 'Escape') return;
		const panel = document.querySelector('[data-more-panel]:not([hidden])');
		if (!panel) return;
		panel.setAttribute('hidden', '');
		document.querySelector('.more-toggle').setAttribute('aria-expanded', 'false');
	}]
];

export const init = async (container) => {
	const options = getOptions(undefined, DEFAULTS);
	document.querySelector('[data-control="measure"]').value = options.measure;
	document.querySelector('[data-control="window"]').value = options.window_size;
	syncYLimitInputs();
	const is_pairwise = options.measure === 'fst';
	syncSortDropdown(is_pairwise, options.sort);
	await initPopCache();
	container.querySelector('.mode').innerHTML = options.mode === 'adna' ? '<a class="adna" data-icon="t" title="Data will be generated on the file using AADR genotypes">aDNA</a>' : '<a data-icon="I" title="Data will be generated using genotypes from gnomAD v3.1.2">gnomAD</a>';

	container.querySelector('[data-module="track"][data-type="viewfinder"]').dataset.source = options.annotations[0];
	document.querySelector('[data-action="toggle-guides"]').classList.toggle('active', options.show_guides);
	
	updateRegionInput(options.chr, options.start, options.end);
	addHooks(window, hooks);
	container.dispatchEvent(new Event('update'));
};
