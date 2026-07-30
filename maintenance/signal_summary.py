'''
Reference statistics for pregenerated signal tables.

The browser draws a mean line and a 95 percent interval on each track. For a
pregenerated population those come from here: the mean and the 2.5th and 97.5th
percentiles of every generated row of that population, taken over measured rows
only, so windows without coverage do not pull the interval towards zero.

Written as percentiles.json beside the tables it summarises, keyed by the same
file stem the browser builds its table URL from.
'''

import json
import pathlib
import numpy as np

MEASURE_COLUMNS = {'heterozygosity': 0, 'tajimasd': 1, 'fulif': 2}
INTERVAL_PERCENTILES = [2.5, 97.5]
SUMMARY_FILE = 'percentiles.json'


def summarise_column(values):
	'''Mean, 95 percent interval and measured row count for one measure.'''
	measured = values[~np.isnan(values)]
	if measured.size == 0:
		return None
	lower, upper = np.percentile(measured, INTERVAL_PERCENTILES)
	return {
		'mean': round(float(measured.mean()), 6),
		'lower': round(float(lower), 6),
		'upper': round(float(upper), 6),
		'n': int(measured.size)
	}


def summarise_population(directory, file_name):
	'''Reference statistics across every table generated for one population.'''
	paths = sorted(directory.glob(f'{file_name}_chr*.npy'))
	if not paths:
		return None
	table = np.concatenate([np.load(path) for path in paths])
	summary = {measure: summarise_column(table[:, column]) for measure, column in MEASURE_COLUMNS.items()}
	return {measure: values for measure, values in summary.items() if values}


def write_summary(output_directory, file_names):
	'''Summarise every population in a directory, over all of its tables present.'''
	summary = {}
	for file_name in file_names:
		population_summary = summarise_population(output_directory, file_name)
		if population_summary:
			summary[file_name] = population_summary
	path = pathlib.Path(output_directory) / SUMMARY_FILE
	path.write_text(json.dumps(summary, indent=1, sort_keys=True), encoding='utf-8')
	return path
