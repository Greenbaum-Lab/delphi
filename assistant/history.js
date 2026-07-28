import { HISTORY_DEPTH } from '/assistant/config.js';

/**
 * A small region history, so that "back" has something to return to. DELPHI has
 * no undo of its own, so this is the assistant's own stack and covers only the
 * moves the assistant itself made.
 */
export const createHistory = () => {
	const regions = [];
	return {
		record: region => {
			regions.push(region);
			if (regions.length > HISTORY_DEPTH)
				regions.shift();
		},
		previous: () => regions.pop() || null,
		depth: () => regions.length
	};
};
