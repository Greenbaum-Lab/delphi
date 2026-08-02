'''
Pregenerate per-population signal tracks from a PLINK fileset.

Produces the flat float32 tables the browser fetches for precomputed measures,
one file per population per chromosome, with columns

	heterozygosity, tajimasd, fulif, ac, an, het_obs

matching CONFIG.GNOMAD_STAT_COLUMNS in assets.js. Rows are either fixed-size
windows indexed from position 0, or the elements of an annotation file.

Populations come from the resolved populations file, each carrying the roster
of individuals it holds in every genotype source. The roster for --output-label
is matched against the IID field of the .fam, so family IDs are never read and
the same file drives a run over any fileset. Rosters may overlap, and a sample
belonging to several populations is read once and counted in each. A population
the fileset holds no sample of is skipped.

Output layout, where the label names the genotype source so that one population
computed from different filesets lands in different files:

	<output-dir>/<output-label>/<window-size>/<population>_<chr>.npy
	<output-dir>/<output-label>/<window-size>/snp_counts_<chr>.npy

or, in annotation mode, with the annotation file's basename in place of the
window size and a sidecar listing the element label of each row:

	<output-dir>/<output-label>/<annotation>/<population>_<chr>.npy
	<output-dir>/<output-label>/<annotation>/snp_counts_<chr>.npy
	<output-dir>/<output-label>/<annotation>/elements_<chr>.txt

Example:

	python pregenerate_signals.py \
		--bed-prefix /data/gnomad/gnomad_v3 \
		--populations ./build/populations.json \
		--output-label gnomad \
		--window-size 10000 \
		--output-dir ./build

The statistics come from pop_measures, ported from the fast_fst reference
implementation, which stays authoritative for how they are computed.
'''

import sys
import json
import time
import argparse
import pathlib
import numpy as np
import pandas as pd
from bed_reader import open_bed

import pop_measures
from pop_measures import compute_pop_stats_for_block, compute_pop_stats_for_window
from signal_summary import write_summary

STAT_COLUMNS = 6
RATE_COLUMNS = 3


def chromosome_key(name):
	'''Normalise a chromosome name so that "chr1", "1" and "CHR1" all match.'''
	text = str(name).strip()
	if text.lower().startswith('chr'):
		text = text[3:]
	return text.upper()


def chromosome_tag(name):
	'''Chromosome name in the form the browser requests, always prefixed with "chr".'''
	return f'chr{chromosome_key(name)}'


def load_population_rosters(populations_path, source):
	'''
	File name and sample roster of each population present in a genotype source.

	A population the source holds no roster for names nothing in this fileset
	and is left out, so one resolved file drives a run over any of them.
	'''
	populations = json.loads(pathlib.Path(populations_path).read_text(encoding='utf-8'))
	rosters = []
	claimed = set()
	for population in populations:
		roster = population['samples'].get(source)
		if not roster:
			continue
		if population['file_name'] in claimed:
			raise ValueError(f'two populations would both be written to {population["file_name"]}')
		claimed.add(population['file_name'])
		rosters.append((population['file_name'], roster))
	return rosters


def report_rosters(rosters, present_rows):
	'''Report the populations a fileset holds partly or not at all.'''
	partial = [
		(file_name, len(roster) - len(rows))
		for (file_name, roster), (_, rows) in zip(rosters, present_rows) if 0 < len(rows) < len(roster)
	]
	empty = [file_name for file_name, rows in present_rows if not rows]
	if partial:
		largest = sorted(partial, key=lambda item: -item[1])[:5]
		print(f'{len(partial)} population(s) partly present, largest gaps: ' + ', '.join(f'{name} missing {count}' for name, count in largest))
	if empty:
		print(f'skipping {len(empty)} population(s) with no sample in the fileset: {", ".join(empty)}')


