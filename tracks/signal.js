import { addHooks, getOptions, shortNotation, mean, round } from '/apc/common.js';
import { createSVG } from '/apc/plot/static.js';
import { svg_draw, color_cycle } from '/apc/graphics/core.js';
import { getAxisLabel } from '/common.js';
import { getPopulationSamples, getSignalTrack } from '/assets.js';
import { getPopData, pairwiseSort } from '/browser/pops.js';
import { generateCoordinateTicks, drawGuides } from '/browser/helpers.js';

const sort_labels = {time: 'Time', Latitude: 'Latitude', Longitude: 'Longitude', Distance_from_Africa: 'Distance from Africa', Temperature_index: 'Temperature', Precipitation_index: 'Precipitation', Urbanization_onset: 'Urbanization', Agriculture_extensiveness: 'Neolithic', signal: 'Signal'};
const sort_units = {time: ' years', Latitude: '°', Longitude: '°', Distance_from_Africa: 'km', Urbanization_onset: 'BP', Agriculture_extensiveness: 'BP'}
const PAIRWISE_MEASURES = ['fst'];

const computePairwiseValues = (measure, raw_data_1, raw_data_2) => {
	if (measure === 'fst') {
		return computeFst(raw_data_1, raw_data_2);
	}
	return null;
};

const computeFst = (raw_data_1, raw_data_2) => {
	const fst_values = [];
	for (let i = 0; i < raw_data_1.length; i++) {
		const [ac1, an1, het1] = raw_data_1[i];
		const [ac2, an2, het2] = raw_data_2[i];
		if (an1 <= 2 || an2 <= 2 || ac1 === null || ac2 === null) {
			fst_values.push(null);
			continue;
		}
		const p1 = ac1 / an1;
		const p2 = ac2 / an2;
		const n1 = an1 / 2;
		const n2 = an2 / 2;
		const n_total = n1 + n2;
		const n_bar = n_total / 2;
		const n_c = n_total - (n1 * n1 + n2 * n2) / n_total;
		const ac_total = ac1 + ac2;
		const an_total = an1 + an2;
		const p_bar = ac_total / an_total;
		const s2 = (n1 * Math.pow(p1 - p_bar, 2) + n2 * Math.pow(p2 - p_bar, 2)) / n_bar;
		const h_bar = (het1 + het2) / n_total;
		const a = (n_bar / n_c) * (s2 - h_bar / (4 * n_bar));
		const b = (n_bar / (n_bar - 1)) * (p_bar * (1 - p_bar) - 0.5 * s2 - (2 * n_bar - 1) * h_bar / (4 * n_bar));
		const c = h_bar / 2;
		const denom = a + b + c;
		const fst = denom !== 0 ? Math.max(0, a / denom) : null;
		fst_values.push(fst);
	}
	return fst_values;
};

const roundToTenth = (value) => {
	const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(value))));
	return Math.round(value / (magnitude / 10)) * (magnitude / 10);
};

const calculateBounds = (values, measure) => {
	if (values.length === 0) {
		return [0, 1];
	}
	
	const data_min = Math.min(...values);
	const data_max = Math.max(...values);
	
	if (measure === 'tajimasd' || measure === 'fulif') {
		const abs_max = Math.max(Math.abs(data_min), Math.abs(data_max));
		const rounded = roundToTenth(abs_max);
		return [-rounded, rounded];
	}
	
	const min_bound = data_min < 0 ? roundToTenth(data_min) : 0;
	const max_bound = roundToTenth(data_max);
	
	return [min_bound, max_bound];
};

const drawGridlines = (drawer, min_value, max_value) => {
	const h = drawer.dims[1];
	const w = drawer.dims[0];
	const grid_color = [200, 200, 200];
	const zero_color = [100, 100, 100];
	
	if (min_value < 0 && max_value > 0) {
		const zero_frac = -min_value / (max_value - min_value);
		const zero_y = h * (1 - zero_frac);
		drawer.line([0, w], [zero_y, zero_y], zero_color, 0.5);
	}
	const grid_fractions = [0.25, 0.5, 0.75];
	
	grid_fractions.forEach(frac => {
		const y = h * (1 - frac);
		drawer.genomicLine(
			drawer.bounds[0][0], drawer.bounds[0][1],
			y, y,
			grid_color, 0.3
		);
	});
};

