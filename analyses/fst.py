import math
import time
import numpy as np
import pandas as pd
from br_wrapper import read_bed


def _compute_fst(an1, an2, ac1, ac2, het1, het2):
	'''
	Wright & Cockerham 1984 per-variant FST.
	Input arrays are 1-D, one value per variant.
	'''
	valid = (an1 > 2.0) & (an2 > 2.0)

	p1      = ac1 / an1
	p2      = ac2 / an2
	n1      = an1 / 2.0
	n2      = an2 / 2.0
	n_total = n1 + n2
	n_bar   = n_total / 2.0
	n_c     = n_total - (n1 * n1 + n2 * n2) / n_total

	ac_total = ac1 + ac2
	an_total = an1 + an2
	p_bar    = ac_total / an_total
	s2       = (n1 * (p1 - p_bar) ** 2 + n2 * (p2 - p_bar) ** 2) / n_bar
	h_bar    = (het1 + het2) / n_total

	a = (n_bar / n_c) * (s2 - h_bar / (4.0 * n_bar))
	b = (n_bar / (n_bar - 1.0)) * (
		p_bar * (1.0 - p_bar) - 0.5 * s2 - (2.0 * n_bar - 1.0) * h_bar / (4.0 * n_bar)
	)
	c = h_bar / 2.0
	denom = a + b + c

	fst = np.where(valid & (denom != 0.0), a / denom, np.nan)
	return np.maximum(0.0, fst)


def run_analysis(options):
	'''
	Compute mean W&C FST for every unordered pair of subsets.

	options
		'bed_files'          : list[str]          BED prefixes
		'subsets'            : list[dict]         each with 'samples' (list[str])
		'params'['variants'] : list[dict]         variant_ranges for br_wrapper
	'''

	all_sample_ids = np.concatenate([subset['samples'] for subset in options['subsets']])
	genotype_df = read_bed(
		options['bed_files'],
		all_sample_ids,
		options['params']['variants']
	)

	if genotype_df.empty:
		return {'pairs': []}

	allele_stats = []
	for subset in options['subsets']:
		sids = subset['samples']
		sub_df = genotype_df.loc[sids]

		ac   = sub_df.sum(axis=0, skipna=True).to_numpy(dtype=float)
		an   = (2 * sub_df.notna().sum(axis=0)).to_numpy(dtype=float)
		het  = (sub_df == 1).sum(axis=0, skipna=True).to_numpy(dtype=float)
		n_ok = sub_df.notna().any(axis=1).sum()

		allele_stats.append({'ac': ac, 'an': an, 'het': het, 'sample_n': int(n_ok)})

	pair_results = []
	for i in range(len(allele_stats)):
		for j in range(i + 1, len(allele_stats)):
			s1 = allele_stats[i]
			s2 = allele_stats[j]

			fst_per_variant = _compute_fst(
				s1['an'], s2['an'],
				s1['ac'], s2['ac'],
				s1['het'], s2['het']
			)
			mean_fst = np.nanmean(fst_per_variant)

			pair_results.append({
				'pair'    : [i, j],
				'value'   : 0.0 if math.isnan(mean_fst) else float(mean_fst),
				'samples' : [s1['sample_n'], s2['sample_n']],
				'variants': int(np.count_nonzero(~np.isnan(fst_per_variant)))
			})

	return {'pairs': pair_results}


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
		windows.append(float(mean_value) if not np.isnan(mean_value) else None)
	return windows


