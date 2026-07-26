import { getOptions } from '/apc/common.js';
import { getPopData, pairwiseSort } from '/browser/pops.js';

// Metrics available in the pairwise sort dropdown, all computed by pairwiseSort
const PAIRWISE_METRICS = ['time', 'Distance_from_Africa', 'genetic_distance', 'Temperature_index', 'Precipitation_index'];

const formatCell = value => {
	if (value === undefined || value === null || (typeof value === 'number' && isNaN(value)))
		return '';
	if (Array.isArray(value))
		return value.join(',');
	return String(value).replace(/[\t\r\n]+/g, ' ');
};

const unionColumns = rows => rows.reduce((columns, row) => columns.concat(Object.keys(row).filter(key => !columns.includes(key))), []);

const downloadTSV = (filename, columns, rows) => {
	const lines = [columns.join('\t')].concat(rows.map(row => columns.map(column => formatCell(row[column])).join('\t')));
	const url = URL.createObjectURL(new Blob([lines.join('\n') + '\n'], {type: 'text/tab-separated-values'}));
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Document order puts pinned tracks (moved to the annotation container) above the rest, matching what is on screen
const visibleTracks = () => Array.from(document.querySelectorAll('[data-module="track"][data-type="signal"]'));

const trackPopulations = track => track.dataset.population.split(';');

// A pinned track is a second copy of a signal track, so the same population can be on screen twice
const dedupeTracks = tracks => {
	const seen = new Set();
	return tracks.filter(track => !seen.has(track.dataset.population) && seen.add(track.dataset.population));
};

export const isPairwiseView = () => visibleTracks().some(track => trackPopulations(track).length > 1);

const populationRows = tracks => Promise.all(tracks.map(async track => {
	const { subset, label, ...metadata } = await getPopData(track.dataset.population);
	return Object.assign({pop: label, samples: (subset || []).length}, metadata);
}));

const pairRows = tracks => Promise.all(tracks.map(async track => {
	const labels = trackPopulations(track);
	const [pop1, pop2] = await Promise.all(labels.map(getPopData));
	const metrics = Object.fromEntries(PAIRWISE_METRICS.map(metric => [metric, pairwiseSort(pop1, pop2, metric)]));
	return Object.assign({pop_pair: track.dataset.population, pop1: labels[0], pop2: labels[1]}, metrics);
}));

export const exportMetadata = async () => {
	const tracks = dedupeTracks(visibleTracks());
	if (tracks.length === 0)
		return false;
	const pairwise = isPairwiseView();
	const rows = await (pairwise ? pairRows(tracks) : populationRows(tracks));
	downloadTSV(`delphi_${pairwise ? 'population_pairs' : 'populations'}.tsv`, unionColumns(rows), rows);
	return true;
};

export const exportPositionalData = () => {
	const options = getOptions();
	const tracks = dedupeTracks(visibleTracks().filter(track => Array.isArray(track.signal_bins)));
	if (tracks.length === 0)
		return false;
	const columns = ['position'];
	const rows = new Map();
	for (const track of tracks) {
		const column = track.dataset.population;
		columns.push(column);
		for (const bin of track.signal_bins) {
			if (!rows.has(bin.start))
				rows.set(bin.start, {position: bin.start});
			const value = bin.value;
			rows.get(bin.start)[column] = (value === null || value === undefined || isNaN(value)) ? null : +value.toPrecision(6);
		}
	}
	const sorted_rows = Array.from(rows.keys()).sort((a, b) => a - b).map(position => rows.get(position));
	downloadTSV(`delphi_${options.measure}_${options.chr}_${options.start}-${options.end}.tsv`, columns, sorted_rows);
	return true;
};
