import { resolveGene, resolvePopulation, resolveAnnotation, resolveMeasure, resolveSortField } from '/assistant/resolvers.js';
import { parseFilterExpression, selectByNumeric, selectByMetadata, listMetadataValues } from '/assistant/metadata_filter.js';
import { buildMetadataIndex } from '/assistant/catalogue.js';

const GENE_MAP = new Map([
	['LCT', { chr: 'chr2', start: 136545410 }],
	['LCTL', { chr: 'chr15', start: 66346525 }],
	['MCM6', { chr: 'chr2', start: 136597092 }],
	['EDAR', { chr: 'chr2', start: 109510927 }]
]);

const POPULATION_RECORDS = [
	{ label: 'Yoruba', Dataset: 'gnomAD', Temperature_index: 25.4, Distance_from_Africa: 0, subset: ['S1', 'S2'] },
	{ label: 'Yoruba-1KGP', Dataset: 'gnomAD', Temperature_index: 25.1, Distance_from_Africa: 0, subset: ['S3'] },
	{ label: 'Finnish', Dataset: 'gnomAD', Temperature_index: 2.3, Distance_from_Africa: 7100, subset: ['S4', 'S5'] },
	{ label: 'Han', Dataset: 'AADR', Temperature_index: 14.8, Distance_from_Africa: null, subset: [] }
];

const METADATA_SAMPLES = [
	{ Poseidon_ID: 'S1', Region: 'Africa', Country: 'Nigeria' },
	{ Poseidon_ID: 'S2', Region: 'Africa', Country: 'Nigeria' },
	{ Poseidon_ID: 'S3', Region: 'Africa', Country: 'Nigeria' },
	{ Poseidon_ID: 'S4', Region: 'Europe', Country: 'Finland' },
	{ Poseidon_ID: 'S5', Region: 'Europe', Country: 'Sweden' }
];

const METADATA_INDEX = buildMetadataIndex(POPULATION_RECORDS, METADATA_SAMPLES);

const CASES = [
	['gene exact match resolves', () => resolveGene(GENE_MAP, 'LCT').entry.start === 136545410],
	['gene exact match carries the chromosome', () => resolveGene(GENE_MAP, 'LCT').entry.chr === 'chr2'],
	['gene lowercase does not resolve', () => resolveGene(GENE_MAP, 'lct').status === 'ambiguous'],
	['gene lowercase offers the exact name', () => resolveGene(GENE_MAP, 'lct').candidates.includes('LCT')],
	['gene prefix offers both completions', () => resolveGene(GENE_MAP, 'LCT').status === 'resolved' && resolveGene(GENE_MAP, 'LC').candidates.length === 2],
	['unknown gene is not found', () => resolveGene(GENE_MAP, 'ZZZZ9').status === 'not_found'],
	['empty gene name is not found', () => resolveGene(GENE_MAP, '').status === 'not_found'],
	['non-string gene name is not found', () => resolveGene(GENE_MAP, null).status === 'not_found'],
	['population exact match resolves', () => resolvePopulation(POPULATION_RECORDS, 'Finnish').entry.label === 'Finnish'],
	['population near miss stays unresolved', () => resolvePopulation(POPULATION_RECORDS, 'Yoruba ').status !== 'resolved'],
	['population prefix offers both variants', () => resolvePopulation(POPULATION_RECORDS, 'Yorub').candidates.length === 2],
	['population acronym does not resolve', () => resolvePopulation(POPULATION_RECORDS, 'YRI').status === 'not_found'],
	['annotation exact match resolves', () => resolveAnnotation(['gencode19_genes'], 'gencode19_genes').entry === 'gencode19_genes'],
	['annotation unknown is not found', () => resolveAnnotation(['gencode19_genes'], 'refseq').status === 'not_found'],
	['measure exact match resolves', () => resolveMeasure('fst').entry === 'fst'],
	['measure uppercase does not resolve', () => resolveMeasure('FST').status === 'ambiguous'],
	['measure outside the enum is not found', () => resolveMeasure('pi').status === 'not_found'],
	['sort field exact match resolves', () => resolveSortField('time').entry === 'time'],
	['sort field outside D-025 is not found', () => resolveSortField('Latitude').status === 'not_found'],
	['numeric expression parses', () => parseFilterExpression('Temperature_index > 10').kind === 'numeric'],
	['numeric expression keeps the comparator', () => parseFilterExpression('Temperature_index>=10').comparator === '>='],
	['unknown numeric field is rejected', () => parseFilterExpression('Rainfall > 10') === null],
	['plain phrase parses as metadata', () => parseFilterExpression('Europe').kind === 'metadata'],
	['empty filter is rejected', () => parseFilterExpression('') === null],
	['numeric filter selects above threshold', () => selectByNumeric(POPULATION_RECORDS, { field: 'Temperature_index', comparator: '>', value: 10 }).length === 3],
	['numeric filter excludes null fields', () => selectByNumeric(POPULATION_RECORDS, { field: 'Distance_from_Africa', comparator: '>=', value: 0 }).length === 3],
	['region index takes the modal value', () => METADATA_INDEX.get('Finnish').country === 'Finland'],
	['region selection matches exactly', () => selectByMetadata(METADATA_INDEX, 'region', 'Europe').length === 1],
	['region selection is case sensitive', () => selectByMetadata(METADATA_INDEX, 'region', 'europe').length === 0],
	['country selection joins through samples', () => selectByMetadata(METADATA_INDEX, 'country', 'Nigeria').length === 2],
	['population with no samples has no region', () => METADATA_INDEX.get('Han').region === null],
	['metadata values are listed once', () => listMetadataValues(METADATA_INDEX, 'region').length === 2]
];

const runCase = ([description, test_function]) => {
	try {
		return { description, passed: test_function() === true };
	} catch (error) {
		return { description, passed: false, error: error.message };
	}
};

const renderResult = (container, result) => {
	const line = document.createElement('div');
	line.className = result.passed ? 'pass' : 'fail';
	line.textContent = `${result.passed ? 'PASS' : 'FAIL'} ${result.description}${result.error ? ` (${result.error})` : ''}`;
	container.append(line);
};

export const runTests = () => {
	const container = document.querySelector('[data-results]');
	const results = CASES.map(runCase);
	results.forEach(result => renderResult(container, result));
	const failed = results.filter(result => !result.passed);
	const summary = document.createElement('div');
	summary.className = failed.length === 0 ? 'summary pass' : 'summary fail';
	summary.textContent = `${results.length - failed.length}/${results.length} passed`;
	container.append(summary);
	return { total: results.length, failed: failed.length };
};