def region_signal(options):
	'''
	Compute FST for browser visualization (per-SNP or windowed).
	
	options
		'bed_files'          : list[str]          BED prefixes
		'subsets'            : list[dict]         each with 'samples' (list[str])
		'params'['variants'] : list[dict]         variant_ranges for br_wrapper
		'params'['window_size'] : int
	
	Returns list of tracks:
		[{'track_id': 'fst_0_1', 'data': [{position: int, value: float}, ...]}, ...]
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
				'track_id': f'fst_{i}_{j}',
				'populations': [options['subsets'][i]['label'], options['subsets'][j]['label']],
				'window_size': window_size,
				'chr': region['chr'],
				'start': region_start,
				'end': region_end,
				'data': empty_data
			}
			for i in range(len(options['subsets']))
			for j in range(i + 1, len(options['subsets']))
		]
	
	allele_stats = []
	for subset in options['subsets']:
		sids = subset['samples']
		sub_df = genotype_df.loc[sids]
		
		ac  = sub_df.sum(axis=0, skipna=True).to_numpy(dtype=float)
		an  = (2 * sub_df.notna().sum(axis=0)).to_numpy(dtype=float)
		het = (sub_df == 1).sum(axis=0, skipna=True).to_numpy(dtype=float)
		
		allele_stats.append({'ac': ac, 'an': an, 'het': het})
	
	tracks = []
	for i in range(len(options['subsets'])):
		for j in range(i + 1, len(options['subsets'])):
			populations = [options['subsets'][i]['label'], options['subsets'][j]['label']]
			s1 = allele_stats[i]
			s2 = allele_stats[j]
			fst_per_variant = _compute_fst(
				s1['an'], s2['an'],
				s1['ac'], s2['ac'],
				s1['het'], s2['het']
			)
			
			data = _bin_to_windows(
				positions,
				fst_per_variant,
				window_size,
				region_start,
				region_end
			)
			tracks.append({
				'track_id': f'fst_{i}_{j}',
				'populations': populations,
				'window_size': window_size,
				'chr': region['chr'],
				'start': region_start,
				'end': region_end,
				'data': data
			})
	return tracks


def Pairwise_Fst_Regions(options, results):
	'''
	Line plot of Hudson/W-C FST between every **pair of polygons**
	across the temporal positions stored in the submitted subsets.

	options
		'subsets'    : list[dict]   (each with 'x' and 'polygon')
		'cohort'  : {'polygons': {polygon_id:{label,color}}}
		'show_detail': bool

	results
		'pairs' : list[dict]       {'pair':[i,j], 'value':float,
		                            'samples':[n_i,n_j], 'variants':int}
	'''
	import numpy as np
	import matplotlib.pyplot as plt
	import math

	subsets = options['subsets']
	pair_records = {frozenset(rec['pair']): rec for rec in results[0]['pairs']}

	series_by_pair = {}
	for rec_key, rec in pair_records.items():
		i, j           = tuple(rec_key)
		sub_i, sub_j   = subsets[i], subsets[j]
		if sub_i['year'] != sub_j['year']:
			continue
		pol_i, pol_j = sub_i.get('polygon'), sub_j.get('polygon')
		if pol_i is None or pol_j is None or pol_i == pol_j:
			continue
		pair_key = tuple(sorted((pol_i, pol_j)))
		entry = series_by_pair.setdefault(pair_key, {
			'year'      : [],
			'fst'    : [],
			'samples': [],
		})
		entry['year'].append(sub_i['year'])
		entry['fst'].append(rec['value'])
		entry['samples'].append(rec['samples'])

	output_data = []

	fig, ax = plt.subplots(figsize=(8,8/aspect_ratio))
	ax.set_xlabel('Years before present', fontsize=14)
	ax.set_ylabel('$F_{ST}$',        fontsize=14)
	ax.set_prop_cycle(color=plt.cm.Dark2.colors)
	ax.invert_xaxis()

	for idx, ((pol_a, pol_b), data) in enumerate(series_by_pair.items()):
		order = np.argsort(data['year'])
		years   = np.array(data['year'])[order]
		fst = np.array(data['fst'])[order]
		coverage = np.array(data['samples'])[order]

		label_a = options['cohort']['polygons'][pol_a]['label']
		label_b = options['cohort']['polygons'][pol_b]['label']
		label   = f'{label_a}-{label_b}'

		ax.plot(years, fst, label=label)
		ax.scatter(years, fst)

		if 'show_detail' in globals() and show_detail:
			for xi, yi, cov in zip(years, fst, coverage):
				if cov[0] > 1 and cov[1] > 1:
					ax.annotate(f'{cov[0]}/{cov[1]}',
					            xy=(xi, yi), xytext=(0, 5),
					            textcoords='offset points', fontsize=10)

		output_data.append(np.column_stack([np.repeat(label, len(years)), years, fst, [','.join([str(_c) for _c in c]) for c in coverage]]))

	y_max = math.ceil(ax.get_ylim()[1] * 10) / 10
	ax.set_ylim([0, y_max])
	ax.spines['top'].set_visible(False)
	ax.spines['right'].set_visible(False)
	ax.legend(fontsize=12, frameon=False)
	plt.tight_layout()
	plt.show()

	output = pd.DataFrame(np.concatenate(output_data, axis=0), columns=['comparison', 'year', 'fst', 'coverage'])

	return output


def Pairwise_Fst_Temporal(options, results):
	'''
	Plot FST between **consecutive temporal positions** within each polygon.
	'''
	import numpy as np
	import matplotlib.pyplot as plt
	import math

	subsets = options['subsets']
	pair_lookup = {frozenset(rec['pair']): rec for rec in results[0]['pairs']}

	polygon_map = {}
	for idx, sub in enumerate(subsets):
		pol = sub.get('polygon')
		if pol is None:
			continue
		polygon_map.setdefault(pol, []).append((sub['year'], idx))
	for pol in polygon_map:
		polygon_map[pol].sort(key=lambda t: t[0])

	output_data = []

	fig, ax = plt.subplots(figsize=(8,8/aspect_ratio))
	ax.set_xlabel('Years before present', fontsize=14)
	ax.set_ylabel('$F_{ST}$', fontsize=14)
	ax.invert_xaxis()

	for pol_idx, (pol_id, xlst) in enumerate(polygon_map.items()):
		x_vals, sub_idx = zip(*xlst)
		years = np.array(x_vals)
		
		fst = np.zeros(len(years), dtype=float)
		coverage = np.array([[0, 0]] * len(years))

		for pos, (a, b) in enumerate(zip(sub_idx[:-1], sub_idx[1:]), start=1):
			rec = pair_lookup.get(frozenset((a, b)))
			if rec:
				fst[pos] = rec['value']
				coverage[pos] = rec['samples']
	
		valid = np.all(coverage > 1, axis=1) | (fst == 0)

		color = np.array(list(map(int, options['cohort']['polygons'][pol_id]['color'].split(',')))) / 255.0
		label = options['cohort']['polygons'][pol_id]['label']

		ax.plot(years[valid], fst[valid], color=color, label=label)
		ax.scatter(years[valid], fst[valid], color=color)

		if 'show_detail' in globals() and show_detail:
			for xi, yi, cov in zip(years, fst, coverage):
				if cov[0] > 1 and cov[1] > 1:
					ax.annotate(f'{cov[0]}/{cov[1]}',
					            xy=(xi, yi), xytext=(0, 5),
					            textcoords='offset points', fontsize=10, color=color)

		output_data.append(np.column_stack([np.repeat(label, len(years)), years, fst, [','.join([str(_c) for _c in c]) for c in coverage]]))

	y_max = math.ceil(ax.get_ylim()[1] * 10) / 10
	ax.set_ylim([0, y_max])
	ax.legend(fontsize=12, frameon=False)
	ax.spines['top'].set_visible(False)
	ax.spines['right'].set_visible(False)
	plt.tight_layout()
	plt.show()

	output = pd.DataFrame(np.concatenate(output_data, axis=0), columns=['comparison', 'year', 'fst', 'coverage'])

	return output