const drawTicks = (drawer, min_value, max_value) => {
	const h = drawer.dims[1];
	const rounded_min = parseFloat(min_value.toPrecision(4));
	const rounded_max = parseFloat(max_value.toPrecision(4));
	drawer.text(String(rounded_max), 5, 12, {
		fill: '#757575',
		'font-size': '9px',
		'font-family': 'Open Sans, system-ui, sans-serif'
	});
	drawer.text(String(rounded_min), 5, h - 6, {
		fill: '#757575',
		'font-size': '9px',
		'font-family': 'Open Sans, system-ui, sans-serif'
	});
};

const drawSignal = (svg, data, data_start, data_end, plot_style, bounds) => {
	const options = getOptions();
	let min_value, max_value, zero_baseline;
	if (bounds) {
		[min_value, max_value] = bounds;
		zero_baseline = 0;
	} else {
		const values = data.map(d => d.value).filter(v => !isNaN(v) && v !== null);
		[min_value, max_value] = calculateBounds(values, options.measure);
		zero_baseline = Math.max(min_value, 0);
	}
	const value_span = max_value - min_value;
	const drawer = svg_draw(svg, [[options.start, options.end], [min_value, max_value]]);
	drawer.clear();
	
	if (!data || data.length === 0) return;

	drawTicks(drawer, min_value, max_value);
	drawGridlines(drawer, min_value, max_value);
	if (options.show_guides) {
		const ticks = generateCoordinateTicks(options.start, options.end, drawer.dims[0], 8);
		drawGuides(drawer, ticks, drawer.dims[1]);
	}

	switch(plot_style) {
		case 'line':
			const x_coords = data.map(d => (d.start + d.end) / 2);
			const y_coords = data.map(d => d.value);
			drawer.plot(x_coords, y_coords, [options.start, options.end], [min_value, max_value], color_cycle[0], 0.8);
			break;
		case 'scatter':
			data.forEach(bin => {
				if (!isNaN(bin.value) && bin.value !== null) {
					const x = (bin.start + bin.end) / 2;
					drawer.point([x, bin.value], color_cycle[0], 3, 0.6);
				}
			});
			break;
		default:
			const h = drawer.dims[1];
			data.forEach(bin => {
				if (!isNaN(bin.value) && bin.value !== null) {
					const zero_y = h * (1 - ((zero_baseline - min_value) / value_span));
					const value_y = h * (1 - ((bin.value - min_value) / value_span));
					const bar_y = Math.min(zero_y, value_y);
					const bar_height = Math.abs(value_y - zero_y);
					drawer.genomicRect(bin.start, bin.end - bin.start, bar_y, bar_height, color_cycle[0], 1, {'data-value': bin.value});
				}
			});
	}
	const mask_color = [235, 235, 235];
	const h = drawer.dims[1];
	data.forEach(bin => {
		if (isNaN(bin.value) || bin.value === null)
			drawer.genomicRect(bin.start, bin.end - bin.start, 0, h, mask_color, 0.5);
	});
};

const showTooltip = (e) => {
	const tooltip = e.target.closest('[data-module="track"]').querySelector('.track-tooltip');
	tooltip.textContent = parseFloat(e.target.dataset.value).toPrecision(4);
	tooltip.style.left = e.clientX + 10 + 'px';
	tooltip.style.top = e.clientY + 10 + 'px';
	tooltip.classList.add('show');
};

const hideTooltip = (e) => {
	const tooltip = e.target.closest('[data-module="track"]').querySelector('.track-tooltip');
	tooltip.classList.remove('show');
};

