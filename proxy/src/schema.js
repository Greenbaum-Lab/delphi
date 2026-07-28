export const RELATIVE_MOVES = ['zoom_in', 'zoom_out', 'pan_left', 'pan_right', 'widen', 'back'];

export const CHROMOSOMES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', 'X', 'Y', 'M'];

const CHROMOSOME_LENGTHS = {
	'1': 249250621, '2': 243199373, '3': 198022430, '4': 191154276, '5': 180915260,
	'6': 171115067, '7': 159138663, '8': 146364022, '9': 141213431, '10': 135534747,
	'11': 135006516, '12': 133851895, '13': 115169878, '14': 107349540, '15': 102531392,
	'16': 90354753, '17': 81195210, '18': 78077248, '19': 59128983, '20': 63025520,
	'21': 48129895, '22': 51304566, 'X': 155270560, 'Y': 59373566, 'M': 16569
};

const REQUEST_KEYS = ['populations', 'chrom', 'start', 'end', 'gene_symbol', 'relative', 'confidence', 'rejection_reason'];

const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });

export const NAVIGATION_SCHEMA = {
	type: 'object',
	properties: {
		populations: nullable({ type: 'array', items: { type: 'string' } }),
		chrom: nullable({ type: 'string', enum: CHROMOSOMES }),
		start: nullable({ type: 'integer' }),
		end: nullable({ type: 'integer' }),
		gene_symbol: nullable({ type: 'string' }),
		relative: nullable({ type: 'string', enum: RELATIVE_MOVES }),
		confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
		rejection_reason: nullable({ type: 'string', enum: ['analysis', 'unclear'] })
	},
	required: REQUEST_KEYS,
	additionalProperties: false
};

const isPosition = value => Number.isInteger(value) && value >= 0;

const coordinatesFit = navigation_request => {
	const chromosome_length = CHROMOSOME_LENGTHS[navigation_request.chrom];
	if (!chromosome_length)
		return false;
	return isPosition(navigation_request.start) && isPosition(navigation_request.end) && navigation_request.start <= navigation_request.end && navigation_request.end <= chromosome_length;
};

/**
 * Server-side shape check. The browser validates again before it writes
 * anything, so this exists to keep nonsense out of the cache rather than to
 * protect the browser: a bad answer cached once would be served to everyone.
 */
export const sanitiseRequest = navigation_request => {
	if (!navigation_request || typeof navigation_request !== 'object')
		return null;
	const cleaned = Object.fromEntries(Object.entries(navigation_request).filter(([key]) => REQUEST_KEYS.includes(key)));
	if (cleaned.relative !== null && cleaned.relative !== undefined && !RELATIVE_MOVES.includes(cleaned.relative))
		return null;
	if (cleaned.chrom !== null && cleaned.chrom !== undefined && !coordinatesFit(cleaned))
		return null;
	return cleaned;
};

/**
 * Only a request whose meaning does not depend on where the user currently is
 * may be cached. A relative move means something different from every starting
 * point, so caching one would serve a wrong answer to the next visitor.
 */
export const isCacheable = navigation_request => Boolean(navigation_request) && !navigation_request.relative && !navigation_request.rejection_reason && navigation_request.confidence === 'high';