def build_population_indices(fam_path, rosters):
	'''
	Map each population to its rows in the fileset, by sample ID.

	Returns (population_arrays, population_labels, selected_sample_rows). Only
	the samples some roster names are read, so a roster covering a fraction of a
	large fileset does not pay for the rest, and the returned index arrays
	address rows of that selection. Rosters may overlap and the same row then
	appears in several of the arrays.
	'''
	fam = pd.read_csv(fam_path, sep=r'\s+', header=None, usecols=[0, 1], names=['fid', 'iid'], dtype={'fid': str, 'iid': str})
	row_of_sample = {sample_id: row for row, sample_id in enumerate(fam['iid'].values)}
	present_rows = [
		(file_name, [row_of_sample[sample_id] for sample_id in roster if sample_id in row_of_sample])
		for file_name, roster in rosters
	]
	report_rosters(rosters, present_rows)

	kept = [(file_name, rows) for file_name, rows in present_rows if rows]
	if not kept:
		return [], [], np.zeros(0, dtype=np.int32)

	selected_rows = sorted({row for _, rows in kept for row in rows})
	selected_sample_rows = np.array(selected_rows, dtype=np.int32)
	position_of_row = {row: position for position, row in enumerate(selected_rows)}

	array_module = pop_measures.get_array_module()
	population_arrays = [
		array_module.asarray([position_of_row[row] for row in rows], dtype=array_module.int32)
		for _, rows in kept
	]
	return population_arrays, [file_name for file_name, _ in kept], selected_sample_rows


def load_variants(bed_prefix):
	'''Read chromosome and position for every variant in the fileset, in file order.'''
	return pd.read_csv(
		f'{bed_prefix}.bim',
		sep=r'\s+',
		header=None,
		usecols=[0, 3],
		names=['chr', 'pos'],
		dtype={'chr': str, 'pos': np.int32}
	)


def load_annotation_elements(annotation_path):
	'''
	Read a BED file whose fourth column holds the element label.

	Returns a dict keyed by normalised chromosome, each value a list of elements
	in file order with their row index in the output table. BED coordinates are
	zero-based half-open while .bim positions are one-based, so a variant belongs
	to an element when start < position <= end.
	'''
	elements_by_chromosome = {}
	row_counts = {}
	with pathlib.Path(annotation_path).open(encoding='utf-8') as handle:
		for line_number, line in enumerate(handle, start=1):
			text = line.strip()
			if not text or text.startswith('#') or text.startswith('track') or text.startswith('browser'):
				continue
			fields = text.split('\t')
			if len(fields) < 4:
				raise ValueError(f'{annotation_path}:{line_number}: expected at least 4 tab separated columns, found {len(fields)}')
			key = chromosome_key(fields[0])
			row_index = row_counts.get(key, 0)
			row_counts[key] = row_index + 1
			elements_by_chromosome.setdefault(key, []).append({
				'start': int(fields[1]),
				'end': int(fields[2]),
				'label': fields[3],
				'row_index': row_index
			})
	return elements_by_chromosome


class SignalAccumulator:
	'''
	Collects one row of statistics per population, keyed by row index, where a row
	is a fixed-size window or an annotation element.
	'''

	def __init__(self, population_labels):
		self.rows = {label: {} for label in population_labels}
		self.snp_counts = {}
		self.last_window = 0


def accumulate_row(accumulator, label, row_index, statistics):
	'''
	Store one row of statistics for a population.

	A rate that cannot be computed is stored as NaN rather than zero, so the
	browser masks the window from the table alone and does not have to read the
	SNP counts to tell no coverage from a genuine zero. The reference kept a
	seeded zero here, which it could not avoid: it revisited windows across
	overlapping blocks, whereas each row is computed exactly once here.

	The three sums stay zero when a row is empty, which is what a sum over no
	variants is, and what the browser's FST already treats as no data.
	'''
	accumulator.rows[label][row_index] = list(statistics)


def load_genotypes(bed_file, sample_rows, variant_indices):
	'''Read a block of genotypes for the selected samples onto the active array backend.'''
	array_module = pop_measures.get_array_module()
	block = bed_file.read(np.s_[sample_rows, variant_indices], dtype='int8')
	return array_module.ascontiguousarray(array_module.asarray(block, dtype=array_module.int8))


