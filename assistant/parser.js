import { RELATIVE_MOVES } from '/assistant/config.js';
import { resolveGene, resolvePopulation } from '/assistant/resolvers.js';

const REGION_PATTERN = /^(chr[0-9xym]+)\s*:\s*([0-9]+)(?:\s*-\s*([0-9]+))?$/i;
const SCALED_NUMBER = /([0-9]+(?:\.[0-9]+)?)\s*(kb?|mb?)\b/gi;
const SCALES = { k: 1000, kb: 1000, m: 1000000, mb: 1000000 };
const ADD_PREFIX = /^(?:add|include|also show|and)\s+/i;
const LEAD_VERB = /^(?:go\s+to|goto|show(?:\s+me)?|take\s+me\s+to|jump\s+to|move\s+to|switch\s+to|display|select|find)\s+/i;

const RELATIVE_PHRASES = [
	[/^(?:zoom\s*in|closer|magnify)$/i, 'zoom_in'],
	[/^(?:zoom\s*out|wider view|pull back)$/i, 'zoom_out'],
	[/^(?:pan\s*left|left|move left|earlier)$/i, 'pan_left'],
	[/^(?:pan\s*right|right|move right|later)$/i, 'pan_right'],
	[/^(?:widen|show more|broaden|zoom way out)$/i, 'widen'],
	[/^(?:back|go back|undo|previous|revert)$/i, 'back']
];

const emptyRequest = () => ({ populations: null, chrom: null, start: null, end: null, gene_symbol: null, relative: null, confidence: 'high', rejection_reason: null });

const expandScales = text => text.replace(SCALED_NUMBER, (match, number, unit) => String(Math.round(Number(number) * SCALES[unit.toLowerCase()])));

const stripLeadingVerb = text => text.trim().replace(LEAD_VERB, '').trim();

const parseRelative = text => {
	const cleaned_text = text.trim();
	const matched_phrase = RELATIVE_PHRASES.find(([pattern]) => pattern.test(cleaned_text));
	if (!matched_phrase)
		return null;
	return { ...emptyRequest(), relative: matched_phrase[1] };
};

/**
 * Reads an explicit coordinate query. This is the case the UCSC search box has
 * handled without a model for twenty years, and it stays that way here: no
 * request of this shape ever reaches the network.
 */
const parseCoordinates = text => {
	const region_match = expandScales(stripLeadingVerb(text).replace(/,/g, '')).match(REGION_PATTERN);
	if (!region_match)
		return null;
	const start = Number(region_match[2]);
	const end = region_match[3] === undefined ? start : Number(region_match[3]);
	return { ...emptyRequest(), chrom: region_match[1].toLowerCase(), start, end };
};

const parseGene = (text, catalog) => {
	const gene_symbol = stripLeadingVerb(text).replace(/\s+gene$/i, '');
	const resolution = resolveGene(catalog.gene_map, gene_symbol);
	return resolution.status === 'resolved' ? { ...emptyRequest(), gene_symbol: resolution.entry.gene_symbol } : null;
};

/**
 * Reads a population name, and composes the full desired set when the request
 * is additive. The patch always carries the whole selection, so adding is done
 * here in code rather than by asking the model to remember what was selected.
 */
const parsePopulation = (text, catalog, state_slice) => {
	const is_addition = ADD_PREFIX.test(text.trim());
	const population_label = stripLeadingVerb(text.trim().replace(ADD_PREFIX, ''));
	const resolution = resolvePopulation(catalog.population_labels, population_label);
	if (resolution.status !== 'resolved')
		return null;
	const selected = is_addition ? [...state_slice.populations, resolution.entry] : [resolution.entry];
	return { ...emptyRequest(), populations: [...new Set(selected)] };
};

/**
 * Tier 0. Resolves a request with no model call at all, or returns null so the
 * caller falls through to the cache and then the model. Every branch here is a
 * lookup against a code-held collection or a fixed phrase table, so it cannot
 * invent a coordinate, a gene or a population.
 */
export const parseRequest = (text, catalog, state_slice) => {
	if (typeof text !== 'string' || text.trim() === '')
		return null;
	return parseRelative(text)
		|| parseCoordinates(text)
		|| parseGene(text, catalog)
		|| parsePopulation(text, catalog, state_slice);
};

export const isRelativeMove = move => RELATIVE_MOVES.includes(move);
