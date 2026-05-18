import math
import numpy as np
import pandas as pd
from br_wrapper import read_bed


def run_analysis(options):
	'''
	options
		'bed_files'    : list[str]          prefixes passed to read_bed
		'subsets'      : list[dict]         each with key 'samples' (list[str])
		'variant_rsid' : str               single variant to extract
	'''

	sample_ids = np.concatenate([subset['samples'] for subset in options['subsets']])
	genotype_df = read_bed(
		options['bed_files'],
		sample_ids,
		options['params']['variants']
	)

	if genotype_df.empty:
		return {
			'subsets': [{'freq': 0.0, 'samples': 0} for _ in options['subsets']]
		}

	subset_results = []
	for subset in options['subsets']:
		sample_ids = subset['samples']
		if not sample_ids:
			subset_results.append({'freq': 0.0, 'samples': 0})
			continue

		genotype_series = genotype_df.loc[sample_ids, genotype_df.columns[0]]
		non_missing_count = genotype_series.notna().sum()
		if non_missing_count == 0:
			subset_results.append({'freq': 0.0, 'samples': 0})
			continue

		frequency = genotype_series.mean(skipna=True) / 2
		subset_results.append({
			'freq':   float(frequency),
			'samples': int(non_missing_count)
		})

	return {'subsets': subset_results, 'metadata': genotype_df.astype(object).where(pd.notnull(genotype_df), None).to_dict()}


def Line_plot__regions__(options, results):
	'''
	Draws frequency-vs-time lines and annotates each point with the sample
	count that produced it.

	options
		'subsets'  : list[dict]      order matches results['subsets']
		'polygons' : dict           key -> {'color': 'r,g,b', ...}

	results
		'subsets'  : list[dict]      output of run_analysis
	'''

	import numpy as np
	import pandas as pd
	import matplotlib.pyplot as plt

	subsets_options = pd.DataFrame(options['subsets'])
	subsets_results = pd.DataFrame(results[0]['subsets'])

	subsets_df = (
	    pd.concat([subsets_results,
	               subsets_options.drop(subsets_results.columns, axis=1, errors='ignore')],
	              axis=1)
	      [list(subsets_options.columns) +
	       subsets_results.columns.difference(subsets_options.columns).tolist()]
	)

	if 'polygon' in subsets_df.columns:
		group_key = 'polygon'
	elif 'cluster' in subsets_df.columns:
		group_key = 'cluster'
	else:
		group_key = None

	fig, ax = plt.subplots(figsize=(8,8/aspect_ratio))
	ax.set_xlabel('Years before present', fontsize=14)
	ax.set_ylabel('Frequency',  fontsize=14)
	ax.set_ylim([0, 1])
	ax.invert_xaxis()

	output_data = []
	color_palette = plt.get_cmap('tab10')

	if group_key:
		group_iterator = subsets_df.groupby(group_key)
	else:
		group_iterator = [(None, subsets_df)]

	for group_index, (group_name, group_frame) in enumerate(group_iterator):
		if group_key == 'polygon' and group_name in options['cohort']['polygons']:
			color = np.array(list(map(int, options['cohort']['polygons'][group_name]['color'].split(',')))) / 255.0
		else:
			color = color_palette(group_index % 10)

		years    = group_frame['year'].to_numpy()
		freqs    = group_frame['freq'].to_numpy()
		coverage = group_frame['samples'].to_numpy()
		valid    = coverage > 0

		label = options['cohort']['polygons'][group_name]['label'] if group_name is not None else 'all subsets'
		ax.plot(years[valid], freqs[valid], color=color, label=label)
		ax.scatter(years[valid], freqs[valid], color=color)

		output_data.append(np.column_stack([np.repeat(label, len(years)), years, freqs, coverage]))

	ax.spines['top'].set_visible(False)
	ax.spines['right'].set_visible(False)
	ax.legend(fontsize=12, frameon=False)
	plt.tight_layout()
	plt.show()

	output = pd.DataFrame(np.concatenate(output_data, axis=0), columns=['group', 'year', 'frequency', 'coverage'])

	return output


def Line_plot__sample_sizes__(options, results):
	'''
	Draws frequency-vs-time lines and annotates each point with the sample
	count that produced it.

	options
		'subsets'  : list[dict]      order matches results['subsets']
		'polygons' : dict           key -> {'color': 'r,g,b', ...}

	results
		'subsets'  : list[dict]      output of run_analysis
	'''

	import numpy as np
	import pandas as pd
	import matplotlib.pyplot as plt

	subsets_options = pd.DataFrame(options['subsets'])
	subsets_results = pd.DataFrame(results[0]['subsets'])

	subsets_df = (
	    pd.concat([subsets_results,
	               subsets_options.drop(subsets_results.columns, axis=1, errors='ignore')],
	              axis=1)
	      [list(subsets_options.columns) +
	       subsets_results.columns.difference(subsets_options.columns).tolist()]
	)

	if 'polygon' in subsets_df.columns:
		group_key = 'polygon'
	elif 'cluster' in subsets_df.columns:
		group_key = 'cluster'
	else:
		group_key = None

	fig, ax = plt.subplots(figsize=(8,8/aspect_ratio))
	ax.set_xlabel('Years before present', fontsize=14)
	ax.set_ylabel('Frequency',  fontsize=14)
	ax.set_ylim([0, 1])
	ax.invert_xaxis()

	output_data = []
	color_palette = plt.get_cmap('tab10')

	if group_key:
		group_iterator = subsets_df.groupby(group_key)
	else:
		group_iterator = [(None, subsets_df)]

	for group_index, (group_name, group_frame) in enumerate(group_iterator):
		if group_key == 'polygon' and group_name in options['cohort']['polygons']:
			color = np.array(list(map(int, options['cohort']['polygons'][group_name]['color'].split(',')))) / 255.0
		else:
			color = color_palette(group_index % 10)

		years    = group_frame['year'].to_numpy()
		freqs    = group_frame['freq'].to_numpy()
		coverage = group_frame['samples'].to_numpy()
		valid    = coverage > 0

		label = options['cohort']['polygons'][group_name]['label'] if group_name is not None else 'all subsets'
		ax.plot(years[valid], freqs[valid], color=color, label=label)
		ax.scatter(years[valid], freqs[valid], color=color)

		if 'show_detail' in globals() and show_detail:
			for x_val, y_val, cov_val in zip(years, freqs, coverage):
				if cov_val:
					ax.annotate(str(cov_val), xy=(x_val, y_val), xytext=(0, 5),
						textcoords='offset points', fontsize=12, color=color)

		output_data.append(np.column_stack([np.repeat(label, len(years)), years, freqs, coverage]))

	ax.spines['top'].set_visible(False)
	ax.spines['right'].set_visible(False)
	ax.legend(fontsize=12, frameon=False)
	plt.tight_layout()
	plt.show()

	output = pd.DataFrame(np.concatenate(output_data, axis=0), columns=['group', 'year', 'frequency', 'coverage'])

	return output