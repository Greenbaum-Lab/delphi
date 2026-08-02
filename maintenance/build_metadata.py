#!/usr/bin/env python3
'''
Reduce the raw AADR metadata to the fields the app reads.

Writes Poseidon_AADR_v62_metadata.json, the sample table the browser loads to
derive a population's attributes and the resolver reads for dates and
coordinates. Nothing here decides which population a sample belongs to: that
lives in population_definitions.json and is resolved by build_populations.py.

	python build_metadata.py \\
		--metadata Poseidon_AADR_v62_metadata_ORIGINAL.json \\
		--output-dir ./build

Earlier versions of this script also produced modern_populations.json, and to
do so rewrote fields of the data on the way through: a region bucketed from the
present-day country of a site, group names snapped to a curated spelling,
aadr_population repointed at whatever the gnomAD file happened to be called,
and ancient samples binned into region and time populations by overwriting
their group name. All of it is gone. Group_Name is now carried through
untouched and read, never written.
'''
import argparse
import json
from pathlib import Path

FIELDS_TO_KEEP = [
	'Poseidon_ID', 'Group_Name', 'Country', 'Location', 'date',
	'Latitude', 'Longitude', 'Genetic_Sex', 'chelsa_pc1', 'chelsa_pc2',
	'ag_urbanization', 'ag_foraging', 'ag_extensive_agriculture',
	'ag_intensive_agriculture', 'ag_pastoralism', 'ukb_pc1', 'ukb_pc2',
]

RENAME_MAP = {
	'date': 'Date',
	'chelsa_pc1': 'Temperature_index',
	'chelsa_pc2': 'Precipitation_index',
	'ag_urbanization': 'Urbanization_onset',
	'ag_foraging': 'Foraging_onset',
	'ag_extensive_agriculture': 'Agriculture_extensiveness',
	'ag_intensive_agriculture': 'Agriculture_intensity',
	'ag_pastoralism': 'Pastoralism_onset',
	'ukb_pc1': 'Genetic_distance_PC1',
	'ukb_pc2': 'Genetic_distance_PC2',
}


def load_json(path):
	'''Read either a JSON array or a file of one JSON object per line.'''
	text = Path(path).read_text(encoding='utf-8').strip()
	if text.startswith('['):
		return json.loads(text)
	return [json.loads(line) for line in text.splitlines() if line.strip()]


def simplify_metadata(records, fields=FIELDS_TO_KEEP, rename_map=RENAME_MAP):
	'''Keep the fields the app reads, under the names it reads them by.'''
	simplified = []
	for record in records:
		filtered = {field: record.get(field) for field in fields}
		simplified.append({rename_map.get(key, key): value for key, value in filtered.items()})
	return simplified


def build(metadata_path, output_dir):
	metadata = simplify_metadata(load_json(metadata_path))
	output_path = Path(output_dir) / 'Poseidon_AADR_v62_metadata.json'
	output_path.parent.mkdir(parents=True, exist_ok=True)
	output_path.write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding='utf-8')
	print(f'Wrote {len(metadata)} samples to {output_path}')


def main():
	parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
	parser.add_argument('--metadata', required=True, help='Path to the raw AADR sample metadata')
	parser.add_argument('--output-dir', required=True, help='Directory to write the deployable metadata to')
	args = parser.parse_args()
	build(args.metadata, args.output_dir)


if __name__ == '__main__':
	main()
