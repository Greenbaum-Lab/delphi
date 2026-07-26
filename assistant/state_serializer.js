const FENCE_BEGIN = 'BEGIN_UNTRUSTED_DATA';
const FENCE_END = 'END_UNTRUSTED_DATA';
const MAX_FIELD_LENGTH = 48;
const SAFE_TOKEN_PATTERN = /^[A-Za-z0-9_.:-]{1,20}$/;

const formatNumber = value => value === null || value === undefined || !Number.isFinite(Number(value)) ? '?' : String(Number(value));

const formatFlag = value => value ? '1' : '0';

const formatToken = value => SAFE_TOKEN_PATTERN.test(String(value)) ? String(value) : '?';

const formatRange = (start, end) => `${formatNumber(start)}-${formatNumber(end)}`;

const escapeField = value => String(value).replace(/[\\|]/g, match => `\\${match}`).replace(/[^\x20-\x7e]/g, '?');

const quarantineField = value => {
	if (value === null || value === undefined || value === '')
		return '-';
	const escaped_value = escapeField(value);
	return escaped_value.length > MAX_FIELD_LENGTH ? `${escaped_value.slice(0, MAX_FIELD_LENGTH)}~` : escaped_value;
};

const headerLines = observed_state => {
	const display = observed_state.display;
	const measure_limits = display.y_limits_current;
	return [
		`DELPHI_STATE ${formatNumber(observed_state.version)}`,
		`chr=${formatToken(display.chr)}`,
		`region=${formatRange(display.start, display.end)}`,
		`viewfinder=${formatRange(display.viewfinder_start, display.viewfinder_end)}`,
		`zoom=${formatNumber(display.zoom_level)}`,
		`window=${formatNumber(display.window_size)}`,
		`mode=${formatToken(display.mode)}`,
		`measure=${formatToken(display.measure)}`,
		`sort=${formatToken(display.sort)}`,
		`sort_dir=${formatToken(display.sort_dir)}`,
		`guides=${formatFlag(display.show_guides)}`,
		`ylimits=${measure_limits ? formatRange(measure_limits[0], measure_limits[1]) : '-'}`,
		`populations=${formatNumber(observed_state.populations.length)}`,
		`annotations=${formatNumber(observed_state.annotations.active.length)}/${formatNumber(observed_state.annotations.available.length)}`
	];
};

const populationLine = population => `pop=${quarantineField(population.label)}|${quarantineField(population.dataset)}|${quarantineField(population.aadr_population)}|${formatNumber(population.sample_count)}|${formatNumber(population.time)}|${population.resolved ? 'ok' : 'unresolved'}`;

const annotationStatus = (track_id, annotations) => track_id === annotations.gene_track ? 'gene' : annotations.active.includes(track_id) ? 'active' : 'available';

const annotationLines = annotations => {
	const track_ids = annotations.available.concat(annotations.active.filter(track_id => !annotations.available.includes(track_id)));
	return track_ids.map(track_id => `ann=${quarantineField(track_id)}|${annotationStatus(track_id, annotations)}`);
};

const hiddenPairLines = hidden_pairs => hidden_pairs.map(hidden_pair => `hidden=${quarantineField(hidden_pair)}`);

/**
 * Renders an observed state object as delimited text for the model and for
 * Agent 2's eval corpus. The header carries only numbers, flags and tokens
 * that passed SAFE_TOKEN_PATTERN, so it needs no escaping. Every string whose
 * value originates from population, annotation or sample data is escaped and
 * emitted between the untrusted fences, one record per line, regardless of how
 * harmless it looks. Escaping removes newlines, so a data value can never
 * begin a line and cannot forge a fence marker. This module imports nothing
 * and never reads DELPHI.
 */
export const serializeState = observed_state => [
	...headerLines(observed_state),
	FENCE_BEGIN,
	...observed_state.populations.map(populationLine),
	...annotationLines(observed_state.annotations),
	...hiddenPairLines(observed_state.hidden_pairs),
	FENCE_END
].join('\n');
