import { formatSpan } from '/common.js';

const formatPosition = position => Number(position).toLocaleString('en-US');

const regionSentence = patch => `Go to ${patch.chr}:${formatPosition(patch.start)}-${formatPosition(patch.end)} (${formatSpan(patch.end - patch.start)})`;

const populationSentence = patch => patch.populations.length === 1 ? `Show ${patch.populations[0]}` : `Show ${patch.populations.length} populations: ${patch.populations.join(', ')}`;

/**
 * Renders a validated patch as one plain sentence for the confirmation step.
 * The user reads this, not the JSON, and every value in it has already been
 * checked against the catalogue, so the preview cannot promise something the
 * browser will refuse to do.
 */
export const previewPatch = patch => {
	const parts = [];
	if (patch.populations !== undefined)
		parts.push(populationSentence(patch));
	if (patch.chr !== undefined)
		parts.push(regionSentence(patch));
	return `${parts.join(', then ')}.`;
};

export const previewSource = source => source === 'parser' ? 'read directly' : (source === 'cache' ? 'from cache' : 'interpreted');
