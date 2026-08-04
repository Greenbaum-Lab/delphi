'''
Reading what the AADR encodes in its names.

A group name carries more than a population. An Ignore_ prefix, a parenthetical
qualifier, and _o or _lc suffixes mark samples the AADR flags as unusable,
outlying or low coverage, while the genotyping method follows a dot. Sample IDs
carry the method suffix too, which is the only reason an AADR sample ID differs
from the same individual's ID in another source.
'''

import re

IGNORE_PREFIX = 'Ignore_'
OUTLIER_SUFFIXES = ['_o1', '_o2', '_o3', '_o']
LOW_COVERAGE_SUFFIX = '_lc'
METHOD_SUFFIX = re.compile(r'\.[A-Z]{2}$')


def without_method(name):
	'''A name without its genotyping suffix, the form two sources share.'''
	return METHOD_SUFFIX.sub('', str(name))


def split_group_name(group_name):
	'''Base population, genotyping method and quality markers of a group name.'''
	base, _, method = str(group_name).partition('.')
	markers = set()
	if base.startswith(IGNORE_PREFIX):
		base = base[len(IGNORE_PREFIX):]
		markers.add('ignored')
	base = base.split('(')[0]
	for suffix in OUTLIER_SUFFIXES:
		if base.endswith(suffix):
			base = base[:-len(suffix)]
			markers.add('outlier')
			break
	if base.endswith(LOW_COVERAGE_SUFFIX):
		base = base[:-len(LOW_COVERAGE_SUFFIX)]
		markers.add('low_coverage')
	return base, method, markers


def quality_markers(group_name):
	'''
	Markers a sample carries regardless of any population it might join.

	The genotyping method is not one of them. A population is a set of
	individuals, and which sequencing of an individual the AADR happens to hold
	says nothing about whether that person belongs to it.
	'''
	_, _, markers = split_group_name(group_name)
	return markers
