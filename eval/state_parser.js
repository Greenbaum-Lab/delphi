const FENCE_BEGIN = 'BEGIN_UNTRUSTED_DATA';
const FENCE_END = 'END_UNTRUSTED_DATA';
const RANGE_PATTERN = /^(-?[0-9.]+|\?)-(-?[0-9.]+|\?)$/;

const appendCharacter = (fields, character) => [...fields.slice(0, -1), fields[fields.length - 1] + character];

const nextFieldState = (field_state, character) => field_state.escaped ? { escaped: false, fields: appendCharacter(field_state.fields, character) } : character === '\\' ? { escaped: true, fields: field_state.fields } : character === '|' ? { escaped: false, fields: [...field_state.fields, ''] } : { escaped: false, fields: appendCharacter(field_state.fields, character) };

const splitEscapedFields = body => [...body].reduce(nextFieldState, { escaped: false, fields: [''] }).fields;

const parseKeyValue = line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)];

const parseRecord = line => {
	const [record_key, record_body] = parseKeyValue(line);
	return { record_key, fields: splitEscapedFields(record_body) };
};

export const numberOrNull = value => value === '?' || value === '-' || value === '' || value === undefined ? null : Number(value);

export const parseRange = value => {
	const range_match = String(value).match(RANGE_PATTERN);
	return range_match ? [numberOrNull(range_match[1]), numberOrNull(range_match[2])] : [null, null];
};

/**
 * Parses a serialized DELPHI_STATE block back into its header fields and its
 * fenced records. Every expected output in the task set is derived from this
 * parse rather than from the state object that produced the text, so a task can
 * only ever require a value the model was actually shown.
 */
export const parseState = serialized_state => {
	const lines = serialized_state.split('\n');
	const fence_begin_index = lines.indexOf(FENCE_BEGIN);
	const fence_end_index = lines.indexOf(FENCE_END);
	const header = Object.fromEntries(lines.slice(1, fence_begin_index).map(parseKeyValue));
	const records = lines.slice(fence_begin_index + 1, fence_end_index).map(parseRecord);
	return { version: lines[0].split(' ')[1], header, records };
};

export const recordsOfKind = (parsed_state, record_key) => parsed_state.records.filter(record => record.record_key === record_key);
