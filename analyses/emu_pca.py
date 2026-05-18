import os
import uuid
import subprocess
import shutil
import numpy as np
import pandas as pd
from pathlib import Path
from br_wrapper import read_bed, write_bed


def _clean_temp(prefix_path, extensions):
	for ext in extensions:
		try:
			(prefix_path.with_suffix(ext)).unlink()
		except FileNotFoundError:
			pass


def run_analysis(options):
	'''
	EMU PCA

	required in options
		'bed_files'          : list[str]
		'subsets'            : list[dict]   each with 'samples'
		'params' : { 'variants': list[dict] }
	optional
		'threads'            : int          CPU threads for EMU
	returns
		{'subsets':[{'values':[[pc1,pc2],...], 'samples':int}, ...]}
	'''
	import os
	import numpy as np
	import pandas as pd
	from math import ceil
	from emu import functions, shared

	subsets = options['subsets']
	variant_spec = options['params']['variants']
	threads = int(options.get('threads', 1))

	all_ids = np.concatenate([s['samples'] for s in subsets])
	bounds = np.cumsum([0] + [len(s['samples']) for s in subsets])

	if all_ids.size == 0:
		return {'subsets': [{'values': [], 'samples': 0} for _ in subsets]}

	genotype_df = read_bed(options['bed_files'], all_ids, variant_spec)

	missing_threshold = float(options['params'].get('missing_threshold', 0.50))
	maf_threshold = float(options['params'].get('maf_threshold', 0.01))

	missing_pass = genotype_df.isna().mean() <= missing_threshold

	allele_freq = genotype_df.mean(skipna=True) / 2
	maf = np.minimum(allele_freq, 1 - allele_freq)
	maf_pass = maf >= maf_threshold

	variants_pass = missing_pass & maf_pass & maf.notna()
	genotype_df = genotype_df.loc[:, variants_pass]

	if genotype_df.shape[1] == 0:
		return {'subsets': [{'values': [], 'samples': len(s['samples'])} for s in subsets]}

	os.environ['MKL_NUM_THREADS'] = str(threads)
	os.environ['MKL_MAX_THREADS'] = str(threads)
	os.environ['OMP_NUM_THREADS'] = str(threads)
	os.environ['OMP_MAX_THREADS'] = str(threads)
	os.environ['NUMEXPR_NUM_THREADS'] = str(threads)
	os.environ['NUMEXPR_MAX_THREADS'] = str(threads)
	os.environ['OPENBLAS_NUM_THREADS'] = str(threads)
	os.environ['OPENBLAS_MAX_THREADS'] = str(threads)

	N, M = genotype_df.shape
	X = np.ascontiguousarray(genotype_df.T.fillna(9).to_numpy(dtype=np.uint8, copy=True), dtype=np.uint8)
	sample_index = genotype_df.index.copy()
	del genotype_df

	G = np.zeros((M, ceil(N/4)), dtype=np.uint8)
	shared.condenseGeno(G, X)
	del X

	E = np.zeros((M, N), dtype=np.float32)
	f_array = np.zeros(M, dtype=np.float32)
	d_array = np.zeros(M, dtype=np.float32)
	n_array = np.zeros(M, dtype=np.uint32)
	shared.estimateF(G, f_array, d_array, n_array, N)

	rng = np.random.default_rng(42)
	run_params = {
		'iter': 100,
		'tole': 5e-7,
		'batch': 8192,
		'power': 10
	}

	U, S, V, iterations, converged = functions.emuAlgorithm(
		G,
		E,
		f_array,
		d_array,
		M,
		N,
		2,
		2,
		rng,
		run_params
	)

	sample_values = pd.DataFrame(V, columns=['PC1', 'PC2'], index=sample_index)

	subset_out = []
	for i in range(len(subsets)):
		start, stop = bounds[i:i + 2]
		subset_out.append({'value': np.mean(sample_values.iloc[start:stop].to_numpy(), axis=0).tolist(), 'samples': int(stop - start)})

	return {'subsets': subset_out, 'metadata': sample_values.to_dict()}


