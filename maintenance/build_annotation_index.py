#!/usr/bin/env python3
'''
Build the deployable annotation index from the curated annotation CSV.

    python build_annotation_index.py \\
        --csv 'delphi annotations.csv' \\
        --output index.json

Each row becomes one entry, keyed by KEY_COLUMN. The data files are named after
that key, and the curated columns are copied across as listed in
METADATA_COLUMNS. BUILT_IN_ENTRIES are written as they stand, for annotations
that are not curated in the CSV.
'''
import argparse
import csv
import json

KEY_COLUMN = 'longLabel'

BUILT_IN_ENTRIES = {
	'gencode19_genes': {
		'type': 'jsonl',
		'source': 'gencodev19_annotation.jsonl',
		'index': 'gencodev19_annotation.index.json',
		'Name': 'GENCODE v19 genes',
		'Category': 'Genes',
		'Subcategory': 'Gene models',
		'Description': 'Gene, transcript and exon models from GENCODE release 19.',
		'Reference': 'GENCODE: The reference human genome annotation for The ENCODE Project',
		'Link': 'https://doi.org/10.1101/gr.135350.111'
	}
}

METADATA_COLUMNS = {
	'Name': 'Name',
	'Category': 'Category',
	'Type': 'Subcategory',
	'Description': 'Description',
	'Reference': 'Reference',
	'Link': 'Link'
}


def read_rows(csv_path):
	'''
	Read the annotation CSV.
	'''
	with open(csv_path, newline='') as handle:
		return list(csv.DictReader(handle))


def index_entry(row, key):
	'''
	Build one index entry from a CSV row.
	'''
	entry = {
		'type': 'jsonl',
		'source': f'{key}.jsonl',
		'index': f'{key}.index.json'
	}
	entry.update({field: row[column].strip() for column, field in METADATA_COLUMNS.items()})
	return entry


def build_index(rows):
	'''
	Build the whole index from the built-in entries and the CSV rows, keyed by KEY_COLUMN.
	'''
	index = {key: dict(entry) for key, entry in BUILT_IN_ENTRIES.items()}
	index.update({row[KEY_COLUMN].strip(): index_entry(row, row[KEY_COLUMN].strip()) for row in rows})
	return index


def main():
	parser = argparse.ArgumentParser(description='Build the annotation index from the curated CSV')
	parser.add_argument('--csv', required=True, help='curated annotation CSV')
	parser.add_argument('--output', required=True, help='index.json to upload')
	args = parser.parse_args()
	index = build_index(read_rows(args.csv))
	with open(args.output, 'w') as handle:
		json.dump(index, handle, indent=2, ensure_ascii=False)
	print(f'annotations written: {len(index)}')


if __name__ == '__main__':
	main()
