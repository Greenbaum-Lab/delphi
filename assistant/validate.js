import { CHR_LENGTHS } from '/common.js';
import { MIN_SPAN, MAX_SPAN } from '/assistant/config.js';

const PATCH_KEYS = ['chr', 'start', 'end', 'populations'];
const MAX_POPULATIONS = 12;

const isPosition = value => Number.isInteger(value) && value >= 0;

const dropUnknownKeys = patch => Object.fromEntries(Object.entries(patch).filter(([key]) => PATCH_KEYS.includes(key)));

const regionErrors = patch => {
	if (CHR_LENGTHS[patch.chr] === undefined)
		return [`there is no chromosome ${patch.chr} in hg19`];
	if (!isPosition(patch.start) || !isPosition(patch.end) || patch.start >= patch.end)
		return ['those coordinates are not a range'];
	if (patch.end > CHR_LENGTHS[patch.chr])
		return [`${patch.chr} is only ${CHR_LENGTHS[patch.chr]} bases long`];
	if (patch.end - patch.start < MIN_SPAN)
		return [`a region has to be at least ${MIN_SPAN} bases wide`];
	return patch.end - patch.start > MAX_SPAN ? ['that region is too wide to draw'] : [];
};

const populationErrors = (patch, catalog) => {
	if (!Array.isArray(patch.populations) || patch.populations.length === 0)
		return ['no population was named'];
	if (patch.populations.length > MAX_POPULATIONS)
		return [`${patch.populations.length} populations is more tracks than the browser can draw at once`];
	const unknown_label = patch.populations.find(label => !catalog.population_labels.includes(label));
	return unknown_label ? [`there is no population called ${unknown_label}`] : [];
};

const hasRegion = patch => patch.chr !== undefined || patch.start !== undefined || patch.end !== undefined;

/**
 * The safety layer. Every field is checked against the loaded catalogue and the
 * hg19 chromosome lengths before anything reaches getOptions, and any key the
 * patch schema does not name is dropped rather than written. This is what makes
 * a prompt injection a non-event: injected text is not a valid chromosome, so
 * it is deleted here rather than acted on.
 */
export const validatePatch = (raw_patch, catalog) => {
	if (!raw_patch || typeof raw_patch !== 'object')
		return { valid: false, patch: null, errors: ['there was nothing to apply'] };
	const patch = dropUnknownKeys(raw_patch);
	const errors = [
		...(hasRegion(patch) ? regionErrors(patch) : []),
		...(patch.populations !== undefined ? populationErrors(patch, catalog) : [])
	];
	if (Object.keys(patch).length === 0)
		return { valid: false, patch: null, errors: ['there was nothing to apply'] };
	return errors.length > 0 ? { valid: false, patch: null, errors } : { valid: true, patch, errors: [] };
};