def PCA_2D(options, results):
	'''
	PC1 vs PC2 scatter, color-coded by polygon or cluster.
	Returns a DataFrame indexed by sample_id with columns: group, year, PC1, PC2.
	'''
	import numpy as np
	import pandas as pd
	import matplotlib.pyplot as plt

	alpha_val = 0.5
	subsets_meta = options['subsets']
	polygons = options['cohort']['polygons']

	samples_df = pd.DataFrame(results[0]['metadata']).copy()

	if 'polygon' in subsets_meta[0]:
		group_key = 'polygon'
	elif 'cluster' in subsets_meta[0]:
		group_key = 'cluster'
	else:
		group_key = None

	samples_df['group'] = None
	samples_df['color'] = np.nan

	color_cycle = plt.get_cmap('tab10')
	color_dict = {}
	legend_info = {}

	if group_key is not None:
		subsets_df = pd.DataFrame(subsets_meta)
		grouped_samples = subsets_df.groupby(group_key)['samples'].sum()
		for idx, (group_id, sample_ids) in enumerate(grouped_samples.items()):
			if group_key == 'polygon' and group_id in polygons:
				color_val = np.array(list(map(int, polygons[group_id]['color'].split(',')))) / 255.0
				label_val = polygons[group_id]['label']
			else:
				color_val = color_cycle(idx % 10)
				label_val = str(group_id)
			color_dict[group_id] = color_val
			legend_info[group_id] = (color_val, label_val)
			samples_df.loc[sample_ids, 'group'] = group_id
		samples_df['color'] = samples_df['group'].map(color_dict)

	if samples_df['color'].isna().any():
		default_color = color_cycle(len(color_dict) % 10)
		samples_df.loc[samples_df['color'].isna(), 'color'] = default_color

	samples_df['year'] = samples_metadata.loc[samples_df.index, 'date']

	fig, ax = plt.subplots(figsize=(8, 8 / aspect_ratio))
	ax.set_xlabel('PC1', fontsize=14)
	ax.set_ylabel('PC2', fontsize=14)
	ax.scatter(samples_df['PC1'], samples_df['PC2'], color=samples_df['color'], alpha=alpha_val)

	for col_val, lab_val in legend_info.values():
		ax.scatter([], [], color=col_val, alpha=alpha_val, label=lab_val)

	ax.legend(fontsize=12, frameon=False)
	ax.spines['top'].set_visible(False)
	ax.spines['right'].set_visible(False)
	plt.tight_layout()
	plt.show()

	return samples_df[['group', 'year', 'PC1', 'PC2']].rename_axis('sample_id').reset_index()


def Temporal_PCA(options, results):
	'''
	Change in PC1 over time
	Returns a DataFrame indexed by sample_id with columns: group, year, PC1, PC2.
	'''
	import numpy as np
	import pandas as pd
	import matplotlib.pyplot as plt

	alpha_val = 0.5
	subsets_meta = options['subsets']
	polygons = options['cohort']['polygons']

	samples_df = pd.DataFrame(results[0]['metadata']).copy()

	if 'polygon' in subsets_meta[0]:
		group_key = 'polygon'
	elif 'cluster' in subsets_meta[0]:
		group_key = 'cluster'
	else:
		group_key = None

	samples_df['group'] = None
	samples_df['color'] = np.nan

	color_cycle = plt.get_cmap('tab10')
	color_dict = {}
	legend_info = {}

	if group_key is not None:
		subsets_df = pd.DataFrame(subsets_meta)
		grouped_samples = subsets_df.groupby(group_key)['samples'].sum()
		for idx, (group_id, sample_ids) in enumerate(grouped_samples.items()):
			if group_key == 'polygon' and group_id in polygons:
				color_val = np.array(list(map(int, polygons[group_id]['color'].split(',')))) / 255.0
				label_val = polygons[group_id]['label']
			else:
				color_val = color_cycle(idx % 10)
				label_val = str(group_id)
			color_dict[group_id] = color_val
			legend_info[group_id] = (color_val, label_val)
			samples_df.loc[sample_ids, 'group'] = group_id
		samples_df['color'] = samples_df['group'].map(color_dict)

	if samples_df['color'].isna().any():
		default_color = color_cycle(len(color_dict) % 10)
		samples_df.loc[samples_df['color'].isna(), 'color'] = default_color

	samples_df['year'] = samples_metadata.loc[samples_df.index, 'date']

	fig, ax = plt.subplots(figsize=(8, 8 / aspect_ratio))
	ax.set_xlabel('Years before present', fontsize=14)
	ax.set_ylabel('PC1', fontsize=14)
	ax.scatter(samples_df['year'], samples_df['PC1'], color=samples_df['color'], alpha=alpha_val)

	for col_val, lab_val in legend_info.values():
		ax.scatter([], [], color=col_val, alpha=alpha_val, label=lab_val)

	ax.legend(fontsize=12, frameon=False)
	ax.spines['top'].set_visible(False)
	ax.spines['right'].set_visible(False)
	plt.tight_layout()
	plt.show()

	return samples_df[['group', 'year', 'PC1', 'PC2']].rename_axis('sample_id').reset_index()
