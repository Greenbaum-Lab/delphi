import { MIN_SPAN } from '/common.js';

const EDGE_TOLERANCE = 8;

const pixelToGenomic = (pixel_x, container_width, viewfinder_start, viewfinder_end) => {
	const ratio = pixel_x / container_width;
	const span = viewfinder_end - viewfinder_start;
	return viewfinder_start + ratio * span;
};

const genomicToPixel = (genomic_pos, container_width, viewfinder_start, viewfinder_end) => {
	const span = viewfinder_end - viewfinder_start;
	return ((genomic_pos - viewfinder_start) / span) * container_width;
};

export const detectInteractionMode = (click_x, container_width, focal_start, focal_end, viewfinder_start, viewfinder_end) => {
	const left_edge_pixel = genomicToPixel(focal_start, container_width, viewfinder_start, viewfinder_end);
	const right_edge_pixel = genomicToPixel(focal_end, container_width, viewfinder_start, viewfinder_end);
	const near_left = Math.abs(click_x - left_edge_pixel) <= EDGE_TOLERANCE;
	const near_right = Math.abs(click_x - right_edge_pixel) <= EDGE_TOLERANCE;
	if (near_left || near_right) {
		return { mode: 'resize', edge: near_left ? 'left' : 'right' };
	}
	const genomic_position = pixelToGenomic(click_x, container_width, viewfinder_start, viewfinder_end);
	if (genomic_position >= focal_start && genomic_position <= focal_end) {
		return { mode: 'drag' };
	}
	return { mode: 'select', start_position: genomic_position };
};

export const getCursorForPosition = (hover_x, container_width, focal_start, focal_end, viewfinder_start, viewfinder_end) => {
	const left_edge_pixel = genomicToPixel(focal_start, container_width, viewfinder_start, viewfinder_end);
	const right_edge_pixel = genomicToPixel(focal_end, container_width, viewfinder_start, viewfinder_end);
	const near_left = Math.abs(hover_x - left_edge_pixel) <= EDGE_TOLERANCE;
	const near_right = Math.abs(hover_x - right_edge_pixel) <= EDGE_TOLERANCE;
	if (near_left || near_right) {
		return 'ew-resize';
	}
	const genomic_position = pixelToGenomic(hover_x, container_width, viewfinder_start, viewfinder_end);
	if (genomic_position >= focal_start && genomic_position <= focal_end) {
		return 'grab';
	}
	return 'default';
};

export const computeSelectionBounds = (start_position, current_x, container_width, viewfinder_start, viewfinder_end) => {
	const current_position = pixelToGenomic(current_x, container_width, viewfinder_start, viewfinder_end);
	const new_start = Math.min(start_position, current_position);
	const new_end = Math.max(start_position, current_position);
	const span = new_end - new_start;
	if (span < MIN_SPAN) {
		return null;
	}
	return {
		start: Math.max(viewfinder_start, Math.round(new_start)),
		end: Math.min(viewfinder_end, Math.round(new_end))
	};
};

export const computeResizeBounds = (edge, original_start, original_end, delta_x, container_width, viewfinder_start, viewfinder_end) => {
	const span = viewfinder_end - viewfinder_start;
	const genomic_shift = (delta_x / container_width) * span;
	if (edge === 'left') {
		const new_start = Math.round(original_start + genomic_shift);
		const adjusted_start = Math.max(viewfinder_start, Math.min(original_end - MIN_SPAN, new_start));
		return { start: adjusted_start, end: original_end };
	}
	const new_end = Math.round(original_end + genomic_shift);
	const adjusted_end = Math.min(viewfinder_end, Math.max(original_start + MIN_SPAN, new_end));
	return { start: original_start, end: adjusted_end };
};

export const computeDragBounds = (original_start, original_end, delta_x, container_width, viewfinder_start, viewfinder_end) => {
	const viewfinder_span = viewfinder_end - viewfinder_start;
	const focal_span = original_end - original_start;
	const genomic_shift = (delta_x / container_width) * viewfinder_span;
	const new_start = Math.round(original_start + genomic_shift);
	const adjusted_start = Math.max(viewfinder_start, Math.min(viewfinder_end - focal_span, new_start));
	return {
		start: adjusted_start,
		end: adjusted_start + focal_span
	};
};

export const shouldRecenterViewfinder = (start, end, viewfinder_start, viewfinder_end) => {
	const focal_span = end - start;
	const margin = focal_span * 0.1;
	const near_left = start < viewfinder_start + margin;
	const near_right = end > viewfinder_end - margin;
	return near_left || near_right;
};

