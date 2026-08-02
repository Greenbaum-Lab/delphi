'''
Resolve population definitions into explicit sample rosters.

Reads population_definitions.json, the single place a population is defined,
and writes populations.json, where every population carries the individuals it
holds in each genotype source. Nothing downstream derives membership again: the
browser loads the rosters and the signal generator matches them against a
fileset by sample ID.

A curated population is defined by its name in each source. Its gnomAD roster
comes from the FID field of the gnomAD fileset, which is authoritative, and its
AADR roster from the AADR group name. The two are cross matched with the
genotyping suffix removed, and the counts in both, gnomAD only and AADR only
are reported, so a disagreement is a number rather than a silence.

A polygon population is defined by a ring and resolves to one population per
time bin, holding the dated AADR samples inside the ring. Rings may overlap and
a sample inside several of them belongs to several populations.

Example:

	python build_populations.py \
		--definitions population_definitions.json \
		--metadata ./build/Poseidon_AADR_v62_metadata.json \
		--gnomad-fam /data/gnomad/gnomad_v3.fam \
		--output ./build/populations.json
'''

import re
import json
import argparse
import pathlib
import collections

from polygon import polygon_samples
from aadr_names import without_method, split_group_name, sample_markers, quality_markers

MARKER_FLAGS = {
	'outlier': 'include_outliers',
	'low_coverage': 'include_low_coverage',
	'ignored': 'include_ignored',
	'other_genotyping': 'include_other_genotyping'
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


def aadr_roster(samples, aadr_population, admitted):
	'''AADR sample IDs whose group name matches a curated population.'''
	target_base, target_method, _ = split_group_name(aadr_population)
	roster = []
	for sample in samples:
		if sample.get('Group_Name') is None:
			continue
		base, markers = sample_markers(sample['Group_Name'], target_method)
		if base == target_base and not markers - admitted:
			roster.append(sample['Poseidon_ID'])
	return roster


def report_match(label, gnomad_roster, roster):
	'''Report how the two sources' rosters for one population differ.'''
	gnomad_keys = {without_method(sample_id) for sample_id in gnomad_roster}
	aadr_keys = {without_method(sample_id) for sample_id in roster}
	print(f'  {label}: {len(gnomad_keys & aadr_keys)} in both, {len(gnomad_keys - aadr_keys)} gnomAD only, {len(aadr_keys - gnomad_keys)} AADR only')
	if not roster:
		print(f'WARNING: population "{label}" has no AADR samples')
	if gnomad_roster and not gnomad_keys & aadr_keys:
		print(f'WARNING: population "{label}" shares no sample between the two sources')


def resolve_curated(entry, samples, gnomad_families, admitted):
	'''One population holding the roster each source has for it.'''
	gnomad_roster = gnomad_families.get(entry.get('gnomad_population'), [])
	roster = aadr_roster(samples, entry['aadr_population'], admitted)
	report_match(entry['label'], gnomad_roster, roster)
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


def resolve_polygon(entry, samples, bin_size, minimum_samples):
	'''One population per time bin holding enough samples inside the ring.'''
	inside = polygon_samples(entry['polygon'], samples)
	bins = bin_samples(inside, bin_size)
	populations = [
		bin_population(entry, bin_index, bins[bin_index], bin_size)
		for bin_index in sorted(bins) if len(bins[bin_index]) >= minimum_samples
	]
	print(f'  {entry["label"]}: {len(inside)} samples inside, {len(populations)} of {len(bins)} bins kept')
	return populations


def build(args):
	'''Resolve every definition and write the rosters as one file.'''
	definitions = json.loads(pathlib.Path(args.definitions).read_text(encoding='utf-8'))
	samples = json.loads(pathlib.Path(args.metadata).read_text(encoding='utf-8'))
	gnomad_families = read_gnomad_families(args.gnomad_fam) if args.gnomad_fam else {}
	admitted = admitted_markers(args)
	print(f'{len(definitions)} definitions, {len(samples)} samples, admitting {sorted(admitted) or "no flagged samples"}')

	print('curated populations')
	populations = [
		resolve_curated(entry, samples, gnomad_families, admitted)
		for entry in definitions if entry['source'] == 'curated'
	]
	ancient = dated_samples(samples, admitted)
	print(f'polygon populations, from {len(ancient)} dated samples')
	for entry in definitions:
		if entry['source'] == 'polygon':
			populations.extend(resolve_polygon(entry, ancient, args.bin_size, args.min_samples))

	output_path = pathlib.Path(args.output)
	output_path.parent.mkdir(parents=True, exist_ok=True)
	output_path.write_text(json.dumps(populations, indent=1), encoding='utf-8')
	print(f'wrote {len(populations)} populations to {output_path}')


def main():
	parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
	parser.add_argument('--definitions', required=True, help='Population definitions file')
	parser.add_argument('--metadata', required=True, help='AADR sample metadata in the app schema')
	parser.add_argument('--gnomad-fam', help='gnomAD fileset .fam, whose FID field defines the curated populations')
	parser.add_argument('--output', required=True, help='Path to write the resolved populations to')
	parser.add_argument('--bin-size', type=int, default=1000, help='Time bin width in years (default: 1000)')
	parser.add_argument('--min-samples', type=int, default=10, help='Smallest polygon population to keep (default: 10)')
	parser.add_argument('--include-outliers', action='store_true', help='Admit samples the AADR marks as outliers')
	parser.add_argument('--include-low-coverage', action='store_true', help='Admit samples the AADR marks as low coverage')
	parser.add_argument('--include-ignored', action='store_true', help='Admit samples the AADR tags with Ignore_')
	parser.add_argument('--include-other-genotyping', action='store_true', help='Admit samples genotyped by another method than the curated name')
	build(parser.parse_args())


if __name__ == '__main__':
	main()
