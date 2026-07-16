import { addHooks, getOptions } from '/apc/common.js';
import { svg_draw } from '/apc/graphics/core.js';
import { createSVG } from '/apc/plot/static.js';
import { getTracks } from '/assets.js';
import { CHR_LENGTHS, hexToRgb } from '/common.js';
import { computePointerZoom } from '/browser/zoom.js';
import { computeViewfinderBounds, formatRegionString } from '/browser/region.js';
import { updateRegionInput, generateCoordinateTicks } from '/browser/helpers.js';
import {
	detectInteractionMode,
	getCursorForPosition,
	computeResizeBounds,
	computeDragBounds,
	shouldRecenterViewfinder
} from '/browser/focal_window.js';

const cssVars = getComputedStyle(document.documentElement);
const getVar = (name) => cssVars.getPropertyValue(name).trim();

const GENE_COLOR = hexToRgb(getVar('--data-1'));
const FOCAL_WINDOW_COLOR = hexToRgb(getVar('--data-1'));
const FOCAL_WINDOW_OPACITY = 0.5;

const drawFocalWindow = (svg, start, end) => {
	if (!svg) return;
	const h = +(svg.dataset.height);
	const w = +(svg.dataset.width);
	const options = getOptions();
	const viewfinder_start = options.viewfinder_start;
	const viewfinder_end = options.viewfinder_end;
	const viewfinder_span = viewfinder_end - viewfinder_start;
	
	const visibleStart = Math.max(start, viewfinder_start);
	const visibleEnd = Math.min(end, viewfinder_end);
	
	const x = ((visibleStart - viewfinder_start) / viewfinder_span) * w;
	const width = ((visibleEnd - visibleStart) / viewfinder_span) * w;
	
	const drawer = svg_draw(svg, [[options.viewfinder_start, options.viewfinder_end], [0, h]]);
	const coordHeight = 12;
	const geneTrackY = coordHeight + 4;
	const geneTrackHeight = h - coordHeight - 4;
	
	let focal_rect = svg.querySelector('[data-element="focal-window"]');
	if (!focal_rect) {
		focal_rect = drawer.genomicRect(visibleStart, visibleEnd - visibleStart, geneTrackY, geneTrackHeight, FOCAL_WINDOW_COLOR, FOCAL_WINDOW_OPACITY);
		focal_rect.setAttribute('data-element', 'focal-window');
	} else {
		focal_rect.setAttribute('x', x);
		focal_rect.setAttribute('width', width);
	}
};

const drawAnnotation = (svg, annotation_data) => {
	const options = getOptions();
	if (!svg || options.viewfinder_start == null || options.viewfinder_end == null) return;
	
	const chr = options.chr;
	const h = +(svg.dataset.height);
	const drawer = svg_draw(svg, [[options.viewfinder_start, options.viewfinder_end], [0, h]]);
	drawer.clear();
	
	const genes = annotation_data?.raw_data || [];
	
	const coordHeight = 12;
	const geneTrackY = coordHeight + 4;
	const geneTrackHeight = h - coordHeight - 4;
	
	genes.forEach((gene, idx) => {
		const geneStart = gene.coordinates.start;
		const geneEnd = gene.coordinates.end;
		const y = geneTrackY + (idx % 3) * (geneTrackHeight / 3);
		drawer.genomicRect(geneStart, geneEnd - geneStart, y, geneTrackHeight / 3 - 2, GENE_COLOR, 0.7);
	});
	
	const ticks = generateCoordinateTicks(options.viewfinder_start, options.viewfinder_end, drawer.dims[0], 8);
	const coordY = coordHeight - 2;

	drawer.text(`hg19:${chr}`, 3, coordY, {
		fill: getVar('--svg-text-color'),
		'font-size': '9px',
		'font-family': getVar('--font'),
		'text-anchor': 'start'
	});	

	ticks.forEach(tick => {
		drawer.text(tick.label, tick.x, coordY, {
			fill: getVar('--svg-text-color'),
			'font-size': '9px',
			'font-family': getVar('--font'),
			'text-anchor': 'middle'
		});
	});
	drawFocalWindow(svg, options.start, options.end);
};

