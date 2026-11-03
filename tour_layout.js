import { clippingRect } from '/common.js';

const BUBBLE_GAP = 14;

const clamp = (value, lowest, highest) => Math.max(lowest, Math.min(value, highest));

export const positionRing = (ring, rect) => {
	ring.style.left = `${rect.left - 4}px`;
	ring.style.top = `${rect.top - 4}px`;
	ring.style.width = `${rect.width + 8}px`;
	ring.style.height = `${rect.height + 8}px`;
};

const bubbleOffset = (rect, bubble_rect, placement) => {
	if (placement === 'top')
		return [rect.top - bubble_rect.height - BUBBLE_GAP, rect.left + rect.width / 2 - bubble_rect.width / 2];
	if (placement === 'bottom')
		return [rect.bottom + BUBBLE_GAP, rect.left + rect.width / 2 - bubble_rect.width / 2];
	if (placement === 'right')
		return [rect.top + rect.height / 2 - bubble_rect.height / 2, rect.right + BUBBLE_GAP];
	return [rect.top + rect.height / 2 - bubble_rect.height / 2, rect.left - bubble_rect.width - BUBBLE_GAP];
};

const resolvePlacement = (rect, bubble_rect, placement) => {
	'Flip the bubble to the opposite side of the control when the asked side has no room, so it never covers what it points at.';
	if (placement === 'top' && rect.top - bubble_rect.height - BUBBLE_GAP < 8)
		return 'bottom';
	if (placement === 'bottom' && rect.bottom + bubble_rect.height + BUBBLE_GAP > window.innerHeight - 8)
		return 'top';
	if (placement === 'left' && rect.left - bubble_rect.width - BUBBLE_GAP < 8)
		return 'right';
	if (placement === 'right' && rect.right + bubble_rect.width + BUBBLE_GAP > window.innerWidth - 8)
		return 'left';
	return placement;
};

export const positionBubble = (bubble, rect, placement) => {
	'Place the bubble against the current target rectangle and aim its arrow at the centre of that rectangle.';
	const bubble_rect = {width: bubble.offsetWidth, height: bubble.offsetHeight};
	bubble.dataset.placement = resolvePlacement(rect, bubble_rect, placement);
	const [offset_top, offset_left] = bubbleOffset(rect, bubble_rect, bubble.dataset.placement);
	const top = clamp(offset_top, 8, window.innerHeight - bubble_rect.height - 8);
	const left = clamp(offset_left, 8, window.innerWidth - bubble_rect.width - 8);
	bubble.style.top = `${top}px`;
	bubble.style.left = `${left}px`;
	bubble.style.setProperty('--arrow-x', `${clamp(rect.left + rect.width / 2 - left, 18, bubble_rect.width - 18)}px`);
	bubble.style.setProperty('--arrow-y', `${clamp(rect.top + rect.height / 2 - top, 18, bubble_rect.height - 18)}px`);
};

export const visibleRect = (target) => {
	'Return the part of target its nearest clipping ancestor lets through, so the ring never spills out of a scrolled table.';
	const rect = target.getBoundingClientRect();
	const bounds = clippingRect(target.parentElement);
	const left = Math.max(rect.left, bounds.left);
	const top = Math.max(rect.top, bounds.top);
	const right = Math.min(rect.right, bounds.right);
	const bottom = Math.min(rect.bottom, bounds.bottom);
	return {left, top, right, bottom, width: right - left, height: bottom - top};
};

export const isOnScreen = (rect) => rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < window.innerWidth && rect.top < window.innerHeight;
