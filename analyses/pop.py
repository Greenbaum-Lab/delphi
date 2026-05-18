import math
import numpy as np
import pandas as pd
from br_wrapper import read_bed


def _mean_pairwise_difference_biallelic(ac, an):
	'''
	Mean pairwise difference for biallelic variants.
	For each variant: 2 * p * q * n / (n - 1) where p, q are allele frequencies.
	'''
	with np.errstate(divide='ignore', invalid='ignore'):
		p = ac / an
		q = 1 - p
		mpd = 2 * p * q * an / (an - 1)
	mpd = np.where(an < 2, 0, mpd)
	return mpd


def _tajimas_d(genotypes, min_sites=3):
	'''
	Calculate Tajima's D for biallelic genotypes.
	
	genotypes: 2D array, shape (n_samples, n_variants), values in [0, 1, 2] or NaN
	min_sites: minimum segregating sites required
	
	Returns float or np.nan
	'''
	valid_mask = ~np.isnan(genotypes)
	an_per_variant = (2 * valid_mask.sum(axis=0)).astype(float)
	ac_per_variant = np.nansum(genotypes, axis=0)
	
	is_segregating = (ac_per_variant > 0) & (ac_per_variant < an_per_variant)
	S = np.sum(is_segregating)
	
	if S < min_sites:
		return np.nan
	
	n = int(an_per_variant.max())
	if n < 2:
		return np.nan
	
	a1 = np.sum(1.0 / np.arange(1, n))
	a2 = np.sum(1.0 / (np.arange(1, n) ** 2))
	
	theta_hat_w_abs = S / a1
	
	mpd = _mean_pairwise_difference_biallelic(ac_per_variant, an_per_variant)
	theta_hat_pi_abs = np.sum(mpd)
	
	d = theta_hat_pi_abs - theta_hat_w_abs
	
	b1 = (n + 1) / (3 * (n - 1))
	b2 = 2 * (n ** 2 + n + 3) / (9 * n * (n - 1))
	c1 = b1 - (1 / a1)
	c2 = b2 - ((n + 2) / (a1 * n)) + (a2 / (a1 ** 2))
	e1 = c1 / a1
	e2 = c2 / (a1 ** 2 + a2)
	d_stdev = np.sqrt((e1 * S) + (e2 * S * (S - 1)))
	
	if d_stdev == 0:
		return np.nan
	
	return d / d_stdev


def _fu_li_f_star(genotypes, min_sites=3):
	'''
	Calculate Fu & Li's F* (without outgroup) for biallelic genotypes.
	
	genotypes: 2D array, shape (n_samples, n_variants), values in [0, 1, 2] or NaN
	min_sites: minimum segregating sites required
	
	Returns float or np.nan
	'''
	valid_mask = ~np.isnan(genotypes)
	an_per_variant = (2 * valid_mask.sum(axis=0)).astype(float)
	ac_per_variant = np.nansum(genotypes, axis=0)
	
	is_segregating = (ac_per_variant > 0) & (ac_per_variant < an_per_variant)
	S = np.sum(is_segregating)
	
	if S < min_sites:
		return np.nan
	
	n = int(an_per_variant.max())
	if n <= 3:
		return np.nan
	
	minor_ac = np.minimum(ac_per_variant, an_per_variant - ac_per_variant)
	eta_s = np.sum(minor_ac == 1)
	
	mpd = _mean_pairwise_difference_biallelic(ac_per_variant, an_per_variant)
	pi = np.sum(mpd)
	
	a_n = np.sum(1.0 / np.arange(1, n))
	b_n = np.sum(1.0 / (np.arange(1, n) ** 2))
	a_n_plus_1 = a_n + 1.0 / n
	
	c_n = (n + 1) / (3 * (n - 1)) - 1 / a_n
	
	d_n = (
		c_n
		+ (n - 2) / ((n - 1) ** 2)
		+ (2 / (n - 1)) * (1.5 - (2 * a_n_plus_1 - 3) / (n - 2) - 1 / n)
	)
	
	v_f_star = (
		d_n
		+ 2 * (n ** 2 + n + 3) / (9 * n * (n - 1))
		- (2 / (n - 1)) * (4 * b_n - 6 + 8 / n)
	) / (a_n ** 2 + b_n)
	
	u_f_star = (
		n / (n - 1)
		+ (n + 1) / (3 * (n - 1))
		- 4 / (n * (n - 1))
		+ 2 * (n + 1) / ((n - 1) ** 2) * (a_n_plus_1 - 2 * n / (n + 1))
	) / a_n - v_f_star
	
	numerator = pi - ((n - 1) / n) * eta_s
	denominator = np.sqrt(u_f_star * S + v_f_star * S ** 2)
	
	if denominator == 0:
		return np.nan
	
	return numerator / denominator


