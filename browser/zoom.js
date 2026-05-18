import { ZOOM_LEVELS, CHR_LENGTHS } from '/common.js';

export const VIEWFINDER_RATIO = 2;

const clampLevel = (level) => {
	return Math.max(0, Math.min(ZOOM_LEVELS.length - 1, level));
};

const clampToChromosome = (start, end, chr_length) => {
	if (start < 0) {
		return { start: 0, end: end - start };
	}
	if (end > chr_length) {
		const span = end - start;
		return { start: Math.max(0, chr_length - span), end: chr_length };
	}
	return { start, end };
};

export const computeZoomedBounds = (center, new_level, chr_length) => {
	const level = clampLevel(new_level);
	const span = ZOOM_LEVELS[level];
	const raw_start = Math.round(center - span / 2);
	const raw_end = Math.round(center + span / 2);
	const clamped = clampToChromosome(raw_start, raw_end, chr_length);
	const viewfinder_span = span * VIEWFINDER_RATIO;
	const viewfinder_raw_start = Math.round(center - viewfinder_span / 2);
	const viewfinder_raw_end = Math.round(center + viewfinder_span / 2);
	const viewfinder_clamped = clampToChromosome(viewfinder_raw_start, viewfinder_raw_end, chr_length);
	return {
		start: clamped.start,
		end: clamped.end,
		viewfinder_start: viewfinder_clamped.start,
		viewfinder_end: viewfinder_clamped.end,
		zoom_level: level
	};
};

export const computePointerZoom = (pointer_x, container_width, viewfinder_start, viewfinder_end, direction, current_level, chr_length) => {
	const new_level = clampLevel(current_level + direction);
	if (new_level === current_level) {
		return null;
	}
	const pointer_ratio = pointer_x / container_width;
	const viewfinder_span = viewfinder_end - viewfinder_start;
	const genomic_position = viewfinder_start + viewfinder_span * pointer_ratio;
	const new_span = ZOOM_LEVELS[new_level];
	const new_viewfinder_start = Math.max(0, Math.round(genomic_position - new_span * pointer_ratio));
	const new_viewfinder_end = Math.min(chr_length, Math.round(new_viewfinder_start + new_span));
	const focal_span = ZOOM_LEVELS[Math.max(0, new_level - 1)];
	const new_start = Math.max(new_viewfinder_start, Math.round(genomic_position - focal_span * pointer_ratio));
	const new_end = Math.min(new_viewfinder_end, Math.round(new_start + focal_span));
	return {
		start: new_start,
		end: new_end,
		viewfinder_start: new_viewfinder_start,
		viewfinder_end: new_viewfinder_end,
		zoom_level: new_level
	};
};

export const findZoomLevelForSpan = (span) => {
	for (let i = 0; i < ZOOM_LEVELS.length; i++) {
		if (ZOOM_LEVELS[i] >= span) {
			return i;
		}
	}
	return ZOOM_LEVELS.length - 1;
};