const hooks = [
	['[data-module="track"]', 'refresh', async e => {
		const options = getOptions();
		const chr_length = CHR_LENGTHS[options.chr] || Infinity;
		const needs_recenter = shouldRecenterViewfinder(
			options.start,
			options.end,
			options.viewfinder_start,
			options.viewfinder_end
		);
		if (needs_recenter) {
			const new_viewfinder = computeViewfinderBounds(options.start, options.end, chr_length);
			options.viewfinder_start = new_viewfinder.viewfinder_start;
			options.viewfinder_end = new_viewfinder.viewfinder_end;
			getOptions([
				['viewfinder_start', new_viewfinder.viewfinder_start],
				['viewfinder_end', new_viewfinder.viewfinder_end]
			]);
		}
      	const track_id = e.target.dataset.source;
      	const d = {chr: options.chr, start: options.viewfinder_start, end: options.viewfinder_end, track_ids: [track_id]};
		const annotation_data = await getTracks(d);
      	e.target.dispatchEvent(new Event('refreshed'));
		drawAnnotation(e.target.querySelector('svg'), annotation_data[0]);
	}],
	['[data-module="track"], [data-module="track"] *', 'mousedown', e => {
		const container = e.currentTarget;
		const browser = e.target.closest('[data-module="browser"]');
		const options = getOptions();
		const rect = container.getBoundingClientRect();
		const click_x = e.clientX - rect.left;
		const container_width = rect.width;
		const detection = detectInteractionMode(
			click_x,
			container_width,
			options.start,
			options.end,
			options.viewfinder_start,
			options.viewfinder_end
		);
		e.preventDefault();
		container._interactionMode = detection.mode;
		container._dragStart = {
			clientX: e.clientX,
			start: options.start,
			end: options.end,
			edge: detection.edge,
			viewfinder_start: options.viewfinder_start,
			viewfinder_end: options.viewfinder_end,
			start_position: detection.start_position
		};
		if (detection.mode === 'resize') container.style.cursor = 'ew-resize';
		if (detection.mode === 'drag') container.style.cursor = 'grabbing';
	}],
	['[data-module="track"], [data-module="track"] *', 'mousemove', e => {
		const container = e.currentTarget;
		const browser = e.target.closest('[data-module="browser"]');
		const rect = container.getBoundingClientRect();
		const current_x = e.clientX - rect.left;
		const container_width = rect.width;
		if (!container._interactionMode) {
			if (current_x >= 0 && current_x <= container_width) {
				const options = getOptions();
				const cursor = getCursorForPosition(
					current_x,
					container_width,
					options.start,
					options.end,
					options.viewfinder_start,
					options.viewfinder_end
				);
				container.style.cursor = cursor;
			}
			return;
		}
		const options = getOptions();
		const delta_x = e.clientX - container._dragStart.clientX;
		let bounds = null;
		if (container._interactionMode === 'resize') {
			bounds = computeResizeBounds(
				container._dragStart.edge,
				container._dragStart.start,
				container._dragStart.end,
				delta_x,
				container_width,
				options.viewfinder_start,
				options.viewfinder_end
			);
		} else if (container._interactionMode === 'drag') {
			bounds = computeDragBounds(
				container._dragStart.start,
				container._dragStart.end,
				delta_x,
				container_width,
				options.viewfinder_start,
				options.viewfinder_end
			);
		}
		if (bounds) {
			getOptions([
				['start', bounds.start],
				['end', bounds.end]
			]);
			updateRegionInput(options.chr, bounds.start, bounds.end);
			drawFocalWindow(container.querySelector('svg'), bounds.start, bounds.end);
		}
	}],
	['[data-module="track"], [data-module="track"] *', 'mouseup', e => {
		const container = e.currentTarget;
		const browser = e.target.closest('[data-module="browser"]');
		if (container._interactionMode && browser) {
			browser.dispatchEvent(new Event('refresh'));
			container._interactionMode = null;
			container._dragStart = null;
			container.style.cursor = 'default';
		}
	}]
];

