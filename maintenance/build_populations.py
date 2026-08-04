'''
Resolve population definitions into explicit sample rosters.

Reads population_definitions.json, the single place a population is defined,
and writes populations.json, where every population carries the individuals it
holds in each genotype source. Nothing downstream derives membership again: the
browser loads the rosters and the signal generator matches them against a
fileset by sample ID.

A curated population is defined by the FID field of the gnomAD fileset, which
is authoritative. Its AADR roster holds the same individuals, located by ID
rather than by AADR group name, because AADR groups do not always agree with
the curation: Italian_North.DG merges the two populations gnomAD separates.
aadr_population names the AADR group and the output table, but selects nothing,
and how many of its members gnomAD does not carry is reported.

A polygon population is defined by a ring and resolves to one population per
time bin, holding the dated AADR samples inside the ring. Rings may overlap and
a sample inside several of them belongs to several populations.

Example:

	python build_populations.py \
		--definitions population_definitions.json \
		--metadata ./build/Poseidon_AADR_v62_metadata.json \
		--gnomad-fam /data/gnomad/gnomad_v3.fam \
		--hgdp-metadata hgdp_metadata.txt \
		--output ./build/populations.json
'''

import re
import json
import argparse
import pathlib
import collections

from polygon import polygon_samples
from aadr_names import without_method, split_group_name, quality_markers
from sample_matching import load_crosswalk, build_sample_index, match_individuals

MARKER_FLAGS = {
	'outlier': 'include_outliers',
	'low_coverage': 'include_low_coverage',
	'ignored': 'include_ignored'
}


def admitted_markers(args):
	return {marker for marker, flag in MARKER_FLAGS.items() if getattr(args, flag)}


def read_gnomad_families(fam_path):
	'''Sample IDs under each family ID of a PLINK fileset, in file order.'''
	families = collections.defaultdict(list)
	for line in pathlib.Path(fam_path).read_text(encoding='utf-8').splitlines():
		fields = line.split()
		if len(fields) >= 2:
			families[fields[0]].append(fields[1])
	return families


def group_members(samples, aadr_population, admitted):
	'''
	AADR sample IDs whose group name matches a curated population.

	Used only to report how many of a group gnomAD does not carry. The genotyping
	method is not compared, so a group is read as the individuals it names rather
	than as one sequencing of them.
	'''
	target_base, _, _ = split_group_name(aadr_population)
	members = []
	for sample in samples:
		if sample.get('Group_Name') is None:
			continue
		base, _, markers = split_group_name(sample['Group_Name'])
		if base == target_base and not markers - admitted:
			members.append(sample['Poseidon_ID'])
	return members


def report_curated(label, gnomad_roster, roster, unmatched, group_only):
	'''Report what a curated population found in each source.'''
	print(f'  {label}: {len(gnomad_roster)} gnomAD samples -> {len(roster)} AADR individuals'
	      f', {len(unmatched)} gnomAD samples with no AADR row, {len(group_only)} in the AADR group but not in gnomAD')
	if not roster:
		print(f'WARNING: population "{label}" has no AADR samples')


def resolve_curated(entry, samples, gnomad_families, sample_index, crosswalk, admitted):
	'''One population holding the same individuals in each source it reaches.'''
	gnomad_roster = gnomad_families.get(entry.get('gnomad_population'), [])
	keep = lambda sample: not quality_markers(sample.get('Group_Name') or '') - admitted
	roster, unmatched = match_individuals(gnomad_roster, crosswalk, sample_index, keep)
	group_only = [sample_id for sample_id in group_members(samples, entry['aadr_population'], admitted) if sample_id not in set(roster)]
	report_curated(entry['label'], gnomad_roster, roster, unmatched, group_only)
	samples_by_source = {'AADR': roster}
	if gnomad_roster:
		samples_by_source['gnomad'] = gnomad_roster
	return {
		'label': entry['label'],
		'dataset': entry['dataset'],
		'source': 'curated',
		'file_name': without_method(entry['aadr_population']),
		'definition': {key: entry[key] for key in ('gnomad_population', 'aadr_population') if entry.get(key)},
		'samples': samples_by_source
	}


def file_name_for(label):
	'''Filesystem safe stem for a population, the name the browser requests.'''
	return re.sub(r'[^A-Za-z0-9]+', '_', label).strip('_')


def dated_samples(samples, admitted):
	'''Samples carrying a nonzero date, which are the ancient ones.'''
	return [
		sample for sample in samples
		if sample.get('Date') not in (None, 0)
		and not quality_markers(sample.get('Group_Name') or '') - admitted
	]


