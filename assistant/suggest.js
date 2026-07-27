const MAX_SUGGESTIONS = 3;

const SHORT_NAME_LENGTH = 5;

const toleranceFor = length => length >= SHORT_NAME_LENGTH ? 2 : 1;

/**
 * Levenshtein distance, one row at a time so the whole matrix is never held.
 * Kept private: nothing outside this module should be comparing names by
 * distance, because a distance is only ever grounds for asking the user.
 */
const editDistance = (left, right) => {
	let previous_row = Array.from({ length: right.length + 1 }, (unused, index) => index);
	for (let left_index = 0; left_index < left.length; left_index += 1) {
		const current_row = [left_index + 1];
		for (let right_index = 0; right_index < right.length; right_index += 1)
			current_row.push(Math.min(current_row[right_index] + 1, previous_row[right_index + 1] + 1, previous_row[right_index] + (left[left_index] === right[right_index] ? 0 : 1)));
		previous_row = current_row;
	}
	return previous_row[right.length];
};

/**
 * Scores one candidate, or nothing if it is too far away to offer.
 *
 * The tolerance comes from the longer of the two names, not from the query.
 * Keyed to the query, a truncated one can never reach the full name it was
 * meant to be: basq is four characters, and Basque is two edits away.
 */
const scoredEntry = (name, query) => {
	const tolerance = toleranceFor(Math.max(name.length, query.length));
	if (Math.abs(name.length - query.length) > tolerance)
		return null;
	const distance = editDistance(name.toLowerCase(), query.toLowerCase());
	return distance > 0 && distance <= tolerance ? { name, distance } : null;
};

const scored = (names, query) => names
	.filter(name => typeof name === 'string')
	.map(name => scoredEntry(name, query))
	.filter(entry => entry !== null);

/**
 * Names close enough to a failed lookup to be worth offering back, nearest
 * first, at most three.
 *
 * This never resolves anything. Its output is the content of a question, which
 * is what CLAUDE.md section 6 prescribes for a near miss: it asks the user, it
 * does not guess. Exact and case-folded hits are the resolvers' business and
 * are excluded here by the zero-distance filter, so a name that already
 * resolved is never also suggested.
 *
 * The length prefilter keeps this cheap enough to run against the 55,765-entry
 * gene map on a failure path.
 */
export const suggestNames = (names, query) => {
	if (!Array.isArray(names) || typeof query !== 'string' || query.length === 0)
		return [];
	return scored(names, query)
		.sort((left, right) => left.distance - right.distance)
		.slice(0, MAX_SUGGESTIONS)
		.map(entry => entry.name);
};
