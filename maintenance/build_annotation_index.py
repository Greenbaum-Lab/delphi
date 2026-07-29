#!/usr/bin/env python3
'''
Add the curated annotation metadata to the deployable annotation index.

    python build_annotation_index.py \\
        --csv 'delphi annotations.csv' \\
        --index index.json \\
        --output index.new.json

The CSV describes annotations, the index holds the file locations the browser
reads, and the two are matched on the column given by --key-column. Every entry
keeps its existing type, source and index fields and gains the columns listed in
METADATA_COLUMNS. Rows whose key is absent from the index are reported and
skipped, since there is no file for the browser to load.
'''
import argparse
import csv
import json

METADATA_COLUMNS = {
	'Name': 'Name',
	'Category': 'Category',
	'Type': 'Subcategory',
	'Description': 'Description',
	'Reference': 'Reference',
	'Link': 'Link'
}


def read_rows(csv_path, include_duplicates):
	'''
	Read the annotation CSV, dropping rows marked as duplicates unless asked to keep them.
	'''
	with open(csv_path, newline='') as handle:
		rows = list(csv.DictReader(handle))
	if include_duplicates:
		return rows
	return [row for row in rows if row.get('status', '').strip() != 'duplicate']


def metadata_fields(row):
	'''
	Map the CSV columns onto the field names the browser reads.
	'''
	return {field: row[column].strip() for column, field in METADATA_COLUMNS.items()}


def build_index(index, rows, key_column):
	'''
	Return the index with metadata added, plus the keys that matched and the rows that did not.
	'''
	built = {key: dict(entry) for key, entry in index.items()}
	matched = []
	unmatched = []
	for row in rows:
		key = row[key_column].strip()
		if key not in built:
			unmatched.append(row)
			continue
		built[key].update(metadata_fields(row))
		matched.append(key)
	return built, matched, unmatched


def report(built, matched, unmatched, key_column):
	'''
	Print what was written and what still needs attention.
	'''
	missing = [key for key in built if 'Category' not in built[key]]
	print(f'annotations described: {len(matched)} of {len(built)}')
	if unmatched:
		print(f'\nCSV rows with no {key_column} in the index (not written):')
		for row in unmatched:
			print(f'  {row[key_column].strip()} ({row["Name"].strip()})')
	if missing:
		print('\nIndex entries with no CSV row (shown as Other in the browser):')
		for key in missing:
			print(f'  {key}')


def main():
	parser = argparse.ArgumentParser(description='Add annotation metadata to the annotation index')
	parser.add_argument('--csv', required=True, help='curated annotation CSV')
	parser.add_argument('--index', required=True, help='current index.json from the bucket')
	parser.add_argument('--output', required=True, help='index.json to upload')
	parser.add_argument('--key-column', default='longLabel', help='CSV column matching the index keys')
	parser.add_argument('--include-duplicates', action='store_true', help='keep rows marked duplicate')
	args = parser.parse_args()
	with open(args.index) as handle:
		index = json.load(handle)
	rows = read_rows(args.csv, args.include_duplicates)
	built, matched, unmatched = build_index(index, rows, args.key_column)
	with open(args.output, 'w') as handle:
		json.dump(built, handle, indent=2, ensure_ascii=False)
	report(built, matched, unmatched, args.key_column)


if __name__ == '__main__':
	main()