def _compute_window_stats(genotypes, positions, window_size, region_start, region_end):
	'''
	Compute heterozygosity, Tajima's D, and Fu & Li's F* for each window.
	
	genotypes: 2D array, shape (n_samples, n_variants)
	positions: 1D array of variant positions
	window_size: int
	region_start, region_end: int
	
	Returns list of lists: [[het_exp, tajimasd, fulif, ac, an, het_obs], ...]
	'''
	positions = np.asarray(positions)
	num_windows = int(np.ceil((region_end - region_start) / window_size))
	
	bins = np.arange(region_start, region_start + (num_windows + 1) * window_size, window_size)
	bin_indices = np.digitize(positions, bins) - 1
	
	combined_stats = []
	
	for w in range(num_windows):
		mask = bin_indices == w
		
		if not np.any(mask):
			combined_stats.append([None, None, None, None, None, None])
			continue
		
		window_genotypes = genotypes[:, mask]
		
		valid_mask = ~np.isnan(window_genotypes)
		an = (2 * valid_mask.sum(axis=0)).astype(float)
		ac = np.nansum(window_genotypes, axis=0)
		
		window_ac = float(np.sum(ac))
		window_an = float(np.sum(an))
		
		with np.errstate(divide='ignore', invalid='ignore'):
			af = ac / an
			het_exp_per_variant = 2 * af * (1 - af)
		het_exp_per_variant = np.where(an == 0, np.nan, het_exp_per_variant)
		
		valid_het_exp = het_exp_per_variant[~np.isnan(het_exp_per_variant)]
		het_exp_value = float(np.mean(valid_het_exp)) if len(valid_het_exp) > 0 else None
		
		n_het = np.sum(window_genotypes == 1)
		n_called = np.sum(~np.isnan(window_genotypes))
		het_obs_value = float(n_het / n_called) if n_called > 0 else None
		
		td_value = _tajimas_d(window_genotypes)
		td_value = None if np.isnan(td_value) else float(td_value)
		
		fl_value = _fu_li_f_star(window_genotypes)
		fl_value = None if np.isnan(fl_value) else float(fl_value)
	
		combined_stats.append([het_exp_value, td_value, fl_value, window_ac, window_an, het_obs_value])

	return combined_stats

def region_signal(options):
	'''
	Compute expected heterozygosity, Tajima's D, and Fu & Li's F* for browser visualization (windowed).
	
	options
		'bed_files'		  : list[str]		  BED prefixes
		'subsets'			: list[dict]		 each with 'samples' (list[str])
		'params'['variants'] : list[dict]		 variant_ranges for br_wrapper
		'params'['window_size'] : int
	
	Returns list of tracks:
		[
			{'population': 'CEU', 'data': [...], 'window_size': 10000, ...},
			{'population': 'YRI', 'data': [...], 'window_size': 10000, ...},
			...
		]
	data is list of lists: [[het_exp, tajimasd, fulif, ac, an, het_obs], ...]
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
	window_size = options['params']['window_size']
	region = options['params']['variants'][0]
	region_start, region_end = region['start'], region['end']
	
	if genotype_df.empty:
		num_windows = int(np.ceil((region_end - region_start) / window_size))
		empty_data = [[None, None, None, None, None, None]] * num_windows
		tracks = []
		for subset in options['subsets']:
			tracks.append({
				'population': subset['label'],
				'window_size': window_size,
				'chr': region['chr'],
				'start': region_start,
				'end': region_end,
				'data': empty_data
			})
		return tracks
	
	tracks = []
	for subset in options['subsets']:
		population = subset['label']
		sids = subset['samples']
		sub_df = genotype_df.loc[sids]
		genotypes = sub_df.to_numpy(dtype=float)
		
		combined_stats = _compute_window_stats(
 			genotypes,
 			positions,
 			window_size,
 			region_start,
 			region_end
 		)

		tracks.append({
			'population': population,
			'window_size': window_size,
			'chr': region['chr'],
			'start': region_start,
			'end': region_end,
			'data': combined_stats
		})
	
	return tracks
