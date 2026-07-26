const BUCKETS = ['tool-call', 'state-description', 'decision', 'model-capability', 'harness'];

const percentile = (sorted_values, fraction) => sorted_values.length === 0 ? null : sorted_values[Math.min(sorted_values.length - 1, Math.floor(fraction * sorted_values.length))];

const roundTo = (value, digits) => value === null ? null : Number(value.toFixed(digits));

const numbersOf = (results, reader) => results.map(reader).filter(value => Number.isFinite(value)).sort((left, right) => left - right);

const mean = values => values.length === 0 ? null : values.reduce((total, value) => total + value, 0) / values.length;

const bucketCounts = results => Object.fromEntries(BUCKETS.map(bucket => [bucket, results.filter(result => result.score.bucket === bucket).length]));

const successRate = results => results.length === 0 ? null : results.filter(result => result.score.passed).length / results.length;

const distribution = values => ({ mean: roundTo(mean(values), 1), p50: roundTo(percentile(values, 0.5), 1), p95: roundTo(percentile(values, 0.95), 1), max: roundTo(values[values.length - 1], 1) });

const summarizeType = results => ({
	tasks: results.length,
	passed: results.filter(result => result.score.passed).length,
	success_rate: roundTo(successRate(results), 3),
	success_rate_nominal: roundTo(successRate(results.filter(result => !result.task.edge)), 3),
	success_rate_edge: roundTo(successRate(results.filter(result => result.task.edge)), 3),
	failure_split: bucketCounts(results),
	latency_ms: distribution(numbersOf(results, result => result.latency_ms)),
	prompt_tokens: distribution(numbersOf(results, result => result.prompt_tokens)),
	completion_tokens: distribution(numbersOf(results, result => result.completion_tokens))
});

/**
 * Aggregates per capability, never into a single headline number. Every task
 * type reports its own success rate, its own nominal and edge split, and its own
 * failure buckets, because a pooled figure hides which capability is shippable.
 */
export const summarizeByType = results => Object.fromEntries([...new Set(results.map(result => result.task.task_type))].map(task_type => [task_type, summarizeType(results.filter(result => result.task.task_type === task_type))]));

export const summarizeStateTokens = state_token_rows => ({
	per_fixture: state_token_rows,
	state_block_tokens: distribution(state_token_rows.map(row => row.state_block_tokens).filter(value => Number.isFinite(value)).sort((left, right) => left - right)),
	full_prompt_tokens: distribution(state_token_rows.map(row => row.full_prompt_tokens).filter(value => Number.isFinite(value)).sort((left, right) => left - right))
});
