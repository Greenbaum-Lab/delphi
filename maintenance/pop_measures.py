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


MISSING_GENOTYPE = -127


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


def population_membership(pop_arrays, n_samples):
	'''
	One row per population, selecting its samples.

	Multiplying by this sums over a population's samples, so one operation does
	what a loop over populations did. Rosters may overlap, since a sample is
	free to appear in several rows.
	'''
	xp = array_module
	membership = xp.zeros((len(pop_arrays), n_samples), dtype=xp.float64)
	for row, pop_idx in enumerate(pop_arrays):
		membership[row, pop_idx] = 1.0
	return membership


def window_allele_counts(window_genotypes, membership):
	'''
	Allele count, allele number and heterozygote count per population per variant.

	Counts are small integers, exact in float64, so the products match summing
	each population on its own, and the dtypes are the ones a per population sum
	would have produced.
	'''
	xp = array_module
	called = window_genotypes != MISSING_GENOTYPE
	an = 2.0 * (membership @ called.astype(xp.float64))
	ac = (membership @ xp.where(called, window_genotypes, 0).astype(xp.float64)).astype(xp.int64)
	het_obs = (membership @ (window_genotypes == 1).astype(xp.float64)).astype(xp.int64)
	return ac, an, het_obs


def pop_stats_from_counts(ac, an, het_obs):
	'''
	Statistics of one population in one window, from its per variant counts.

	Returns tuple: (heterozygosity, tajimasd, fulif, ac_sum, an_sum, het_obs_sum)
	First 3 as float32 (NaN if not computable), last 3 as float32 sums. The last
	three are sums over the whole window, not per-variant means, which is what
	the browser's FST expects.
	'''
	xp = array_module
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


def compute_pop_stats_for_window(genotypes, pop_idx):
	'''
	Compute population statistics for the variants of a single window or annotation element.

	genotypes: (n_samples, n_variants) int8 array holding this window only
	pop_idx: array of sample indices for this population
	'''
	xp = array_module
	sub = genotypes[pop_idx]
	called = sub != MISSING_GENOTYPE
	an = 2.0 * called.sum(axis=0)
	ac = xp.where(called, sub, 0).sum(axis=0)
	het_obs = (sub == 1).sum(axis=0)
	return pop_stats_from_counts(ac, an, het_obs)


def occupied_window_spans(positions, window_size, first_window_start):
	'''
	The windows a block's variants fall in, as (window index, start, end) spans.

	Positions arrive sorted, so the variants of a window are contiguous and a
	window needs no mask over the block to find them. Windows holding nothing are
	left out: the writer seeds their rates with NaN and their sums with zero,
	which is exactly what computing them produced, and on an ascertained panel
	most windows of the genome hold nothing.
	'''
	window_of_variant = positions // window_size
	boundaries = np.flatnonzero(np.diff(window_of_variant)) + 1
	starts = np.concatenate(([0], boundaries))
	ends = np.concatenate((boundaries, [positions.size]))
	return [
		(int(window_of_variant[start]), int(start), int(end))
		for start, end in zip(starts, ends)
		if int(window_of_variant[start]) * window_size >= first_window_start
	]


def compute_pop_stats_for_block(genotypes, pop_arrays, pop_labels, positions, window_size, last_window):
	'''
	Compute population statistics for all populations for complete windows in a block.

	genotypes: (n_samples, n_variants) int8 array
	pop_arrays: list of arrays with sample indices per population
	pop_labels: list of population label strings
	positions: NumPy array of variant positions, sorted
	window_size: int
	last_window: int, end position of last processed window (0 on first call)

	Returns tuple: (results, snp_counts, new_last_window)
	results: dict keyed by population label, values are dicts keyed by window_idx
	         with values (het, tajimasd, fulif, ac_sum, an_sum, het_obs_sum)
	snp_counts: dict keyed by window_idx with SNP count per window
	new_last_window: int, start position of next window to process

	Only windows holding a variant appear in either dict. The reference walked
	every window of the block's span and wrote a row of NaN and zero for the
	empty ones, which the output seeding already provides.
	'''
	results = {label: {} for label in pop_labels}
	snp_counts = {}
	if positions.size == 0:
		return results, snp_counts, last_window

	last_complete_window_start = (positions[-1] // window_size) * window_size
	spans = occupied_window_spans(positions, window_size, last_window)
	membership = population_membership(pop_arrays, genotypes.shape[0])

	for window_idx, start, end in spans:
		snp_counts[window_idx] = np.int32(end - start)
		ac_all, an_all, het_obs_all = window_allele_counts(genotypes[:, start:end], membership)
		for pop_id, label in enumerate(pop_labels):
			results[label][window_idx] = pop_stats_from_counts(ac_all[pop_id], an_all[pop_id], het_obs_all[pop_id])

	return results, snp_counts, last_complete_window_start + window_size
