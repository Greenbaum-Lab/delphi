import { ZOOM_LEVELS, CHR_LENGTHS, MIN_SPAN } from '/common.js';
import { VIEWFINDER_RATIO } from '/browser/zoom.js';

export const computeViewfinderBounds = (main_start, main_end, chr_length) => {
	const span = main_end - main_start;
	const center = (main_start + main_end) / 2;
	const viewfinder_span = span * VIEWFINDER_RATIO;
	const viewfinder_start = Math.max(0, Math.round(center - viewfinder_span / 2));
	const viewfinder_end = Math.min(chr_length, Math.round(center + viewfinder_span / 2));
	return { viewfinder_start, viewfinder_end };
};

export const computeCenteredRegion = (click_x, container_width, viewfinder_start, viewfinder_end, current_span) => {
	const click_ratio = click_x / container_width;
	const viewfinder_span = viewfinder_end - viewfinder_start;
	const genomic_position = Math.floor(viewfinder_start + click_ratio * viewfinder_span);
	const new_start = Math.max(0, genomic_position - Math.floor(current_span / 2));
	const new_end = Math.min(viewfinder_end, new_start + current_span);
	const adjusted_start = new_end === viewfinder_end 
		? Math.max(viewfinder_start, viewfinder_end - current_span) 
		: new_start;
	return {
		start: adjusted_start,
		end: adjusted_start + current_span
	};
};

export const clampSpanToMinimum = (start, end, chr_length) => {
	if (end - start >= MIN_SPAN) {
		return { start, end };
	}
	const center = (start + end) / 2;
	const raw_start = Math.round(center - MIN_SPAN / 2);
	if (raw_start < 0) {
		return { start: 0, end: MIN_SPAN };
	}
	if (raw_start + MIN_SPAN > chr_length) {
		return { start: Math.max(0, chr_length - MIN_SPAN), end: chr_length };
	}
	return { start: raw_start, end: raw_start + MIN_SPAN };
};

export const formatRegionString = (chr, start, end) => {
	const chr_display = chr.startsWith('chr') ? chr : `chr${chr}`;
	return `${chr_display}:${start}-${end}`;
};

export const parseRegion = (region_string) => {
	const cleaned = region_string.replace(/,/g, '');
	const match = cleaned.match(/^chr?(\w+):(\d+)(?:-(\d+))?$/i);
	if (!match) {
		return null;
	}
	const chr = match[1].startsWith('chr') ? match[1] : `chr${match[1]}`;
	const start = parseInt(match[2], 10);
	const end = match[3] === undefined ? start : parseInt(match[3], 10);
	if (isNaN(start) || isNaN(end) || start > end) {
		return null;
	}
	return { chr, start, end };
};
