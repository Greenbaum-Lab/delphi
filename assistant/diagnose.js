import { getOptions } from '/apc/common.js';
import { getPopsData } from '/browser/pops.js';
import { loadGeneMap } from '/assets.js';
import { resolveGene, resolvePopulation, RESOLVED } from '/assistant/resolvers.js';
import { startModel, generate, MODEL_METADATA } from '/assistant/model.js';
import { COMMAND_SCHEMA } from '/assistant/schemas.js';
import { buildMessages } from '/assistant/prompt.js';
import { DEV_SET, HELD_OUT_SET, TEST_SET } from '/assistant/eval_set.js';

const FREE_TEXT_KEYS = ['gene_name', 'population_label'];

const parseCommand = raw_text => {
	try {
		return JSON.parse(raw_text);
	} catch (error) {
		return null;
	}
};

const freeTextName = command => {
	const key = FREE_TEXT_KEYS.find(name_key => typeof command[name_key] === 'string' && command[name_key] !== '');
	return key === undefined ? '' : command[key];
};

const probe = async (engine, serialized_state, item) => {
	const started_at = performance.now();
	const raw_text = await generate(engine, buildMessages(serialized_state, item.utterance), COMMAND_SCHEMA);
	const command = parseCommand(raw_text);
	const action = command && typeof command.action === 'string' ? command.action : 'unparseable';
	return { utterance: item.utterance, expected: item.expected, action, passed: action === item.expected, hard: Boolean(item.hard), extracted: command === null ? '' : freeTextName(command), ms: Math.round(performance.now() - started_at) };
};

const rate = rows => rows.length === 0 ? null : Number((rows.filter(row => row.passed).length / rows.length).toFixed(2));

const NAME_ACTIONS = ['gene', 'add_population', 'replace_population'];

const loadCatalogues = async () => {
	const gene_track_id = (getOptions().annotations || [])[0];
	const gene_map = gene_track_id ? await loadGeneMap({ track_id: gene_track_id }) : new Map();
	return { gene_map, populations: await getPopsData() };
};

const nameResolves = (row, catalogues) => row.action === 'gene'
	? resolveGene(catalogues.gene_map, row.extracted).status === RESOLVED
	: resolvePopulation(catalogues.populations, row.extracted).status === RESOLVED;

/**
 * Marks each row with whether the name the model extracted actually exists.
 *
 * Classification alone overstates what a user gets. `take a look at OCA2`
 * scored a pass on the action while extracting OCAB2, which is not a gene: it
 * would reach the resolver, fail, and produce a clarification. Rows carrying no
 * name are marked null rather than false, so they neither pass nor fail this
 * check.
 */
export const checkExtractions = async rows => {
	const catalogues = await loadCatalogues();
	return rows.map(row => NAME_ACTIONS.includes(row.action)
		? Object.assign({}, row, { resolves: nameResolves(row, catalogues) })
		: Object.assign({}, row, { resolves: null }));
};

/**
 * The rate a user would actually experience: the action was right and the name
 * it carried exists. Reported beside the classification rate, never instead of
 * it, because the two failing separately means different things.
 */
export const summarizeEndToEnd = (set_name, rows) => {
	const succeeded = rows.filter(row => row.passed && row.resolves !== false);
	const unresolvable = rows.filter(row => row.resolves === false);
	console.log(`${set_name}: end-to-end ${(succeeded.length / rows.length).toFixed(2)}, ${unresolvable.length} extracted a name that does not exist`);
	unresolvable.forEach(row => console.log(`  no such ${row.action === 'gene' ? 'gene' : 'population'}: ${row.extracted}  (${row.utterance})`));
};

const byAction = rows => Object.fromEntries([...new Set(rows.map(row => row.expected))].map(expected => {
	const group = rows.filter(row => row.expected === expected);
	return [expected, { tasks: group.length, passed: group.filter(row => row.passed).length, rate: rate(group) }];
}));

export const probeSet = async (engine, set_name, items) => {
	console.log(`--- ${set_name}, ${items.length} utterances ---`);
	const rows = [];
	for (const item of items) {
		const row = await probe(engine, '', item);
		console.log(`${row.passed ? 'pass' : 'FAIL'} ${row.ms}ms  ${row.utterance}  ->  ${row.action}${row.extracted ? ` (${row.extracted})` : ''}`);
		rows.push(row);
	}
	return rows;
};

export const summarize = (set_name, rows) => {
	const latencies = rows.map(row => row.ms).sort((left, right) => left - right);
	console.log(`${set_name}: overall ${rate(rows)}, excluding hard ${rate(rows.filter(row => !row.hard))}, latency p50 ${latencies[Math.floor(latencies.length / 2)]}ms max ${latencies[latencies.length - 1]}ms`);
	Object.entries(byAction(rows)).forEach(([action, summary]) => console.log(`  ${set_name} ${action}: ${summary.passed}/${summary.tasks} = ${summary.rate}`));
};

/**
 * Where the failures went. A capability's rate says how often it is wrong; this
 * says what it is wrong as, which is the only thing that separates a model that
 * cannot tell two categories apart from one that collapses onto whichever
 * branch is cheapest. Run 3 and run 4 differed on exactly that and the rates
 * alone could not show it.
 */
export const confusion = (set_name, rows) => {
	const failures = rows.filter(row => !row.passed);
	console.log(`${set_name}: ${failures.length} failures by expected -> chosen`);
	[...new Set(failures.map(row => row.expected))].forEach(expected => {
		const chosen = failures.filter(row => row.expected === expected).map(row => row.action);
		const tally = [...new Set(chosen)].map(action => `${action} x${chosen.filter(item => item === action).length}`);
		console.log(`  ${expected} -> ${tally.join(', ')}`);
	});
};

/**
 * Runs both sets against one engine, no state in the prompt, and reports each
 * separately.
 *
 * TEST is the only unburned set and the only number worth quoting. The two
 * burned sets run beside it as controls: a change that does not move the sets
 * it was written against has not done what it claimed, and a run where those
 * rise while TEST does not is the signature of memorising.
 *
 * TEST runs first so a run cut short still produces the number that counts.
 *
 * It acts on nothing: no option is written and no event dispatched.
 *
 *   (await import('/assistant/diagnose.js')).run()
 */
export const run = async () => {
	const engine = await startModel(progress => console.log(progress.text));
	console.log(`${MODEL_METADATA.model_id}, ${DEV_SET.length + HELD_OUT_SET.length + TEST_SET.length} utterances over three sets`);
	const test_rows = await probeSet(engine, 'TEST (unburned)', TEST_SET);
	const dev_rows = await probeSet(engine, 'dev (burned)', DEV_SET);
	const held_out_rows = await probeSet(engine, 'held-out round 2 (burned)', HELD_OUT_SET);
	summarize('TEST (unburned)', test_rows);
	summarize('dev (burned)', dev_rows);
	summarize('held-out round 2 (burned)', held_out_rows);
	return { test: test_rows, dev: dev_rows, held_out: held_out_rows };
};
