import { getOptions } from '/apc/common.js';
import { route } from '/assistant/router.js';
import { USER_TEST_SET } from '/assistant/user_test_set.js';

const TOUCHED_OPTIONS = ['measure', 'sort', 'sort_dir', 'chr', 'start', 'end', 'zoom_level', 'viewfinder_start', 'viewfinder_end', 'populations', 'annotations'];

const CODE_ONLY_GROUPS = ['conversation'];

const snapshot = () => {
	const options = getOptions();
	return TOUCHED_OPTIONS.map(option_key => [option_key, options[option_key]]);
};

/**
 * Puts the browser back where it was. The test drives the real action layer, so
 * it really does move the view and change the selection; leaving a user's
 * session wherever the fiftieth prompt landed would not be acceptable.
 */
const restore = entries => {
	getOptions(entries);
	const browser = document.querySelector('[data-module="browser"]');
	if (browser) {
		browser.dispatchEvent(new Event('update'));
		browser.dispatchEvent(new Event('refresh'));
	}
};

const sameList = (current, expected) => Array.isArray(current) && current.length === expected.length && expected.every((label, index) => current[index] === label);

const stateMatches = item => Object.entries(item.state).every(([option_key, expected]) => getOptions()[option_key] === expected);

const checkItem = (item, message) => {
	if (item.state)
		return stateMatches(item);
	if (item.includes)
		return (getOptions().populations || []).includes(item.includes);
	if (item.only)
		return sameList(getOptions().populations, item.only);
	return typeof message === 'string' && message.startsWith(item.expect);
};

const runItem = async item => {
	const started_at = performance.now();
	const result = await route(item.utterance);
	const ms = Math.round(performance.now() - started_at);
	return { utterance: item.utterance, group: item.group, ms, message: result.message, passed: checkItem(item, result.message) };
};

const median = values => values.length === 0 ? 0 : [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)];

const latencyLine = (label, rows) => {
	const times = rows.map(row => row.ms);
	return rows.length === 0 ? `${label}: none` : `${label}: ${rows.length} turns, p50 ${median(times)}ms, min ${Math.min(...times)}ms, max ${Math.max(...times)}ms`;
};

const reportGroups = rows => [...new Set(rows.map(row => row.group))].forEach(group => {
	const group_rows = rows.filter(row => row.group === group);
	console.log(`  ${group.padEnd(20)} ${group_rows.filter(row => row.passed).length}/${group_rows.length}   p50 ${median(group_rows.map(row => row.ms))}ms`);
});

const report = rows => {
	console.log(`\naccuracy ${rows.filter(row => row.passed).length}/${rows.length}`);
	reportGroups(rows);
	console.log(`\n${latencyLine('all turns', rows)}`);
	console.log(latencyLine('model turns', rows.filter(row => !CODE_ONLY_GROUPS.includes(row.group))));
	console.log(latencyLine('code-only turns', rows.filter(row => CODE_ONLY_GROUPS.includes(row.group))));
	rows.filter(row => !row.passed).forEach(row => console.log(`FAIL  ${row.utterance}  ->  ${row.message}`));
};

/**
 * Fifty prompts through the real path, scored on what the browser shows.
 *
 * This is not the model harness. It calls route(), so the conversational
 * replies, the resolvers, the near-miss suggestions, the action layer and the
 * verification all run exactly as they do for a user, and a turn only passes if
 * the option values or the reply are what a user would have wanted. Options are
 * snapshotted first and restored at the end.
 *
 *   (await import('/assistant/user_test.js')).runUserTest()
 */
export const runUserTest = async () => {
	const original_options = snapshot();
	const rows = [];
	for (const item of USER_TEST_SET) {
		const row = await runItem(item);
		console.log(`${row.passed ? 'pass' : 'FAIL'} ${String(row.ms).padStart(6)}ms  ${row.group.padEnd(18)} ${row.utterance}`);
		rows.push(row);
	}
	restore(original_options);
	report(rows);
	return rows;
};
