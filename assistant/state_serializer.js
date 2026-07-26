const FENCE_BEGIN = 'BEGIN_UNTRUSTED_DATA';
const FENCE_END = 'END_UNTRUSTED_DATA';
const SELECTION_HEADER = 'SELECT';
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

const annotationStatus = (track_id, annotations) => track_id === annotations.gene_track ? 'gene' : 'active';

const annotationLines = annotations => annotations.active.map(track_id => `ann=${quarantineField(track_id)}|${annotationStatus(track_id, annotations)}`);

const hiddenPairLines = hidden_pairs => hidden_pairs.map(hidden_pair => `hidden=${quarantineField(hidden_pair)}`);

const selectionLine = (fields, index) => `${index}|${fields.map(field => quarantineField(field)).join('|')}`;

/**
 * Renders per-turn state as delimited text for the model and for the eval
 * corpus. The header carries only numbers, flags and tokens that passed
 * SAFE_TOKEN_PATTERN, so it needs no escaping. Every string whose value
 * originates from population or annotation data is escaped and emitted between
 * the untrusted fences, one record per line, regardless of how harmless it
 * looks. Escaping removes newlines, so a data value can never begin a line and
 * cannot forge a fence marker. Per D-021 the available-annotation catalogue is
 * not carried here; only active annotations and the gene track are. This module
 * imports nothing and never reads DELPHI.
 */
export const serializeState = observed_state => [
	...headerLines(observed_state),
	FENCE_BEGIN,
	...observed_state.populations.map(populationLine),
	...annotationLines(observed_state.annotations),
	...hiddenPairLines(observed_state.hidden_pairs),
	FENCE_END
].join('\n');

/**
 * Renders one turn's selection list. Items is an array of field arrays, so the
 * same function serves annotation, gene, population and metadata selection.
 * Every field is quarantined because a selection list is data by definition.
 * Each record is addressed by its leading index and the model answers with that
 * index, never with a composed identifier, so it cannot name an item that was
 * not presented this turn.
 */
export const serializeSelectionList = items => [
	`${SELECTION_HEADER} ${formatNumber(items.length)}`,
	FENCE_BEGIN,
	...items.map(selectionLine),
	FENCE_END
].join('\n');