const window_hooks = [
	['[data-module="track"], [data-module="track"] *', 'wheel', e => {
		if (!e.ctrlKey)
			return;
		e.preventDefault();
		const browser = e.target.closest('[data-module="browser"]');
		const container = e.target.closest('[data-module="track"]');
		const options = getOptions();
		const rect = container.getBoundingClientRect();
		const pointer_x = e.clientX - rect.left;
		const container_width = rect.width;
		if (!options.viewfinder_end) return;
		const direction = e.deltaY > 0 ? 1 : -1;
		const chr_length = CHR_LENGTHS[options.chr] || Infinity;
		const bounds = computePointerZoom(
			pointer_x,
			container_width,
			options.viewfinder_start,
			options.viewfinder_end,
			direction,
			options.zoom_level,
			chr_length
		);
		if (!bounds) return;
		getOptions([
			['start', bounds.start],
			['end', bounds.end],
			['viewfinder_start', bounds.viewfinder_start],
			['viewfinder_end', bounds.viewfinder_end],
			['zoom_level', bounds.zoom_level]
		]);
		updateRegionInput(options.chr, bounds.start, bounds.end);
		if (container._wheelTimeout) clearTimeout(container._wheelTimeout);
		container._wheelTimeout = setTimeout(() => {
			browser.dispatchEvent(new Event('refresh'));
		}, 150);
	}],
	['[data-module="track"], [data-module="track"] *', 'dblclick', e => {
		e.preventDefault();
		const browser = e.target.closest('[data-module="browser"]');
		const container = e.target.closest('[data-module="track"]');
		const options = getOptions();
		const rect = container.getBoundingClientRect();
		const pointer_x = e.clientX - rect.left;
		const container_width = rect.width;
		if (!options.viewfinder_end) return;
		const direction = e.shiftKey ? 1 : -1;
		const chr_length = CHR_LENGTHS[options.chr] || Infinity;
		const bounds = computePointerZoom(
			pointer_x,
			container_width,
			options.viewfinder_start,
			options.viewfinder_end,
			direction,
			options.zoom_level,
			chr_length
		);
		if (!bounds) return;
		getOptions([
			['start', bounds.start],
			['end', bounds.end],
			['viewfinder_start', bounds.viewfinder_start],
			['viewfinder_end', bounds.viewfinder_end],
			['zoom_level', bounds.zoom_level]
		]);
		updateRegionInput(options.chr, bounds.start, bounds.end);
		browser.dispatchEvent(new Event('refresh'));
	}],
	['[data-module="track"]:not([data-type="viewfinder"]) .track-plot-area, [data-module="track"]:not([data-type="viewfinder"]) .track-plot-area *', 'mousedown', e => {
		if (e.target.closest('.tooltip'))
			return;
		const container = e.target.closest('[data-module="track"]');
		const browser = e.target.closest('[data-module="browser"]');
		e.preventDefault();
		const options = getOptions();
		container.classList.add('panning');
		container._panStartX = e.clientX;
		container._panStartState = {
			start: options.start,
			end: options.end
		};
	}],
	['[data-module="track"]:not([data-type="viewfinder"]) .track-plot-area, [data-module="track"]:not([data-type="viewfinder"]) .track-plot-area *', 'mousemove', e => {
		const container = e.target.closest('[data-module="track"]');
		if (!container.classList.contains('panning')) return;
		const options = getOptions();
		const delta_x = e.clientX - container._panStartX;
		const span = container._panStartState.end - container._panStartState.start;
		const container_width = container.offsetWidth;
		const genomic_shift = -(delta_x / container_width) * span;
		const chr_length = CHR_LENGTHS[options.chr] || Infinity;
		let new_start = Math.round(container._panStartState.start + genomic_shift);
		let new_end = Math.round(container._panStartState.end + genomic_shift);
		if (new_start < 0) {
			new_start = 0;
			new_end = span;
		}
		if (new_end > chr_length) {
			new_end = chr_length;
			new_start = chr_length - span;
		}
		getOptions([
			['start', new_start],
			['end', new_end]
		]);
		updateRegionInput(options.chr, new_start, new_end);
	}],
	['[data-module="track"]:not([data-type="viewfinder"]) .track-plot-area, [data-module="track"]:not([data-type="viewfinder"]) .track-plot-area *', 'mouseup', e => {
		const container = e.target.closest('[data-module="track"]');
		const browser = e.target.closest('[data-module="browser"]');
		if (container.classList.contains('panning') && browser) {
			container.classList.remove('panning');
			browser.dispatchEvent(new Event('refresh'));
		}
	}]
];

export const init = (container) => {
  	const ratio = container.offsetHeight / container.offsetWidth;
  	createSVG(container, [[0, 1], [0, 1]], ratio);
	addHooks(container, hooks);
	addHooks(window, window_hooks);
};
