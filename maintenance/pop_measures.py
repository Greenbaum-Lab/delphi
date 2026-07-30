'''
Windowed population statistics: expected heterozygosity, Tajima's D, Fu and Li's
F*, and the allele count / allele number / observed heterozygote sums that the
browser needs to derive pairwise FST.

Ported from the fast_fst reference implementation (fast_fst/pop_measures.py),
which stays authoritative for the statistics themselves. The only change is the
array backend: CuPy is used when it is importable and NumPy otherwise, through
the module returned by get_array_module. Both backends evaluate the same
expressions, so a host without a GPU produces the same tables more slowly.
'''

import numpy as np

try:
	import cupy
	array_module = cupy
except ImportError:
	array_module = np


def get_array_module():
	'''Return the array module currently in use, CuPy when available and NumPy otherwise.'''
	return array_module


def use_numpy():
	'''Force the NumPy backend, for hosts without a GPU and for comparing the two paths.'''
	global array_module
	array_module = np


def mean_pairwise_difference_biallelic(ac, an):
	'''
	Mean pairwise difference for biallelic variants.
	For each variant: 2 * p * q * n / (n - 1) where p, q are allele frequencies.
	'''
	xp = array_module
	with np.errstate(divide='ignore', invalid='ignore'):
		p = xp.where(an > 0, ac / an, 0.0)
		q = 1.0 - p
		mpd = xp.where(an >= 2, 2.0 * p * q * an / (an - 1.0), 0.0)
	return mpd


def tajimas_d(ac, an, het_obs, min_sites=3):
	'''
	Calculate Tajima D for biallelic genotypes.

	ac: allele count array (n_variants,)
	an: allele number array (n_variants,)
	het_obs: observed heterozygotes count (n_variants,)
	min_sites: minimum segregating sites required

	Returns float or np.nan
	'''
	is_segregating = (ac > 0) & (ac < an) & (an > 0)
	S = int(is_segregating.sum())

	if S < min_sites:
		return np.nan

	n = int(an.max())
	if n < 2:
		return np.nan

	a1 = np.sum(1.0 / np.arange(1, n))
	a2 = np.sum(1.0 / (np.arange(1, n) ** 2))

	theta_hat_w_abs = S / a1

	mpd = mean_pairwise_difference_biallelic(ac, an)
	theta_hat_pi_abs = float(mpd.sum())

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


def fu_li_f_star(ac, an, min_sites=3):
	'''
	Calculate Fu and Li F* (without outgroup) for biallelic genotypes.

	ac: allele count array (n_variants,)
	an: allele number array (n_variants,)
	min_sites: minimum segregating sites required

	Returns float or np.nan
	'''
	xp = array_module
	is_segregating = (ac > 0) & (ac < an) & (an > 0)
	S = int(is_segregating.sum())

	if S < min_sites:
		return np.nan

	n = int(an.max())
	if n <= 3:
		return np.nan

	minor_ac = xp.minimum(ac, an - ac)
	eta_s = int((minor_ac == 1).sum())

	mpd = mean_pairwise_difference_biallelic(ac, an)
	pi = float(mpd.sum())

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


def compute_pop_stats_for_window(genotypes, pop_idx):
	'''
	Compute population statistics for the variants of a single window or annotation element.

	genotypes: (n_samples, n_variants) int8 array holding this window only
	pop_idx: array of sample indices for this population

	Returns tuple: (heterozygosity, tajimasd, fulif, ac_sum, an_sum, het_obs_sum)
	First 3 as float32 (NaN if not computable), last 3 as float32 sums. The last
	three are sums over the whole window, not per-variant means, which is what
	the browser's FST expects.
	'''
	xp = array_module
	sub = genotypes[pop_idx]
	called = sub != -127
	an = 2.0 * called.sum(axis=0)
	ac = xp.where(called, sub, 0).sum(axis=0)
	het_obs = (sub == 1).sum(axis=0)

	ac_sum = float(ac.sum())
	an_sum = float(an.sum())
	het_obs_sum = float(het_obs.sum())

	with np.errstate(divide='ignore', invalid='ignore'):
		af = xp.where(an > 0, ac / an, 0.0)
		het_per_variant = 2.0 * af * (1.0 - af)
	het_per_variant = xp.where(an > 0, het_per_variant, xp.nan)

	valid_het_mask = ~xp.isnan(het_per_variant)
	valid_het_count = int(valid_het_mask.sum())
	if valid_het_count > 0:
		heterozygosity = float(het_per_variant[valid_het_mask].mean())
	else:
		heterozygosity = np.nan

	tajimasd = tajimas_d(ac, an, het_obs)
	fulif = fu_li_f_star(ac, an)

	return np.float32(heterozygosity), np.float32(tajimasd), np.float32(fulif), np.float32(ac_sum), np.float32(an_sum), np.float32(het_obs_sum)


def compute_pop_stats_for_block(genotypes, pop_arrays, pop_labels, positions, window_size, last_window):
	'''
	Compute population statistics for all populations for complete windows in a block.

	genotypes: (n_samples, n_variants) int8 array
	pop_arrays: list of arrays with sample indices per population
	pop_labels: list of population label strings
	positions: NumPy array of variant positions
	window_size: int
	last_window: int, end position of last processed window (0 on first call)

	Returns tuple: (results, snp_counts, new_last_window)
	results: dict keyed by population label, values are dicts keyed by window_idx
	         with values (het, tajimasd, fulif, ac_sum, an_sum, het_obs_sum)
	snp_counts: dict keyed by window_idx with SNP count per window
	new_last_window: int, start position of next window to process
	'''
	xp = array_module
	first_window_start = last_window
	last_pos = positions[-1] if len(positions) > 0 else 0
	last_complete_window_start = (last_pos // window_size) * window_size

	first_pos = positions[0] if len(positions) > 0 else 0
	first_window_in_block = (first_pos // window_size) * window_size

	if last_complete_window_start < first_window_in_block:
		return {label: {} for label in pop_labels}, {}, last_window

	results = {label: {} for label in pop_labels}
	snp_counts = {}

	pos_cp = xp.asarray(positions, dtype=xp.int32)
	window_indices = pos_cp // window_size

	window_start = max(first_window_start, first_window_in_block)
	while window_start <= last_complete_window_start:
		window_idx = window_start // window_size
		mask = window_indices == window_idx
		snp_count = int(xp.count_nonzero(mask))
		snp_counts[window_idx] = np.int32(snp_count)

		if snp_count > 0:
			window_genotypes = genotypes[:, mask]
			for pop_id, pop_idx in enumerate(pop_arrays):
				label = pop_labels[pop_id]
				results[label][window_idx] = compute_pop_stats_for_window(window_genotypes, pop_idx)
		else:
			for label in pop_labels:
				results[label][window_idx] = (np.float32(np.nan), np.float32(np.nan), np.float32(np.nan), np.float32(0), np.float32(0), np.float32(0))

		window_start += window_size

	new_last_window = last_complete_window_start + window_size
	return results, snp_counts, new_last_window
