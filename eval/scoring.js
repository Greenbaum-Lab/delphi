import { resolveGene, resolvePopulation } from './catalogues.js';
import { REQUIRED_PARAMETERS, CLARIFY } from './schemas.js';

const UNUSABLE_PATTERN = /^\?$|^-$|~$/;
const MODEL_CAPABILITY_THRESHOLD = 0.8;

const geneMatches = (gene_map, expected_value, model_value) => {
	const expected_entry = resolveGene(gene_map, expected_value);
	const model_entry = resolveGene(gene_map, model_value);
	return Boolean(expected_entry && model_entry) && model_entry.chr === expected_entry.chr && model_entry.start === expected_entry.start;
};

const populationMatches = (populations, expected_value, model_value) => {
	const expected_population = resolvePopulation(populations, expected_value);
	const model_population = resolvePopulation(populations, model_value);
	return Boolean(expected_population && model_population) && model_population.label === expected_population.label;
};

const COMPARATORS = {
	exact: (expected_value, model_value) => String(model_value) === String(expected_value),
	integer: (expected_value, model_value) => Number(model_value) === Number(expected_value),
	resolved_gene: (expected_value, model_value, catalogues) => geneMatches(catalogues.gene_map, expected_value, model_value),
	resolved_population: (expected_value, model_value, catalogues) => populationMatches(catalogues.populations, expected_value, model_value)
};

const missingParameters = (task, model_output) => model_output.action === CLARIFY ? [] : REQUIRED_PARAMETERS[task.schema_name].filter(parameter_name => model_output[parameter_name] === undefined);

const expectationBucket = task => Object.values(task.expected).some(expected_value => UNUSABLE_PATTERN.test(String(expected_value))) ? 'state-description' : 'decision';

const mismatchedKeys = (task, model_output, catalogues) => Object.keys(task.comparators).filter(key => !COMPARATORS[task.comparators[key]](task.expected[key], model_output[key], catalogues));

/**
 * Scores one task against one model output and assigns a failure bucket.
 * Malformed or incomplete structure is a tool-call failure, a wrong value the
 * state could not supply is a state-description failure, and anything else is a
 * decision failure until markModelCapability promotes it.
 */
export const scoreTask = (task, model_output, catalogues) => {
	if (!model_output || typeof model_output !== 'object' || typeof model_output.action !== 'string')
		return { passed: false, bucket: 'tool-call' };
	if (missingParameters(task, model_output).length > 0)
		return { passed: false, bucket: 'tool-call', missing: missingParameters(task, model_output) };
	if (model_output.action !== task.expected.action)
		return { passed: false, bucket: expectationBucket(task), wrong_action: model_output.action };
	const mismatched = mismatchedKeys(task, model_output, catalogues);
	return mismatched.length === 0 ? { passed: true, bucket: null } : { passed: false, bucket: expectationBucket(task), mismatched };
};

export const parseOutput = raw_text => {
	try {
		return JSON.parse(raw_text);
	} catch (parse_error) {
		return null;
	}
};

const groupKey = result => `${result.task.template_id}|${result.task.fixture_id}`;

const failureRateByGroup = results => new Map([...results.reduce((groups, result) => groups.set(groupKey(result), [...(groups.get(groupKey(result)) || []), result]), new Map())].map(([key, group]) => [key, group.filter(result => !result.score.passed).length / group.length]));

/**
 * Promotes decision failures to model-capability failures where the same
 * template fails on at least the threshold share of phrasings of the same state,
 * which is the signal that the task is beyond the model rather than mis-decided.
 */
export const markModelCapability = results => {
	const failure_rates = failureRateByGroup(results);
	return results.map(result => result.score.bucket === 'decision' && failure_rates.get(groupKey(result)) >= MODEL_CAPABILITY_THRESHOLD ? { ...result, score: { ...result.score, bucket: 'model-capability' } } : result);
};
