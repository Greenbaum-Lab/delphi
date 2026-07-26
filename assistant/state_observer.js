import { getOptions } from '/apc/common.js';
import { getPopData } from '/browser/pops.js';
import { listAnnotations } from '/assets.js';

const DISPLAY_KEYS = [
	'chr',
	'start',
	'end',
	'viewfinder_start',
	'viewfinder_end',
	'zoom_level',
	'mode',
	'measure',
	'sort',
	'sort_dir',
	'window_size',
	'show_guides'
];

const readDisplayFields = options => Object.fromEntries(DISPLAY_KEYS.map(key => [key, options[key] === undefined ? null : options[key]]));

const readMeasureLimits = options => {
	const measure_limits = (options.y_limits || {})[options.measure];
	return Array.isArray(measure_limits) ? measure_limits : null;
};

const summarizePopulation = (label, population_data) => ({
	label,
	resolved: Boolean(population_data),
	dataset: population_data ? population_data.Dataset : null,
	aadr_population: population_data ? population_data.aadr_population : null,
	sample_count: population_data && Array.isArray(population_data.subset) ? population_data.subset.length : null,
	time: population_data ? population_data.time : null
});

const readSelectedPopulations = selected_labels => Promise.all(selected_labels.map(label => getPopData(label).then(population_data => summarizePopulation(label, population_data))));

/**
 * Reads DELPHI display state. Writes no options and dispatches no events.
 * Data-derived strings are returned raw here and are escaped and fenced by
 * state_serializer.js, which is the only place that decides what is
 * quarantined. Requires browser.js init to have run, because getOptions
 * initializes site_options when the key is absent.
 */
export const observeState = async () => {
	const options = getOptions();
	const available_annotations = await listAnnotations();
	const populations = await readSelectedPopulations(options.populations || []);
	return {
		format: 'delphi_state',
		version: 1,
		display: { ...readDisplayFields(options), y_limits_current: readMeasureLimits(options) },
		populations,
		annotations: {
			active: options.annotations || [],
			gene_track: (options.annotations || [])[0] || null,
			available: available_annotations
		},
		hidden_pairs: options.hidden_pairs || []
	};
};
