import { ZOOM_LEVELS, CHR_LENGTHS } from '/common.js';
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

export const formatRegionString = (chr, start, end) => {
	const chr_display = chr.startsWith('chr') ? chr : `chr${chr}`;
	return `${chr_display}:${start}-${end}`;
};

export const parseRegion = (region_string) => {
	const cleaned = region_string.replace(/,/g, '');
	const match = cleaned.match(/^chr?(\w+):(\d+)-(\d+)$/i);
	if (!match) {
		return null;
	}
	const chr = match[1].startsWith('chr') ? match[1] : `chr${match[1]}`;
	const start = parseInt(match[2], 10);
	const end = parseInt(match[3], 10);
	if (isNaN(start) || isNaN(end) || start >= end) {
		return null;
	}
	return { chr, start, end };
};
