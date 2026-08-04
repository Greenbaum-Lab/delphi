'''
Locating a gnomAD individual among the AADR samples.

The two sources name the same person differently. gnomAD names the SGDP
sequenced individuals by their library, LP6005441-DNA_A06, while the AADR names
them by sample, HGDP01153. The HGDP metadata is the only place the two meet: it
lists each library as "<sample>.<library>", which gives the crosswalk.

An individual sequenced twice has two AADR rows, one under the sample name and
one under the SGDP release name, so a match is reduced to a single row before it
reaches a roster.
'''

import re
import pathlib
import collections

from aadr_names import without_method

FIELD_SEPARATOR = re.compile(r'[;,]\s*')


def load_crosswalk(path):
	'''Map every gnomAD sample name to the HGDP sample it sequenced.'''
	text = pathlib.Path(path).read_text(encoding='utf-8')
	rows = [line.rstrip('\n').split('\t') for line in text.splitlines() if line.strip()]
	header, rows = rows[0], rows[1:]
	sample_index, library_index = header.index('sample'), header.index('library')
	crosswalk = {}
	for row in rows:
		crosswalk[row[sample_index]] = row[sample_index]
		if '.' in row[library_index]:
			crosswalk[row[library_index].split('.', 1)[1]] = row[sample_index]
	return crosswalk


def sample_keys(sample):
	'''Every name an AADR sample answers to, with and without its method suffix.'''
	alternatives = sample.get('Alternative_IDs') or ''
	values = [sample.get('Poseidon_ID')] + (alternatives if isinstance(alternatives, list) else FIELD_SEPARATOR.split(alternatives))
	names = {str(value) for value in values if value}
	return names | {without_method(name) for name in names}


def build_sample_index(samples):
	'''Index the AADR samples by every name they answer to.'''
	index = collections.defaultdict(list)
	for sample in samples:
		for key in sample_keys(sample):
			index[key].append(sample)
	return index


def preferred_row(rows, individual):
	'''
	The row to keep when one individual has several.

	The row named after the individual wins, so the choice does not depend on the
	order the metadata happens to be in.
	'''
	named = [row for row in rows if without_method(row['Poseidon_ID']) == individual]
	return named[0] if named else rows[0]


def match_individuals(gnomad_roster, crosswalk, sample_index, keep):
	'''
	One AADR row per individual of a gnomAD population, and the samples with none.

	Two gnomAD samples of one individual, or two AADR rows of one individual,
	both collapse here, so a roster holds every individual once.
	'''
	chosen = {}
	unmatched = []
	for sample_id in gnomad_roster:
		individual = crosswalk.get(sample_id, sample_id)
		if individual in chosen:
			continue
		rows = [row for row in sample_index.get(individual, []) if keep(row)]
		if rows:
			chosen[individual] = preferred_row(rows, individual)
		else:
			unmatched.append(sample_id)
	return [row['Poseidon_ID'] for row in chosen.values()], unmatched
