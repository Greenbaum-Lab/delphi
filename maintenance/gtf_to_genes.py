#!/usr/bin/env python3
import gzip
import json
import argparse
import os


def parse_attributes(attributes_field):
	'''
	Parse a GTF attributes field into a dictionary of key to value.
	'''
	attributes = {}
	parts = attributes_field.strip().split(';')
	for part in parts:
		part = part.strip()
		if not part:
			continue
		if ' ' not in part:
			continue
		key, value = part.split(' ', 1)
		value = value.strip().strip('"')
		attributes[key] = value
	return attributes


def load_transcripts_and_exons(annotation_path):
	'''
	Load transcript and exon intervals from a GTF/GFF file.

	Returns two dictionaries:
	transcripts_by_chromosome[chromosome][gene_id] = list of (start, end) for transcript features
	exons_by_chromosome[chromosome][gene_id] = list of (start, end) for exon features
	Also returns gene_names_by_id[gene_id] = gene_name mapping
	Also returns gene_strands_by_id[gene_id] = strand character ('+' or '-')
	'''
	transcripts_by_chromosome = {}
	exons_by_chromosome = {}
	gene_names_by_id = {}
	gene_strands_by_id = {}

	if annotation_path.endswith('.gz'):
		file_handle = gzip.open(annotation_path, 'rt')
	else:
		file_handle = open(annotation_path, 'r')
	
	with file_handle as annotation_file:
		for line in annotation_file:
			if not line or line.startswith('#'):
				continue
			fields = line.rstrip('\n').split('\t')
			if len(fields) != 9:
				continue
			chromosome = fields[0]
			feature_type = fields[2]
			start = fields[3]
			end = fields[4]
			strand = fields[6]
			attributes_field = fields[8]

			attributes = parse_attributes(attributes_field)
			gene_id = attributes.get('gene_id')
			if gene_id is None:
				continue

			if gene_id not in gene_names_by_id and 'gene_name' in attributes:
				gene_names_by_id[gene_id] = attributes['gene_name']

			try:
				start_position = int(start)
				end_position = int(end)
			except ValueError:
				continue

			if feature_type == 'transcript':
				if chromosome not in transcripts_by_chromosome:
					transcripts_by_chromosome[chromosome] = {}
				if gene_id not in transcripts_by_chromosome[chromosome]:
					transcripts_by_chromosome[chromosome][gene_id] = []
				transcripts_by_chromosome[chromosome][gene_id].append((start_position, end_position))
				if gene_id not in gene_strands_by_id:
					gene_strands_by_id[gene_id] = strand

			if feature_type == 'exon':
				if chromosome not in exons_by_chromosome:
					exons_by_chromosome[chromosome] = {}
				if gene_id not in exons_by_chromosome[chromosome]:
					exons_by_chromosome[chromosome][gene_id] = []
				exons_by_chromosome[chromosome][gene_id].append((start_position, end_position))

	return transcripts_by_chromosome, exons_by_chromosome, gene_names_by_id, gene_strands_by_id


def load_bed_regions(annotation_path):
	genes_by_chromosome = {}
	if annotation_path.endswith('.gz'):
		file_handle = gzip.open(annotation_path, 'rt')
	else:
		file_handle = open(annotation_path, 'r')
	with file_handle as annotation_file:
		for line in annotation_file:
			if not line.strip() or line.startswith('#') or line.startswith('track') or line.startswith('browser'):
				continue
			fields = line.rstrip('\n').split('\t')
			if len(fields) < 3:
				continue
			chromosome = fields[0]
			try:
				start_position = int(fields[1])
				end_position = int(fields[2])
			except ValueError:
				continue
			region_name = fields[3] if len(fields) > 3 and fields[3].strip() else ''
			if chromosome not in genes_by_chromosome:
				genes_by_chromosome[chromosome] = {}
			region_id = region_name + '_' + str(start_position)
			genes_by_chromosome[chromosome][region_id] = {
				'chr': chromosome,
				'name': region_name,
				'start': start_position,
				'end': end_position,
				'exons': [[start_position, end_position]],
				'introns': []
			}
	return genes_by_chromosome


