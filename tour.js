import { getOptions } from '/apc/common.js';

const TOUR_STATE_KEY = 'tour_state';

const STEPS = [
	{selector: '[data-action="open-populations"]', placement: 'top', text: 'New to DELPHI? Start by choosing populations'},
	{selector: '[data-input="region"]', placement: 'bottom', text: 'Jump anywhere. Type in an interesting gene, like BRCA1'},
	{selector: '.more-toggle', placement: 'top', text: 'Play with the plots in here'},
	{selector: '[data-action="autoscale-y"]', placement: 'left', text: 'This one is great'},
	{selector: '.measure-selector', placement: 'top', text: 'Bored of heterozygosity? Pick another statistic'},
	{selector: '.sort-selector, .sort-selector-pairwise', placement: 'top', text: 'Sort the tracks by time, climate, or sociocultural features'},
	{selector: '[data-action="open-annotations"]', placement: 'top', text: 'Finally, lay annotations over the data'}
];

const BUBBLE_MARKUP = '<p class="tour-text"></p><div class="tour-footer"><div class="tour-progress" aria-hidden="true"></div><button type="button" class="tour-skip" data-tour-skip></button></div>';

const BUBBLE_GAP = 14;

const clamp = (value, lowest, highest) => Math.max(lowest, Math.min(value, highest));

const findTarget = (selector) => Array.from(document.querySelectorAll(selector)).find(elem => elem.offsetWidth > 0 && elem.offsetHeight > 0);

const buildLayer = (container) => {
	const ring = container.appendChild(document.createElement('div'));
	ring.className = 'tour-ring';
	const bubble = container.appendChild(document.createElement('div'));
	bubble.className = 'tour-bubble';
	bubble.setAttribute('role', 'status');
	bubble.innerHTML = BUBBLE_MARKUP;
	STEPS.forEach(() => bubble.querySelector('.tour-progress').appendChild(document.createElement('span')));
	return {ring, bubble};
};

const positionRing = (ring, rect) => {
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

const positionBubble = (bubble, rect, placement) => {
	'Place the bubble against the current target rectangle and aim its arrow at the centre of that rectangle.';
	const bubble_rect = bubble.getBoundingClientRect();
	bubble.dataset.placement = resolvePlacement(rect, bubble_rect, placement);
	const [offset_top, offset_left] = bubbleOffset(rect, bubble_rect, bubble.dataset.placement);
	const top = clamp(offset_top, 8, window.innerHeight - bubble_rect.height - 8);
	const left = clamp(offset_left, 8, window.innerWidth - bubble_rect.width - 8);
	bubble.style.top = `${top}px`;
	bubble.style.left = `${left}px`;
	bubble.style.setProperty('--arrow-x', `${clamp(rect.left + rect.width / 2 - left, 18, bubble_rect.width - 18)}px`);
	bubble.style.setProperty('--arrow-y', `${clamp(rect.top + rect.height / 2 - top, 18, bubble_rect.height - 18)}px`);
};

const currentStep = (bubble) => Number(bubble.dataset.step);

const layoutSignature = (bubble, rect) => [bubble.dataset.step, rect.top, rect.left, rect.width, rect.height, window.innerWidth, window.innerHeight].join(',');

const isOnScreen = (rect) => rect.right > 0 && rect.bottom > 0 && rect.left < window.innerWidth && rect.top < window.innerHeight;

const layoutStep = (layer) => {
	'Redraw the ring and bubble against the target as it stands now, doing nothing while target and viewport are unmoved.';
	const step = STEPS[currentStep(layer.bubble)];
	const target = findTarget(step.selector);
	const rect = target && target.getBoundingClientRect();
	const showing = Boolean(rect) && isOnScreen(rect);
	layer.bubble.classList.toggle('tour-away', !showing);
	layer.ring.classList.toggle('tour-away', !showing);
	if (!showing)
		return;
	const signature = layoutSignature(layer.bubble, rect);
	if (layer.bubble.dataset.layout === signature)
		return;
	layer.bubble.dataset.layout = signature;
	positionRing(layer.ring, rect);
	positionBubble(layer.bubble, rect, step.placement);
};

const trackTarget = (layer) => {
	'Follow the target on every frame, so scrolling the viewport, opening a menu or loading tracks cannot leave the bubble behind.';
	const follow = () => {
		if (!layer.bubble.isConnected)
			return;
		layoutStep(layer);
		requestAnimationFrame(follow);
	};
	requestAnimationFrame(follow);
};

const renderStep = (layer, index) => {
	'Move the bubble and its ring onto the control taught by step index, and redraw the progress trace.';
	const step = STEPS[index];
	layer.bubble.dataset.step = index;
	layer.bubble.querySelector('.tour-text').textContent = step.text;
	layer.bubble.querySelector('.tour-skip').textContent = index === STEPS.length - 1 ? 'Done' : 'Skip';
	layer.bubble.querySelectorAll('.tour-progress span').forEach((tick, position) => {
		tick.className = position < index ? 'done' : position === index ? 'current' : '';
	});
	layoutStep(layer);
};

const endTour = (layer) => {
	getOptions([['completed', true]], {}, TOUR_STATE_KEY);
	layer.ring.remove();
	layer.bubble.remove();
};

const advance = (layer) => {
	const next_index = currentStep(layer.bubble) + 1;
	if (next_index === STEPS.length)
		return endTour(layer);
	renderStep(layer, next_index);
};

const onInteraction = (layer, e) => {
	if (!layer.bubble.isConnected)
		return;
	if (e.target.closest('[data-tour-skip]'))
		return endTour(layer);
	const target = findTarget(STEPS[currentStep(layer.bubble)].selector);
	if (target && (target === e.target || target.contains(e.target)))
		requestAnimationFrame(() => advance(layer));
};

const startTour = (container) => {
	const layer = buildLayer(container);
	renderStep(layer, 0);
	requestAnimationFrame(() => {
		layer.ring.classList.add('tour-visible');
		layer.bubble.classList.add('tour-visible');
	});
	window.addEventListener('click', e => onInteraction(layer, e), true);
	window.addEventListener('change', e => onInteraction(layer, e), true);
	window.addEventListener('keydown', e => e.key === 'Escape' && layer.bubble.isConnected && endTour(layer));
	trackTarget(layer);
};

const noPopulationsListed = () => !document.querySelector('.signal-tracks-container [data-module="track"]');

const isFirstVisit = () => !getOptions(undefined, {}, TOUR_STATE_KEY).completed && noPopulationsListed();

const whenPageReady = (run) => {
	if (!document.body.classList.contains('loading'))
		return run();
	const observer = new MutationObserver(() => {
		if (document.body.classList.contains('loading'))
			return;
		observer.disconnect();
		run();
	});
	observer.observe(document.body, {attributes: true, attributeFilter: ['class']});
};

const watchReset = () => {
	'Bring the tour back for a browser that was reset to its defaults.';
	window.addEventListener('click', e => {
		if (e.target.closest('[data-action="reset-defaults"]'))
			getOptions([['completed', false]], {}, TOUR_STATE_KEY);
	}, true);
};

export const init = (container) => {
	watchReset();
	whenPageReady(() => isFirstVisit() && startTour(container));
};