def bin_samples(samples, bin_size):
	'''Group sample IDs by the time bin their date falls in.'''
	bins = collections.defaultdict(list)
	for sample in samples:
		bins[int(sample['Date'] // bin_size)].append(sample['Poseidon_ID'])
	return bins


def bin_population(entry, bin_index, roster, bin_size):
	label = f'{entry["label"]} {bin_index}-{bin_index + 1} kya'
	return {
		'label': label,
		'dataset': entry['dataset'],
		'source': 'polygon',
		'file_name': file_name_for(label),
		'definition': {'polygon': entry['label'], 'time_start': bin_index * bin_size, 'time_end': (bin_index + 1) * bin_size},
		'samples': {'AADR': roster}
	}


def resolve_bins(entry, inside, bin_size, minimum_samples):
	'''One population per time bin holding enough samples inside the ring.'''
	bins = bin_samples(inside, bin_size)
	populations = [
		bin_population(entry, bin_index, bins[bin_index], bin_size)
		for bin_index in sorted(bins) if len(bins[bin_index]) >= minimum_samples
	]
	print(f'  {entry["label"]}: {len(inside)} samples inside, {len(populations)} of {len(bins)} bins kept')
	return populations


def report_coverage(ancient, populations, inside_any):
	'''
	Report the dated samples no polygon population holds.

	A sample is missed either because it falls outside every ring or because its
	bin held too few samples to keep, and the two call for different fixes: the
	first wants the rings redrawn, the second a coarser bin or a lower floor.
	'''
	placed = {
		sample_id for population in populations if population['source'] == 'polygon'
		for sample_id in population['samples']['AADR']
	}
	outside = [sample for sample in ancient if sample['Poseidon_ID'] not in inside_any]
	dropped = [sample for sample in ancient if sample['Poseidon_ID'] in inside_any and sample['Poseidon_ID'] not in placed]
	print(f'  {len(placed)} dated samples placed, {len(outside)} outside every ring, {len(dropped)} in a bin too small to keep')


def build(args):
	'''Resolve every definition and write the rosters as one file.'''
	definitions = json.loads(pathlib.Path(args.definitions).read_text(encoding='utf-8'))
	samples = json.loads(pathlib.Path(args.metadata).read_text(encoding='utf-8'))
	gnomad_families = read_gnomad_families(args.gnomad_fam) if args.gnomad_fam else {}
	crosswalk = load_crosswalk(args.hgdp_metadata) if args.hgdp_metadata else {}
	sample_index = build_sample_index(samples)
	admitted = admitted_markers(args)
	print(f'{len(definitions)} definitions, {len(samples)} samples, admitting {sorted(admitted) or "no flagged samples"}')

	print('curated populations')
	populations = [
		resolve_curated(entry, samples, gnomad_families, sample_index, crosswalk, admitted)
		for entry in definitions if entry['source'] == 'curated'
	]
	ancient = dated_samples(samples, admitted)
	print(f'polygon populations, from {len(ancient)} dated samples')
	inside_any = set()
	for entry in definitions:
		if entry['source'] != 'polygon':
			continue
		inside = polygon_samples(entry['polygon'], ancient)
		inside_any.update(sample['Poseidon_ID'] for sample in inside)
		populations.extend(resolve_bins(entry, inside, args.bin_size, args.min_samples))
	report_coverage(ancient, populations, inside_any)

	output_path = pathlib.Path(args.output)
	output_path.parent.mkdir(parents=True, exist_ok=True)
	output_path.write_text(json.dumps(populations, indent=1), encoding='utf-8')
	print(f'wrote {len(populations)} populations to {output_path}')


def main():
	parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
	parser.add_argument('--definitions', required=True, help='Population definitions file')
	parser.add_argument('--metadata', required=True, help='AADR sample metadata in the app schema')
	parser.add_argument('--gnomad-fam', help='gnomAD fileset .fam, whose FID field defines the curated populations')
	parser.add_argument('--hgdp-metadata', help='HGDP metadata table, naming each library "<sample>.<library>" so gnomAD library IDs resolve to samples')
	parser.add_argument('--output', required=True, help='Path to write the resolved populations to')
	parser.add_argument('--bin-size', type=int, default=1000, help='Time bin width in years (default: 1000)')
	parser.add_argument('--min-samples', type=int, default=10, help='Smallest polygon population to keep (default: 10)')
	parser.add_argument('--include-outliers', action='store_true', help='Admit samples the AADR marks as outliers')
	parser.add_argument('--include-low-coverage', action='store_true', help='Admit samples the AADR marks as low coverage')
	parser.add_argument('--include-ignored', action='store_true', help='Admit samples the AADR tags with Ignore_')
	build(parser.parse_args())


if __name__ == '__main__':
	main()
