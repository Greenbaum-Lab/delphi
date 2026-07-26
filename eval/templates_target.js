import { makeTask } from './task.js';
import { CLARIFY } from './schemas.js';

const POSITION_TARGETS = [
	{ chr: 'chr1', start: 1579501, end: 4200941 },
	{ chr: 'chr8', start: 1579501, end: 4200941 },
	{ chr: 'chr2', start: 500000, end: 900000 },
	{ chr: 'chr17', start: 41196312, end: 41277500 }
];

const UNIT_CASES = [
	{ utterance: 'go to chr1 from 2 Mb to 3 Mb', chr: 'chr1', start: 2000000, end: 3000000 },
	{ utterance: 'show chr8 between 1.5 Mb and 4.2 Mb', chr: 'chr8', start: 1500000, end: 4200000 },
	{ utterance: 'navigate to chr2 500 kb to 900 kb', chr: 'chr2', start: 500000, end: 900000 },
	{ utterance: 'take me to the first 250 kb of chr3', chr: 'chr3', start: 1, end: 250000 }
];

const MISSING_GENES = ['ZZZFAKE1', 'NOTAGENE', 'FOOBAR99'];
const MISSING_POPULATIONS = ['Atlantean', 'Mordorian', 'Wakandan'];

const withCommas = value => String(value).replace(/\B(?=([0-9]{3})+(?![0-9]))/g, ',');

const POSITION_PHRASINGS = [
	target => `go to ${target.chr}:${target.start}-${target.end}`,
	target => `navigate to ${target.chr} ${target.start} to ${target.end}`,
	target => `show ${target.chr}:${withCommas(target.start)}-${withCommas(target.end)}`,
	target => `move to chromosome ${target.chr.slice(3)} from ${target.start} to ${target.end}`,
	target => `region ${target.start}-${target.end} on ${target.chr}`
];

const GENE_PHRASINGS = [
	gene_name => `go to ${gene_name}`,
	gene_name => `show me the ${gene_name} gene`,
	gene_name => `find ${gene_name}`,
	gene_name => `navigate to gene ${gene_name}`,
	gene_name => `go to ${gene_name.toLowerCase()}`,
	gene_name => `show me ${gene_name}.`
];

const POPULATION_PHRASINGS = [
	population_label => `add the ${population_label} population`,
	population_label => `select ${population_label}`,
	population_label => `include ${population_label}`,
	population_label => `add ${population_label.toLowerCase()}`
];

const POSITION_COMPARATORS = { chr: 'exact', start: 'integer', end: 'integer' };

const positionTasks = fixture => POSITION_TARGETS.flatMap(target => POSITION_PHRASINGS.map((phrase, phrasing_index) => makeTask({
	task_type: 'T-extract-position',
	schema_name: 'navigate',
	fixture,
	template_id: `position.${target.chr}`,
	phrasing_index,
	utterance: phrase(target),
	expected: { action: 'navigate', chr: target.chr, start: target.start, end: target.end },
	comparators: POSITION_COMPARATORS,
	edge: false
})));

const inheritedChromosomeTasks = fixture => POSITION_TARGETS.map((target, phrasing_index) => makeTask({
	task_type: 'T-extract-position',
	schema_name: 'navigate',
	fixture,
	template_id: 'position.inherit_chr',
	phrasing_index,
	utterance: `go to ${target.start}-${target.end}`,
	expected: { action: 'navigate', chr: fixture.parsed_state.header.chr, start: target.start, end: target.end },
	comparators: POSITION_COMPARATORS,
	edge: true
}));

const reversedRangeTasks = fixture => POSITION_TARGETS.map((target, phrasing_index) => makeTask({
	task_type: 'T-extract-position',
	schema_name: 'navigate',
	fixture,
	template_id: 'position.reversed',
	phrasing_index,
	utterance: `go to ${target.chr}:${target.end}-${target.start}`,
	expected: { action: CLARIFY },
	comparators: {},
	edge: true
}));

const unitTasks = fixture => UNIT_CASES.map((unit_case, phrasing_index) => makeTask({
	task_type: 'T-extract-position',
	schema_name: 'navigate',
	fixture,
	template_id: 'position.units',
	phrasing_index,
	utterance: unit_case.utterance,
	expected: { action: 'navigate', chr: unit_case.chr, start: unit_case.start, end: unit_case.end },
	comparators: POSITION_COMPARATORS,
	edge: true
}));

const geneTasks = (fixture, catalogues) => catalogues.gene_targets.flatMap(gene_target => GENE_PHRASINGS.map((phrase, phrasing_index) => makeTask({
	task_type: 'T-select-gene',
	schema_name: 'select_gene',
	fixture,
	template_id: `gene.${gene_target.gene_name}`,
	phrasing_index,
	utterance: phrase(gene_target.gene_name),
	expected: { action: 'select_gene', gene_name: gene_target.gene_name },
	comparators: { gene_name: 'resolved_gene' },
	edge: phrasing_index >= 4
})));

const missingGeneTasks = fixture => MISSING_GENES.map((gene_name, phrasing_index) => makeTask({
	task_type: 'T-select-gene',
	schema_name: 'select_gene',
	fixture,
	template_id: 'gene.missing',
	phrasing_index,
	utterance: `go to the gene ${gene_name}`,
	expected: { action: CLARIFY },
	comparators: {},
	edge: true
}));

const populationTasks = (fixture, catalogues) => catalogues.population_targets.flatMap(population => POPULATION_PHRASINGS.map((phrase, phrasing_index) => makeTask({
	task_type: 'T-select-population',
	schema_name: 'select_population',
	fixture,
	template_id: `population.${population.label}`,
	phrasing_index,
	utterance: phrase(population.label),
	expected: { action: 'select_population', population_label: population.label },
	comparators: { population_label: 'resolved_population' },
	edge: phrasing_index === 3
})));

const missingPopulationTasks = fixture => MISSING_POPULATIONS.map((population_label, phrasing_index) => makeTask({
	task_type: 'T-select-population',
	schema_name: 'select_population',
	fixture,
	template_id: 'population.missing',
	phrasing_index,
	utterance: `add the ${population_label} population`,
	expected: { action: CLARIFY },
	comparators: {},
	edge: true
}));

export const TARGET_TEMPLATES = [
	positionTasks,
	inheritedChromosomeTasks,
	reversedRangeTasks,
	unitTasks,
	geneTasks,
	missingGeneTasks,
	populationTasks,
	missingPopulationTasks
];
