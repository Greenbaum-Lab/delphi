import { getOptions } from '/apc/common.js';

/**
 * The only fields that ever leave the machine. Whitelisted by name, not by
 * exclusion, so a field added to site_options later is not sent by accident.
 * Genotypes, allele frequencies, per-sample records and uploaded files are all
 * outside this function and cannot reach it.
 */
export const readStateSlice = () => {
	const options = getOptions();
	return {
		chromosome: options.chr,
		start: options.start,
		end: options.end,
		populations: options.populations || []
	};
};

export const currentRegion = () => {
	const options = getOptions();
	return { chr: options.chr, start: options.start, end: options.end };
};
