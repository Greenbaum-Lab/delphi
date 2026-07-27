import { resolveGene, resolvePopulation, RESOLVED, AMBIGUOUS, UNRESOLVED } from './resolvers.js';

const GENE_MAP = new Map([
	['LCT', { chr: 'chr2', start: 136545410 }],
	['MCM6', { chr: 'chr2', start: 136597200 }],
	['EDAR', { chr: 'chr2', start: 109510927 }]
]);

const POPULATIONS = [
	{ label: 'Yoruba', Dataset: 'gnomAD', aadr_population: 'Yoruba' },
	{ label: 'Yoruba-1KGP', Dataset: 'gnomAD', aadr_population: 'YRI.DG' },
	{ label: 'San', Dataset: 'gnomAD', aadr_population: 'San' }
];

const DUPLICATE_LABEL_POPULATIONS = [
	{ label: 'Yoruba', Dataset: 'gnomAD' },
	{ label: 'Yoruba', Dataset: 'AADR' }
];

const firstMatch = matches => matches[0];

const geneCases = () => [
	{ name: 'gene: exact name resolves', result: resolveGene(GENE_MAP, 'LCT'), status: RESOLVED, matches: 1 },
	{ name: 'gene: resolved entry carries the code-held coordinates', result: resolveGene(GENE_MAP, 'LCT'), status: RESOLVED, matches: 1, detail: matches => firstMatch(matches).chr === 'chr2' && firstMatch(matches).start === 136545410 },
	{ name: 'gene: resolved entry carries the gene name', result: resolveGene(GENE_MAP, 'EDAR'), status: RESOLVED, matches: 1, detail: matches => firstMatch(matches).gene_name === 'EDAR' },
	{ name: 'gene: lowercase does not match', result: resolveGene(GENE_MAP, 'lct'), status: UNRESOLVED, matches: 0 },
	{ name: 'gene: mixed case does not match', result: resolveGene(GENE_MAP, 'Lct'), status: UNRESOLVED, matches: 0 },
	{ name: 'gene: trailing punctuation does not match', result: resolveGene(GENE_MAP, 'LCT.'), status: UNRESOLVED, matches: 0 },
	{ name: 'gene: surrounding whitespace does not match', result: resolveGene(GENE_MAP, ' LCT '), status: UNRESOLVED, matches: 0 },
	{ name: 'gene: absent name is unresolved', result: resolveGene(GENE_MAP, 'NOTAGENE'), status: UNRESOLVED, matches: 0 },
	{ name: 'gene: empty string is unresolved', result: resolveGene(GENE_MAP, ''), status: UNRESOLVED, matches: 0 },
	{ name: 'gene: undefined name is unresolved', result: resolveGene(GENE_MAP, undefined), status: UNRESOLVED, matches: 0 },
	{ name: 'gene: non-string name is unresolved', result: resolveGene(GENE_MAP, 42), status: UNRESOLVED, matches: 0 },
	{ name: 'gene: missing map is unresolved', result: resolveGene(undefined, 'LCT'), status: UNRESOLVED, matches: 0 },
	{ name: 'gene: plain object as map is unresolved', result: resolveGene({ LCT: { chr: 'chr2', start: 1 } }, 'LCT'), status: UNRESOLVED, matches: 0 },
	{ name: 'gene: empty map is unresolved', result: resolveGene(new Map(), 'LCT'), status: UNRESOLVED, matches: 0 },
	{ name: 'gene: inherited property name is unresolved', result: resolveGene(GENE_MAP, 'constructor'), status: UNRESOLVED, matches: 0 }
];

const populationCases = () => [
	{ name: 'population: exact label resolves', result: resolvePopulation(POPULATIONS, 'Yoruba'), status: RESOLVED, matches: 1 },
	{ name: 'population: resolved entry is the catalogue record', result: resolvePopulation(POPULATIONS, 'Yoruba'), status: RESOLVED, matches: 1, detail: matches => firstMatch(matches) === POPULATIONS[0] },
	{ name: 'population: a label that is a prefix of another resolves to itself only', result: resolvePopulation(POPULATIONS, 'Yoruba'), status: RESOLVED, matches: 1, detail: matches => firstMatch(matches).aadr_population === 'Yoruba' },
	{ name: 'population: suffixed label resolves separately', result: resolvePopulation(POPULATIONS, 'Yoruba-1KGP'), status: RESOLVED, matches: 1, detail: matches => firstMatch(matches).aadr_population === 'YRI.DG' },
	{ name: 'population: lowercase does not match', result: resolvePopulation(POPULATIONS, 'yoruba'), status: UNRESOLVED, matches: 0 },
	{ name: 'population: trailing punctuation does not match', result: resolvePopulation(POPULATIONS, 'Yoruba?'), status: UNRESOLVED, matches: 0 },
	{ name: 'population: surrounding whitespace does not match', result: resolvePopulation(POPULATIONS, ' Yoruba'), status: UNRESOLVED, matches: 0 },
	{ name: 'population: acronym does not match', result: resolvePopulation(POPULATIONS, 'YRI'), status: UNRESOLVED, matches: 0 },
	{ name: 'population: absent label is unresolved', result: resolvePopulation(POPULATIONS, 'Atlantis'), status: UNRESOLVED, matches: 0 },
	{ name: 'population: empty string is unresolved', result: resolvePopulation(POPULATIONS, ''), status: UNRESOLVED, matches: 0 },
	{ name: 'population: undefined label is unresolved', result: resolvePopulation(POPULATIONS, undefined), status: UNRESOLVED, matches: 0 },
	{ name: 'population: missing catalogue is unresolved', result: resolvePopulation(undefined, 'Yoruba'), status: UNRESOLVED, matches: 0 },
	{ name: 'population: empty catalogue is unresolved', result: resolvePopulation([], 'Yoruba'), status: UNRESOLVED, matches: 0 },
	{ name: 'population: a null record is skipped rather than thrown on', result: resolvePopulation([null, POPULATIONS[0]], 'Yoruba'), status: RESOLVED, matches: 1 },
	{ name: 'population: duplicate labels are ambiguous', result: resolvePopulation(DUPLICATE_LABEL_POPULATIONS, 'Yoruba'), status: AMBIGUOUS, matches: 2 },
	{ name: 'population: ambiguous result returns every match', result: resolvePopulation(DUPLICATE_LABEL_POPULATIONS, 'Yoruba'), status: AMBIGUOUS, matches: 2, detail: matches => matches[0].Dataset === 'gnomAD' && matches[1].Dataset === 'AADR' }
];

const checkCase = test_case => {
	const result = test_case.result;
	const detail_passed = test_case.detail === undefined || test_case.detail(result.matches) === true;
	const passed = result.status === test_case.status && result.matches.length === test_case.matches && detail_passed;
	return { name: test_case.name, passed, status: result.status, matches: result.matches.length, expected_status: test_case.status, expected_matches: test_case.matches };
};

/**
 * Runs the resolver cases and reports the failures. Pure, so it needs neither
 * DELPHI nor a model: import this module and call it from the page console, or
 * from any ES module runtime. Every case is a fixture, never live data, so a
 * failure is always the resolver and never the catalogue.
 */
export const runResolverTests = () => {
	const results = [...geneCases(), ...populationCases()].map(checkCase);
	const failures = results.filter(result => !result.passed);
	failures.forEach(failure => console.error(`FAIL ${failure.name}: got ${failure.status}/${failure.matches}, expected ${failure.expected_status}/${failure.expected_matches}`));
	console.log(`resolvers: ${results.length - failures.length}/${results.length} passed`);
	return { total: results.length, passed: results.length - failures.length, failures };
};