def process_windows(bed_file, sample_rows, population_arrays, population_labels, positions_all, variant_indices_all, window_size, block_size):
	'''
	Walk the chromosome in blocks of variants, accumulating statistics for every
	fixed-size window. Returns (accumulator, row_count).

	Boundary handling differs from the reference. There, a block finalised the
	window holding its last variant and moved last_window past it, so a window
	spanning a block boundary was computed from only the variants before the
	boundary and never revisited; the backward buffer could not repair that,
	because those extra variants fall below last_window and are skipped. Here a
	block finalises only the windows below the one holding its last variant, the
	straddling window is left for the next block, and the next block rewinds to
	the first variant of that window rather than by a fixed variant count. A block
	is extended when it would not otherwise clear a whole window, so a window
	holding more variants than block_size is still read in one piece.
	'''
	accumulator = SignalAccumulator(population_labels)
	order = np.argsort(positions_all, kind='stable')
	positions_all = positions_all[order]
	variant_indices_all = variant_indices_all[order]
	total_variants = variant_indices_all.size
	row_count = int(positions_all[-1]) // window_size + 1

	block_start = 0
	while block_start < total_variants:
		block_end = min(total_variants, block_start + block_size)
		while block_end < total_variants and (int(positions_all[block_end - 1]) // window_size) * window_size <= accumulator.last_window:
			next_window_start = ((int(positions_all[block_end - 1]) // window_size) + 1) * window_size
			block_end = min(total_variants, int(np.searchsorted(positions_all, next_window_start, side='left')) + 1)

		buffer_start = min(int(np.searchsorted(positions_all, accumulator.last_window, side='left')), block_start)
		block_indices = variant_indices_all[buffer_start:block_end]
		positions = positions_all[buffer_start:block_end]
		is_final_block = block_end >= total_variants
		straddling_window = int(positions[-1]) // window_size

		start_time = time.time()
		genotypes = load_genotypes(bed_file, sample_rows, block_indices)
		block_rows, block_snp_counts, _ = compute_pop_stats_for_block(
			genotypes, population_arrays, population_labels, positions, window_size, accumulator.last_window
		)

		if is_final_block:
			accumulator.last_window = (straddling_window + 1) * window_size
		else:
			for label in population_labels:
				block_rows[label].pop(straddling_window, None)
			block_snp_counts.pop(straddling_window, None)
			accumulator.last_window = straddling_window * window_size

		for label in population_labels:
			for row_index, statistics in block_rows[label].items():
				accumulate_row(accumulator, label, row_index, statistics)
		accumulator.snp_counts.update(block_snp_counts)

		print(f'  variants {block_start}-{block_end}  {time.time() - start_time:.3f}s')
		sys.stdout.flush()
		block_start = block_end

	return accumulator, row_count


def resolve_element_spans(elements, positions_all):
	'''
	Attach the half-open variant index span of each element.

	Positions are sorted first so that the spans can be found by binary search,
	which keeps the cost independent of the number of elements. Elements are
	returned ordered by their first variant, while row_index still points at the
	element's place in the annotation file.
	'''
	order = np.argsort(positions_all, kind='stable')
	sorted_positions = positions_all[order]
	resolved = []
	for element in elements:
		span_start = int(np.searchsorted(sorted_positions, element['start'], side='right'))
		span_end = int(np.searchsorted(sorted_positions, element['end'], side='right'))
		resolved.append(dict(element, span_start=span_start, span_end=span_end))
	resolved.sort(key=lambda element: (element['span_start'], element['span_end']))
	return resolved, order


def iter_element_batches(elements, block_size):
	'''
	Group elements into batches whose combined variant span fits one read.

	Elements arrive ordered by their first variant, so a batch covers a
	contiguous span. An element wider than block_size forms a batch of its own.
	'''
	batch = []
	batch_start = 0
	batch_end = 0
	for element in elements:
		if element['span_end'] <= element['span_start']:
			yield [element], 0, 0
			continue
		if not batch:
			batch, batch_start, batch_end = [element], element['span_start'], element['span_end']
			continue
		merged_end = max(batch_end, element['span_end'])
		if merged_end - batch_start > block_size:
			yield batch, batch_start, batch_end
			batch, batch_start, batch_end = [element], element['span_start'], element['span_end']
		else:
			batch.append(element)
			batch_end = merged_end
	if batch:
		yield batch, batch_start, batch_end


def process_elements(bed_file, sample_rows, population_arrays, population_labels, positions_all, variant_indices_all, elements, block_size):
	'''
	Compute statistics for the elements of an annotation file rather than for
	fixed-size windows. Returns (accumulator, row_count).
	'''
	array_module = pop_measures.get_array_module()
	accumulator = SignalAccumulator(population_labels)
	row_count = len(elements)
	resolved, order = resolve_element_spans(elements, positions_all)
	sorted_positions = positions_all[order]
	sorted_variant_indices = variant_indices_all[order]
	empty_statistics = (np.float32(np.nan), np.float32(np.nan), np.float32(np.nan), np.float32(0), np.float32(0), np.float32(0))

	for batch, batch_start, batch_end in iter_element_batches(resolved, block_size):
		if batch_end <= batch_start:
			for element in batch:
				accumulator.snp_counts[element['row_index']] = np.int32(0)
				for label in population_labels:
					accumulate_row(accumulator, label, element['row_index'], empty_statistics)
			continue

		start_time = time.time()
		genotypes = load_genotypes(bed_file, sample_rows, sorted_variant_indices[batch_start:batch_end])
		batch_positions = array_module.asarray(sorted_positions[batch_start:batch_end], dtype=array_module.int32)

		for element in batch:
			offset_start = element['span_start'] - batch_start
			offset_end = element['span_end'] - batch_start
			mask = (batch_positions[offset_start:offset_end] > element['start']) & (batch_positions[offset_start:offset_end] <= element['end'])
			snp_count = int(array_module.count_nonzero(mask))
			accumulator.snp_counts[element['row_index']] = np.int32(snp_count)
			if snp_count == 0:
				for label in population_labels:
					accumulate_row(accumulator, label, element['row_index'], empty_statistics)
				continue
			element_genotypes = genotypes[:, offset_start:offset_end][:, mask]
			for population_id, population_index in enumerate(population_arrays):
				statistics = compute_pop_stats_for_window(element_genotypes, population_index)
				accumulate_row(accumulator, population_labels[population_id], element['row_index'], statistics)

		first_row = batch[0]['row_index']
		last_row = batch[-1]['row_index']
		print(f'  elements {first_row}-{last_row}  {time.time() - start_time:.3f}s')
		sys.stdout.flush()

	return accumulator, row_count


def write_signal_files(output_directory, accumulator, population_labels, row_count, tag):
	'''
	Write one table per population plus the SNP count sidecar.

	Rates are seeded with NaN and sums with zero, so a row never reached reads the
	same as a row with no variants in it.
	'''
	for label in population_labels:
		table = np.empty((row_count, STAT_COLUMNS), dtype=np.float32)
		table[:, 0:RATE_COLUMNS] = np.nan
		table[:, RATE_COLUMNS:STAT_COLUMNS] = 0.0
		for row_index, row in accumulator.rows[label].items():
			table[row_index] = row
		np.save(output_directory / f'{label}_{tag}.npy', table)

	snp_counts = np.zeros(row_count, dtype=np.int32)
	for row_index, count in accumulator.snp_counts.items():
		snp_counts[row_index] = count
	np.save(output_directory / f'snp_counts_{tag}.npy', snp_counts)


def write_element_labels(output_directory, elements, tag):
	'''Write the annotation label of each row, in the same order as the table rows.'''
	labels = [''] * len(elements)
	for element in elements:
		labels[element['row_index']] = element['label']
	path = output_directory / f'elements_{tag}.txt'
	path.write_text('\n'.join(labels) + '\n', encoding='utf-8')


def generate(args):
	'''Generate every signal file the fileset and populations file have in common.'''
	if args.backend == 'numpy':
		pop_measures.use_numpy()
	backend_name = pop_measures.get_array_module().__name__
	if args.backend == 'cupy' and backend_name != 'cupy':
		raise RuntimeError('CuPy backend requested but CuPy is not importable')
	print(f'array backend: {backend_name}')

	rosters = load_population_rosters(args.populations, args.output_label)
	population_arrays, population_labels, sample_rows = build_population_indices(f'{args.bed_prefix}.fam', rosters)
	if not population_labels:
		print('no requested population is present in the fileset, nothing to generate')
		return
	print(f'generating {len(population_labels)} population(s) from {sample_rows.size} sample(s)')

	variants = load_variants(args.bed_prefix)
	elements_by_chromosome = load_annotation_elements(args.annotation) if args.annotation else None
	subdirectory = pathlib.Path(args.annotation).stem if args.annotation else str(args.window_size)
	output_directory = pathlib.Path(args.output_dir) / args.output_label / subdirectory
	output_directory.mkdir(parents=True, exist_ok=True)

	available_chromosomes = list(dict.fromkeys(variants['chr'].values))
	if args.chromosome:
		requested_keys = [chromosome_key(name) for name in args.chromosome]
		available_chromosomes = [name for name in available_chromosomes if chromosome_key(name) in requested_keys]

	bed_file = open_bed(f'{args.bed_prefix}.bed', num_threads=args.threads)

	for chromosome in available_chromosomes:
		key = chromosome_key(chromosome)
		tag = chromosome_tag(chromosome)
		chromosome_mask = (variants['chr'] == chromosome).values
		positions_all = variants.loc[chromosome_mask, 'pos'].values
		variant_indices_all = np.where(chromosome_mask)[0]
		if positions_all.size == 0:
			continue

		if elements_by_chromosome is not None:
			elements = elements_by_chromosome.get(key, [])
			if not elements:
				print(f'{tag}: no annotation elements, skipping')
				continue
			print(f'{tag}: {positions_all.size} variants, {len(elements)} elements')
			accumulator, row_count = process_elements(
				bed_file, sample_rows, population_arrays, population_labels,
				positions_all, variant_indices_all, elements, args.block_size
			)
			write_signal_files(output_directory, accumulator, population_labels, row_count, tag)
			write_element_labels(output_directory, elements, tag)
		else:
			print(f'{tag}: {positions_all.size} variants')
			accumulator, row_count = process_windows(
				bed_file, sample_rows, population_arrays, population_labels,
				positions_all, variant_indices_all, args.window_size, args.block_size
			)
			write_signal_files(output_directory, accumulator, population_labels, row_count, tag)

	summary_path = write_summary(output_directory, population_labels)
	print(f'wrote signal files to {output_directory}')
	print(f'wrote reference statistics to {summary_path}')


def main():
	parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
	parser.add_argument('--bed-prefix', required=True, help='Root of the .bed/.bim/.fam fileset')
	parser.add_argument('--populations', required=True, help='Resolved populations file holding a sample roster per source')
	parser.add_argument('--output-label', required=True, help='Name of the genotype source, naming both the roster to use and the output directory (e.g. gnomad, AADR)')
	parser.add_argument('--output-dir', required=True, help='Directory to write the generated tracks to')
	rows = parser.add_mutually_exclusive_group(required=True)
	rows.add_argument('--window-size', type=int, help='Fixed window size in bases')
	rows.add_argument('--annotation', help='BED file whose elements define the rows, with labels in column 4')
	parser.add_argument('--chromosome', nargs='+', help='Chromosomes to generate (default: every chromosome in the .bim)')
	parser.add_argument('--block-size', type=int, default=10000, help='Number of variants read per block (default: 10000)')
	parser.add_argument('--threads', type=int, default=8, help='Threads used by bed_reader (default: 8)')
	parser.add_argument('--backend', choices=['auto', 'cupy', 'numpy'], default='auto', help='Array backend (default: auto, CuPy when available)')
	args = parser.parse_args()
	generate(args)


if __name__ == '__main__':
	main()
