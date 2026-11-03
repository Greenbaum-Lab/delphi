const EDGE_MARGIN = 8;

const TOOLTIP_GAP = 7;

const clippingRect = (elem) => {
	'Return the box that clips elem: the nearest ancestor that hides its overflow, or the window.';
	if (!elem)
		return {left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight};
	return getComputedStyle(elem).overflow === 'visible' ? clippingRect(elem.parentElement) : elem.getBoundingClientRect();
};

const tooltipSize = (anchor) => {
	const tooltip_style = getComputedStyle(anchor, '::after');
	return [
		parseFloat(tooltip_style.width) + parseFloat(tooltip_style.paddingLeft) + parseFloat(tooltip_style.paddingRight),
		parseFloat(tooltip_style.height) + parseFloat(tooltip_style.paddingTop) + parseFloat(tooltip_style.paddingBottom)
	];
};

const fitTooltip = (anchor) => {
	'Shift the tooltip of anchor sideways, and flip it below anchor, so it stays inside the box that would clip it.';
	const anchor_rect = anchor.getBoundingClientRect();
	const bounds = clippingRect(anchor.parentElement);
	const [tooltip_width, tooltip_height] = tooltipSize(anchor);
	const anchor_center = anchor_rect.left + anchor_rect.width / 2;
	const lowest_center = Math.max(bounds.left, 0) + EDGE_MARGIN + tooltip_width / 2;
	const highest_center = Math.min(bounds.right, window.innerWidth) - EDGE_MARGIN - tooltip_width / 2;
	const tooltip_center = Math.max(lowest_center, Math.min(anchor_center, highest_center));
	const fits_above = anchor_rect.top - TOOLTIP_GAP - tooltip_height >= Math.max(bounds.top, 0) + EDGE_MARGIN;
	anchor.style.setProperty('--tooltip-shift', `${tooltip_center - anchor_center}px`);
	anchor.dataset.tooltipPlacement = fits_above ? 'above' : 'below';
};

const onHover = (e) => {
	const anchor = e.target.closest('[data-tooltip]');
	if (anchor)
		fitTooltip(anchor);
};

export const init = () => {
	window.addEventListener('pointerover', onHover);
	window.addEventListener('focusin', onHover);
};