def build_genes_by_chromosome(transcripts_by_chromosome, exons_by_chromosome, gene_names_by_id, gene_strands_by_id):
	'''
	Build gene objects per chromosome with name, start, end, strand, exons, and introns.
	'''
	genes_by_chromosome = {}
	chromosomes = set(transcripts_by_chromosome.keys()) | set(exons_by_chromosome.keys())

	for chromosome in chromosomes:
		chromosome_transcripts = transcripts_by_chromosome.get(chromosome, {})
		chromosome_exons = exons_by_chromosome.get(chromosome, {})
		gene_ids = set(chromosome_transcripts.keys()) | set(chromosome_exons.keys())
		if not gene_ids:
			continue

		genes_for_chromosome = {}
		for gene_id in gene_ids:
			transcript_intervals = chromosome_transcripts.get(gene_id)
			exon_intervals = chromosome_exons.get(gene_id)

			if not transcript_intervals or not exon_intervals:
				continue

			gene_start = min(interval[0] for interval in transcript_intervals)
			gene_end = max(interval[1] for interval in transcript_intervals)

			sorted_exons = sorted(exon_intervals, key=lambda interval: (interval[0], interval[1]))
			exon_pairs = [[interval[0], interval[1]] for interval in sorted_exons]

			intron_pairs = []
			if len(sorted_exons) > 1:
				for index in range(len(sorted_exons) - 1):
					left_end = sorted_exons[index][1]
					right_start = sorted_exons[index + 1][0]
					if left_end < right_start:
						intron_pairs.append([left_end, right_start])

			gene_name = gene_names_by_id.get(gene_id, gene_id)
			gene_object = {
				'chr': chromosome,
				'name': gene_name,
				'start': gene_start,
				'end': gene_end,
				'strand': gene_strands_by_id.get(gene_id),
				'exons': exon_pairs,
				'introns': intron_pairs
			}
			genes_for_chromosome[gene_id] = gene_object

		if genes_for_chromosome:
			genes_by_chromosome[chromosome] = genes_for_chromosome

	return genes_by_chromosome


def ensure_output_directory(output_directory):
	'''
	Ensure that the output directory exists.
	'''
	if not os.path.isdir(output_directory):
		os.makedirs(output_directory, exist_ok=True)


def write_jsonl_and_index(genes_by_chromosome, output_directory, window_size, annotation_id):
	'''
	Write one JSONL file and one index JSON file for all chromosomes.
	'''
	jsonl_path = os.path.join(output_directory, annotation_id + '_genes.jsonl')
	index_path = os.path.join(output_directory, annotation_id + '_genes.index.json')

	index_object = {}

	byte_offset = 0

	with open(jsonl_path, 'w', encoding='utf-8') as jsonl_file:
		for chromosome in sorted(genes_by_chromosome.keys()):
			genes_for_chromosome = genes_by_chromosome[chromosome]
			sorted_genes = sorted(genes_for_chromosome.values(), key=lambda gene: gene['start'])
			
			window_offsets = {}
			
			for gene in sorted_genes:
				window_index = gene['start'] // window_size
				if window_index not in window_offsets:
					window_offsets[window_index] = byte_offset

				serialized = json.dumps(gene, separators=(',', ':'))
				line_text = serialized + '\n'
				encoded = line_text.encode('utf-8')
				jsonl_file.write(line_text)
				byte_offset += len(encoded)
			
			end_byte = byte_offset
			
			if window_offsets:
				max_window_index = max(window_offsets.keys())
				windows_array = [0] * (max_window_index + 1)
				last_offset = 0
				for index in range(max_window_index + 1):
					if index in window_offsets:
						last_offset = window_offsets[index]
					windows_array[index] = last_offset
			else:
				windows_array = []
			
			index_object[chromosome] = {
				'windows': windows_array,
				'end_byte': end_byte
			}
			
			print('Wrote', chromosome, 'genes', len(sorted_genes))

	with open(index_path, 'w', encoding='utf-8') as index_file:
		json.dump(index_object, index_file, separators=(',', ':'))

	print('Wrote all genes to', jsonl_path)


def detect_format(annotation_path):
	base = annotation_path.replace('.gz', '')
	if base.endswith('.bed'):
		return 'bed'
	return 'gtf'


def convert_annotation(annotation_path, window_size=100000, annotation_id='annotation'):
	if detect_format(annotation_path) == 'bed':
		return load_bed_regions(annotation_path)
	transcripts_by_chromosome, exons_by_chromosome, gene_names_by_id, gene_strands_by_id = load_transcripts_and_exons(annotation_path)
	genes_by_chromosome = build_genes_by_chromosome(transcripts_by_chromosome, exons_by_chromosome, gene_names_by_id, gene_strands_by_id)
	return genes_by_chromosome


def main():
	parser = argparse.ArgumentParser(description='Convert GTF/GFF/BED annotation to JSONL format')
	parser.add_argument('-i', '--input', required=True, help='Input GTF, GFF, or BED file (can be gzipped)')
	parser.add_argument('-o', '--output', required=True, help='Output directory for JSONL files')
	parser.add_argument('-w', '--window-size', type=int, default=100000, help='Window size for indexing (default: 100000)')
	parser.add_argument('-a', '--annotation-id', default='annotation', help='Annotation identifier for output file prefixes (default: annotation)')
	
	args = parser.parse_args()
	
	annotation_path = args.input
	output_directory = args.output
	window_size = args.window_size
	annotation_id = args.annotation_id

	if not os.path.exists(annotation_path):
		raise SystemExit('Input annotation file not found: ' + annotation_path)

	genes_by_chromosome = convert_annotation(annotation_path, window_size, annotation_id)

	ensure_output_directory(output_directory)

	write_jsonl_and_index(genes_by_chromosome, output_directory, window_size, annotation_id)


if __name__ == '__main__':
	main()

