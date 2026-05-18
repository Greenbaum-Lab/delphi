import math
import numpy as np
import pandas as pd
from br_wrapper import read_bed, save_object_local


def run_analysis(options):
	'''
	Compute mean imputed heterozygosity per subset and return per-sample values as metadata.

	options
		'bed_files' : list[str]
		'subsets'   : list[dict] each with key 'samples'
		'params'    : dict
	returns
		{
			'subsets': [{'value': float, 'samples': int, 'variants': int}, ...],
			'metadata': {sample_id: float, ...}
		}
	'''
	import numpy as np
	import pandas as pd
	import json

	het_filename = save_object_local('public_new/imphet.tsv_wg_het.col')
	
	with open(het_filename, 'r') as f:
		het_dict = json.load(f)
	
	het_series = pd.Series(het_dict, dtype=float)

	all_sample_ids = np.concatenate([subset['samples'] for subset in options['subsets']])
	sample_values_series = het_series.reindex(all_sample_ids)

	subset_results = []
	for subset in options['subsets']:
		sample_ids_subset = subset['samples']
		if not sample_ids_subset:
			subset_results.append({'value': 0.0, 'samples': 0, 'variants': 0})
			continue

		subset_values = sample_values_series.reindex(sample_ids_subset).dropna()
		if subset_values.empty:
			subset_results.append({'value': 0.0, 'samples': 0, 'variants': 0})
			continue

		mean_value = float(np.mean(subset_values.values))
		subset_results.append({'value': mean_value, 'samples': int(subset_values.shape[0]), 'variants': 0})

	return {'subsets': subset_results, 'metadata': sample_values_series.astype(object).where(pd.notnull(sample_values_series), None).to_dict()}


def _bin_to_windows(positions, values, window_size, region_start, region_end):
	'''
	Aggregate per-SNP values into fixed-size windows.
	
	positions    : array of SNP positions
	values       : array of per-SNP values (same length as positions)
	window_size  : bin size in bases
	region_start : start coordinate of region
	region_end   : end coordinate of region
	
	Returns list of {start, end, value} dicts with mean value per window.
	'''
	if len(positions) == 0:
		return []
	
	window_edges = np.arange(region_start, region_end + window_size, window_size)
	bin_indices = np.digitize(positions, window_edges) - 1
    
	windows = []
	for i in range(len(window_edges) - 1):
		window_start = window_edges[i]
		window_end = min(window_edges[i + 1], region_end)
		if window_end <= window_start:
			break		
		mask = bin_indices == i
		mean_value = np.nanmean(values[mask])
		windows.append(float(mean_value) if not np.isnan(mean_value) else None) ## need to implement NaN -> null conversion for JSON
	return windows


def region_signal(options):
	'''
	Compute expected heterozygosity for browser visualization (windowed).
	
	options
		'bed_files'          : list[str]          BED prefixes
		'subsets'            : list[dict]         each with 'samples' (list[str])
		'params'['variants'] : list[dict]         variant_ranges for br_wrapper
		'params'['window_size'] : int
	
	Returns list of tracks:
		[{'track_id': 'het_0', 'data': [{start: int, end: int, value: float}, ...]}, ...]
	'''
	all_sample_ids = np.concatenate([subset['samples'] for subset in options['subsets']])
	genotype_df = read_bed(
		options['bed_files'],
		all_sample_ids,
		options['params']['variants'],
		2,
		'sample'
	)
	positions = genotype_df.columns
	window_size = 10000
	region = options['params']['variants'][0]
	region_start, region_end = region['start'], region['end']
	
	if genotype_df.empty:
		num_windows = int(np.ceil((region_end - region_start) / window_size))
		empty_data = [None] * num_windows
		return [
			{
				'track_id': f'het_{i}',
				'populations': [options['subsets'][i]['label']],
				'window_size': window_size,
				'chr': region['chr'],
				'start': region_start,
				'end': region_end,
				'data': empty_data
			}
			for i in range(len(options['subsets']))
		]
	
	tracks = []
	for i, subset in enumerate(options['subsets']):
		population = subset['label']
		sids = subset['samples']
		sub_df = genotype_df.loc[sids]
		
		ac  = sub_df.sum(axis=0, skipna=True).to_numpy(dtype=float)
		an  = (2 * sub_df.notna().sum(axis=0)).to_numpy(dtype=float)
		
		with np.errstate(divide='ignore', invalid='ignore'):
			af = ac / an
			het_per_variant = 2 * af * (1 - af)
		
		het_per_variant = np.where(an == 0, np.nan, het_per_variant)
		
		data = _bin_to_windows(
			positions,
			het_per_variant,
			window_size,
			region_start,
			region_end
		)
		tracks.append({
			'track_id': f'het_{i}',
			'populations': [population],
			'window_size': window_size,
			'chr': region['chr'],
			'start': region_start,
			'end': region_end,
			'data': data
		})
	
	return tracks


def Line_plot(options, results):
	'''
	Plot heterozygosity vs. time.

	options
		'subsets'   : list[dict]     order matches results['subsets']
		'cohort' : {'polygons': {polygon_id:{label,color}, …}}
		'show_detail' : bool        annotate sample counts if True

	results
		'subsets' : list[dict]      output of run_analysis
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
	ax.set_ylabel('Heterozygosity', fontsize=14)
	ax.invert_xaxis()

	output_data = []
	color_palette = plt.get_cmap('tab10')

	group_iter = subsets_df.groupby(group_key) if group_key else [(None, subsets_df)]
	for group_index, (group_name, frame) in enumerate(group_iter):
		if group_key == 'polygon' and group_name in options['cohort']['polygons']:
			rgb = options['cohort']['polygons'][group_name]['color']
			color = np.array(list(map(int, rgb.split(',')))) / 255.0
			label  = options['cohort']['polygons'][group_name]['label']
		else:
			color = color_palette(group_index % 10)
			label  = str(group_name) if group_name is not None else 'all subsets'

		years     = frame['year'].to_numpy()
		hetero    = frame['value'].to_numpy()
		coverage  = frame['samples'].to_numpy()
		valid     = coverage > 0

		ax.plot(years[valid], hetero[valid], color=color, label=label)
		ax.scatter(years[valid], hetero[valid], color=color)

		if 'show_detail' in globals() and show_detail:
			for x_val, y_val, cov_val in zip(years, hetero, coverage):
				if cov_val:
					ax.annotate(str(cov_val), xy=(x_val, y_val), xytext=(0, 5),
					             textcoords='offset points', fontsize=12, color=color)

		output_data.append(np.column_stack([np.repeat(label, len(years)), years, hetero, coverage]))

	y_max = np.ceil(ax.get_ylim()[1] * 20) / 20
	ax.set_ylim([0, y_max])
	ax.spines['top'].set_visible(False)
	ax.spines['right'].set_visible(False)
	ax.legend(fontsize=12, frameon=False)
	plt.tight_layout()
	plt.show()

	output = pd.DataFrame(np.concatenate(output_data, axis=0), columns=['group', 'year', 'heterozygosity', 'coverage'])

	return output