const hooks = [
	['[data-module="track"]', 'refresh', async e => {
		const track = e.target;
		const loading_timeout = setTimeout(() => track.classList.add('loading'), 300);
		const populations = track.dataset.population.split(';');
		const population_samples = Object.fromEntries((await Promise.all(populations.map(async population => [population, await getPopulationSamples(population)]))));
		const options = getOptions();
		const track_measure = track.dataset.measure;
		const is_pairwise = PAIRWISE_MEASURES.includes(track_measure);
		const measure = is_pairwise ? 'raw' : track_measure;
		const response = await getSignalTrack({
			chr: options.chr,
			start: options.start,
			end: options.end,
			measure: measure,
			populations: population_samples,
			window_size: options.window_size
		});
		if (!response) {
			clearTimeout(loading_timeout);
			track.classList.remove('loading');
			track.dispatchEvent(new Event('refreshed'));
			return;
		}
		let values;
		let track_response;
		if (is_pairwise) {
			values = computePairwiseValues(track_measure, response[populations[0]].data, response[populations[1]].data);
			track_response = response[populations[0]];
		} else {
			track_response = response[populations[0]];
			values = track_response.data;
		}
		const bins = [];
		for (let i = 0; i < values.length; i++) {
			const bin_start = track_response.start + (i * track_response.window_size);
			bins.push({ start: bin_start, end: bin_start + track_response.window_size, value: values[i] });
		}
		const svg = track.querySelector('svg');
		const plot_style = track.dataset.style || 'binned';
		const bounds = track.dataset.bounds ? track.dataset.bounds.split(',').map(v => +v) : null;
		drawSignal(svg, bins, track_response.start, track_response.end, plot_style, bounds);
		const mean_signal = mean(values);
		if (options.sort === 'signal')
			track.querySelector('.track-value').textContent = `Mean: ${round(mean_signal, 3)}`;
		clearTimeout(loading_timeout);
		track.classList.remove('loading');
		track.dispatchEvent(new CustomEvent('refreshed', {detail: {signal: mean_signal}}));
	}],
	['[data-action="pin"]', 'click', e => {
		const track = e.target.closest('[data-module="track"]');
		document.querySelector('.annotation-tracks-container').appendChild(track);
		e.target.closest('[data-module="browser"]').dispatchEvent(new Event('update'));
	}],
	['[data-action="remove"]', 'click', e => {
		const options = getOptions();
		const track = e.target.closest('[data-module="track"]');
		if (track.closest('.annotation-tracks-container'))
			return track.remove();
		const other_tracks = Array.from(track.closest('.tracks-container').querySelectorAll('[data-module="track"]')).filter(other_track => other_track !== track);
		const track_populations = track.dataset.population.split(';');
		const all_track_populations = other_tracks.map(track => track.dataset.population.split(';')).flat();
		const unique_populations = track_populations.filter(track_population => !all_track_populations.includes(track_population));
		if (unique_populations.length === 0)
			return track.remove();
		const updated_populations = options.populations.filter(population => !unique_populations.includes(population));
		getOptions([['populations', updated_populations]]);
		e.target.closest('[data-module="browser"]').dispatchEvent(new Event('update'));
	}],
	['svg [data-value]', 'mouseenter', showTooltip],
	['svg [data-value]', 'mousemove', showTooltip],
	['svg [data-value]', 'mouseleave', hideTooltip]
];

export const init = async (container) => {
	const options = getOptions();
	const template = document.getElementById('signal-track-template');
	const clone = template.content.cloneNode(true);
	container.append(clone);
	container.setAttribute('draggable', true);
	container.dataset.measure = options.measure;
	const plot_area = container.querySelector('.track-plot-area');
	const ratio = plot_area.offsetHeight / plot_area.offsetWidth;
	createSVG(plot_area, [[0, 1], [0, 1]], ratio);
	const population = container.dataset.population;
	const population_metadata = await Promise.all(population.split(';').map(getPopData));
	const population_label = population.split(';').map(pop => pop.split('.')[0]).join('-');
	container.querySelector('.track-label').textContent = population_label;
	container.querySelector('.track-type').textContent = getAxisLabel(container.dataset.measure);
	if (options.sort !== 'signal')
		container.querySelector('.track-value').textContent = `${population_metadata.length === 2 ? pairwiseSort(population_metadata[0], population_metadata[1], options.sort) : population_metadata[0][options.sort]}${sort_units[options.sort] || ''}`;
	addHooks(container, hooks);
	return container;
};
