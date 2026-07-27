const ANSWER_READERS = {
	chr: observed_state => observed_state.display.chr,
	region: observed_state => `${observed_state.display.chr}:${observed_state.display.start}-${observed_state.display.end}`,
	zoom: observed_state => String(observed_state.display.zoom_level),
	window: observed_state => String(observed_state.display.window_size),
	mode: observed_state => observed_state.display.mode,
	measure: observed_state => observed_state.display.measure,
	sort: observed_state => `${observed_state.display.sort}, ${observed_state.display.sort_dir}`,
	populations: observed_state => observed_state.populations.length === 0 ? 'none' : observed_state.populations.map(population => population.label).join(', '),
	annotations: observed_state => observed_state.annotations.active.length === 0 ? 'none' : observed_state.annotations.active.join(', ')
};

export const STATE_FIELDS = Object.keys(ANSWER_READERS);

/**
 * Reads one display field out of the observed state. The model chooses which
 * field; code produces the value, so a state answer is never generated text
 * and cannot be wrong about what the browser is showing. Free-form narration
 * is out of scope (D-023), which is why every answer is one field.
 */
export const answerField = (observed_state, field) => {
	const reader = ANSWER_READERS[field];
	return reader ? reader(observed_state) : null;
};
