import { getOptions } from '/apc/common.js';
import { STEPS } from '/tour_steps.js';
import { positionRing, positionBubble, visibleRect, isOnScreen } from '/tour_layout.js';

const TOUR_STATE_KEY = 'tour_state';

const BUBBLE_MARKUP = '<p class="tour-text"></p><div class="tour-footer"><div class="tour-progress" aria-hidden="true"></div><button type="button" class="tour-skip" data-tour-skip></button></div>';

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

const POP_KEYFRAMES = [{transform: 'scale(0.8)'}, {transform: 'scale(1.06)', offset: 0.6}, {transform: 'scale(1)'}];

const stepEvent = (step) => step.event || 'click';

const matchesStep = (step, element) => Boolean(element) && element.textContent.toLowerCase().includes(step.contains || '');

const findTarget = (step) => Array.from(document.querySelectorAll(step.selector)).find(elem => elem.offsetWidth > 0 && elem.offsetHeight > 0 && matchesStep(step, elem));

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

const popOnce = (bubble) => {
	'Bounce the bubble the first time it shows for a step, so the eye catches where it moved.';
	if (bubble.dataset.popped === bubble.dataset.step || REDUCED_MOTION.matches)
		return;
	bubble.dataset.popped = bubble.dataset.step;
	bubble.animate(POP_KEYFRAMES, {duration: 420, easing: 'ease-out'});
};

const revealOnce = (bubble, target) => {
	'Scroll the target into view the first time it is found for a step, so a row further down a table is still pointed at.';
	if (bubble.dataset.revealed === bubble.dataset.step)
		return;
	bubble.dataset.revealed = bubble.dataset.step;
	target.scrollIntoView({block: 'nearest'});
};

const currentStep = (bubble) => Number(bubble.dataset.step);

const layoutSignature = (bubble, rect) => [bubble.dataset.step, rect.top, rect.left, rect.width, rect.height, window.innerWidth, window.innerHeight].join(',');

const layoutStep = (layer) => {
	'Redraw the ring and bubble against the target as it stands now, doing nothing while target and viewport are unmoved.';
	const step = STEPS[currentStep(layer.bubble)];
	const target = layer.bubble.dataset.waiting ? null : findTarget(step);
	if (target)
		revealOnce(layer.bubble, target);
	const rect = target && visibleRect(target);
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
	popOnce(layer.bubble);
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

const advance = (layer, next_index) => {
	if (next_index === STEPS.length)
		return endTour(layer);
	renderStep(layer, next_index);
};

const matchedStep = (e, current_index) => {
	'Return the step whose control the event happened on, accepting the next step too, so a user who skips an optional step is not left behind.';
	return [current_index, current_index + 1].find(index => index < STEPS.length && stepEvent(STEPS[index]) === e.type && matchesStep(STEPS[index], e.target.closest(STEPS[index].selector)));
};

const onInteraction = (layer, e) => {
	if (!layer.bubble.isConnected)
		return;
	if (e.target.closest('[data-tour-skip]'))
		return endTour(layer);
	const matched_index = matchedStep(e, currentStep(layer.bubble));
	if (matched_index === undefined)
		return;
	if (STEPS[matched_index].wait)
		layer.bubble.dataset.waiting = 'true';
	requestAnimationFrame(() => advance(layer, matched_index + 1));
};

const startTour = (container) => {
	const layer = buildLayer(container);
	renderStep(layer, 0);
	requestAnimationFrame(() => {
		layer.ring.classList.add('tour-visible');
		layer.bubble.classList.add('tour-visible');
	});
	new Set(STEPS.map(stepEvent)).forEach(type => window.addEventListener(type, e => onInteraction(layer, e), true));
	window.addEventListener('tracks-refreshed', () => delete layer.bubble.dataset.waiting, true);
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

export const init = (container) => {
	whenPageReady(() => isFirstVisit() && startTour(container));
};
