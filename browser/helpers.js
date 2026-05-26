import { getOptions, shortNotation } from '/apc/common.js';
import { CHR_LENGTHS } from '/common.js';
import { computeZoomedBounds, findZoomLevelForSpan } from '/browser/zoom.js';
import { computeViewfinderBounds, formatRegionString, parseRegion } from '/browser/region.js';

export const updateRegionInput = (chr, start, end) => {
	const input = document.querySelector('.region-query');
	if (input) {
		input.value = formatRegionString(chr, start, end);
	}
};

const dispatchBrowserRefresh = () => {
	const browser = document.querySelector('[data-module="browser"]');
	if (browser) {
		browser.dispatchEvent(new Event('refresh'));
	}
};

export const zoomToLevel = (level) => {
	const options = getOptions();
	const start = options.start;
	const end = options.end;
	const chr = options.chr;
	const assembly = options.assembly || 'hg38';
	if (isNaN(start) || isNaN(end)) {
		return;
	}
	const chr_length = CHR_LENGTHS[assembly]?.[chr] || Infinity;
	const center = (start + end) / 2;
	const bounds = computeZoomedBounds(center, level, chr_length);
	getOptions([
		['start', bounds.start],
		['end', bounds.end],
		['zoom_level', bounds.zoom_level],
		['viewfinder_start', bounds.viewfinder_start],
		['viewfinder_end', bounds.viewfinder_end]
	]);
	updateRegionInput(chr, bounds.start, bounds.end);
	dispatchBrowserRefresh();
};

export const updateRegionFromInput = () => {
	const input = document.querySelector('.region-query');
	if (!input) {
		return;
	}
	const parsed = parseRegion(input.value);
	if (!parsed) {
		document.querySelectorAll('[data-module="track"][data-type="annotation"]')
			.forEach(track => track.dispatchEvent(new CustomEvent('search', {detail: {query: input.value}})));
		return;
	}
	const options = getOptions();
	const assembly = options.assembly || 'hg38';
	const chr_length = CHR_LENGTHS[assembly]?.[parsed.chr] || Infinity;
	const span = parsed.end - parsed.start;
	const level = findZoomLevelForSpan(span);
	const viewfinder_bounds = computeViewfinderBounds(parsed.start, parsed.end, chr_length);
	getOptions([
		['chr', parsed.chr],
		['start', parsed.start],
		['end', parsed.end],
		['zoom_level', level],
		['viewfinder_start', viewfinder_bounds.viewfinder_start],
		['viewfinder_end', viewfinder_bounds.viewfinder_end]
	]);
	dispatchBrowserRefresh();
};

export const formatCoordinate = (pos, span) => {
	if (span < 10000) {
		return `${Math.round(pos)} bp`;
	} else if (span < 1000000) {
		return `${shortNotation(pos / 1000)} kb`;
	} else {
		return `${shortNotation(pos / 1000000)} Mb`;
	}
};

export const generateCoordinateTicks = (start, end, width, maxTicks = 8) => {
	const span = end - start;
	const roughInterval = span / maxTicks;
	const magnitude = Math.pow(10, Math.floor(Math.log10(roughInterval)));
	const interval = magnitude * Math.ceil(roughInterval / magnitude);
	const firstTick = Math.ceil(start / interval) * interval;
	const ticks = [];
	for (let pos = firstTick; pos <= end; pos += interval) {
		ticks.push({
			pos,
			x: ((pos - start) / span) * width,
			label: formatCoordinate(pos, span)
		});
	}
	return ticks;
};

export const drawGuides = (drawer, ticks, height) => {
	ticks.forEach(tick => drawer.genomicLine(tick.pos, tick.pos, 0, height, [180, 180, 180], 0.3));
};

const ensureHoverLine = (plot_area) => {
	let hover_line = plot_area.querySelector('.hover-line');
	if (!hover_line) {
		hover_line = document.createElement('div');
		hover_line.className = 'hover-line';
		plot_area.append(hover_line);
	}
	return hover_line;
};

export const showHoverLine = (client_x) => {
	document.querySelectorAll('[data-module="browser"] [data-module="track"]:not([data-type="viewfinder"]) .track-plot-area')
		.forEach(plot_area => {
			const bounds = plot_area.getBoundingClientRect();
			const hover_line = ensureHoverLine(plot_area);
			hover_line.style.left = (client_x - bounds.left) + 'px';
			hover_line.classList.add('show');
		});
};

export const hideHoverLine = () => {
	document.querySelectorAll('[data-module="browser"] .hover-line')
		.forEach(hover_line => hover_line.classList.remove('show'));
};