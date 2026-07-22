import { getOptions } from '/apc/common.js';
import { addPopulation, getPops } from '/browser/pops.js';
import { getMetadata } from '/assets.js';
import { updateRegionFromInput } from '/browser/helpers.js';
import { CHR_LENGTHS } from '/common.js';

const MEASURES = ['heterozygosity', 'fst', 'tajimasd', 'fulif'];
const SORT_FIELDS = ['time', 'Distance_from_Africa', 'Latitude', 'Longitude', 'Temperature_index', 'Precipitation_index', 'Agriculture_extensiveness', 'Urbanization_onset', 'genetic_distance', 'signal'];
const WINDOW_SIZES = [10000, 100000, 1000000];

const dispatchBrowser = event_name => {
	const browser = document.querySelector('[data-module="browser"]');
	if (browser)
		browser.dispatchEvent(new Event(event_name));
};

const unknownLabels = async labels => {
	const known = await getPops();
	return labels.filter(label => !known.includes(label));
};

const matchesDateRange = (sample, date_start_kya, date_end_kya) =>
	sample.Date >= date_start_kya * 1000 && sample.Date <= date_end_kya * 1000;

const filterSampleIds = (samples, region, date_start_kya, date_end_kya) => samples
	.filter(sample => sample.Region === region && matchesDateRange(sample, date_start_kya, date_end_kya))
	.map(sample => sample.Poseidon_ID);

const ACTIONS = {
	select_populations: async ({ labels }) => {
		const unknown = await unknownLabels(labels);
		if (unknown.length > 0)
			throw new Error(`unknown populations ${unknown.join(', ')}, use existing labels`);
		getOptions([['populations', labels]]);
		dispatchBrowser('update');
		return `selected populations ${labels.join(', ')}`;
	},
	create_population: async ({ label, region, date_start_kya, date_end_kya }) => {
		const samples = await getMetadata();
		const sample_ids = filterSampleIds(samples, region, date_start_kya, date_end_kya);
		if (sample_ids.length === 0)
			throw new Error(`no samples match ${region} at ${date_start_kya}-${date_end_kya} kya, population not created`);
		await addPopulation(label, 'User', '', sample_ids);
		return `created population '${label}' from ${sample_ids.length} samples`;
	},
	set_measure: async ({ measure }) => {
		if (!MEASURES.includes(measure))
			throw new Error(`unknown measure ${measure}`);
		const selector = document.querySelector('.measure-selector');
		if (!selector)
			throw new Error('measure selector not found');
		selector.value = measure;
		selector.dispatchEvent(new Event('change'));
		return `set measure to ${measure}`;
	},
	navigate_to_gene: async ({ gene_symbol }) => {
		if (!gene_symbol)
			throw new Error('missing gene symbol');
		const input = document.querySelector('.region-query');
		if (!input)
			throw new Error('region search input not found');
		input.value = gene_symbol;
		updateRegionFromInput();
		return `navigated to gene ${gene_symbol}`;
	},
	navigate_to_region: async ({ chr, start, end }) => {
		const chromosome = String(chr).startsWith('chr') ? chr : `chr${chr}`;
		if (!CHR_LENGTHS[chromosome])
			throw new Error(`unknown chromosome ${chr}`);
		if (!(start < end))
			throw new Error('region start must be less than end');
		const input = document.querySelector('.region-query');
		input.value = `${chromosome}:${start}-${end}`;
		updateRegionFromInput();
		return `navigated to ${chromosome}:${start}-${end}`;
	},
	set_sort: async ({ field, direction }) => {
		if (!SORT_FIELDS.includes(field))
			throw new Error(`unknown sort field ${field}`);
		const sort_dir = direction === 'desc' ? 'desc' : 'asc';
		getOptions([['sort', field], ['sort_dir', sort_dir]]);
		dispatchBrowser('update');
		return `sorted by ${field} ${sort_dir}`;
	},
	set_window: async ({ size }) => {
		if (!WINDOW_SIZES.includes(size))
			throw new Error(`unknown window size ${size}`);
		const selector = document.querySelector('.window-selector');
		if (!selector)
			throw new Error('window selector not found');
		selector.value = String(size);
		selector.dispatchEvent(new Event('change'));
		return `set window size to ${size}`;
	},
	clear_populations: async () => {
		getOptions([['populations', []]]);
		dispatchBrowser('update');
		return 'cleared selected populations';
	}
};

export const describeAction = ({ tool, args }) => {
	switch (tool) {
		case 'select_populations':
			return `Select populations: ${args.labels.join(', ')}`;
		case 'create_population':
			return `Create population '${args.label}' from ${args.region}, ${args.date_start_kya}-${args.date_end_kya} kya`;
		case 'set_measure':
			return `Set measure to ${args.measure}`;
		case 'navigate_to_gene':
			return `Navigate to gene ${args.gene_symbol}`;
		case 'navigate_to_region':
			return `Navigate to ${args.chr}:${args.start}-${args.end}`;
		case 'set_sort':
			return `Sort by ${args.field} ${args.direction || 'asc'}`;
		case 'set_window':
			return `Set window size to ${args.size}`;
		case 'clear_populations':
			return 'Clear selected populations';
		default:
			return `Unknown action: ${tool}`;
	}
};

export const runAction = async ({ tool, args }) => {
	const executor = ACTIONS[tool];
	if (!executor)
		throw new Error(`unknown action ${tool}`);
	return executor(args);
};
