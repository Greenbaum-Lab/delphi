export const makeTask = ({ task_type, schema_name, fixture, template_id, phrasing_index, utterance, expected, comparators, edge }) => ({
	task_id: `${task_type}|${template_id}|${fixture.fixture_id}|${phrasing_index}`,
	task_type,
	schema_name,
	template_id,
	phrasing_index,
	edge,
	fixture_id: fixture.fixture_id,
	capture_index: fixture.capture_index,
	transform_name: fixture.transform_name,
	serialized_state: fixture.serialized_state,
	utterance,
	expected,
	comparators
});

export const takeSpread = (items, count) => count >= items.length ? items : Array.from({ length: count }, (unused, index) => items[Math.floor(index * items.length / count)]);
