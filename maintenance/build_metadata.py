#!/usr/bin/env python3
"""
Single pipeline turning raw AADR/HGDP metadata + a hand-curated modern
population list into the two deployable assets the app reads
(Poseidon_AADR_v62_metadata.json, modern_populations.json).

    python build_metadata.py \\
        --metadata Poseidon_AADR_v62_metadata_ORIGINAL.json \\
        --populations modern_populations_ORIGINAL.json \\
        --output-dir ./build

Stages, in order:
  1. apply_population_display_names - give 1KGP acronym populations a readable
                               "population" label (purely cosmetic, aadr_population
                               untouched)
  2. add_regions              - tag each sample with a coarse Region
  3. snap_group_names_to_populations - fix a Group_Name that's simply missing its
                               dataset suffix (e.g. "BedouinA" -> "BedouinA.DG"),
                               without touching aadr_population (gnomAD lookups
                               depend on it). Samples flagged as outliers, known
                               relatives, Ignore_-tagged, or sequenced with a
                               different method are reported but left unmatched
                               and excluded, same as before this pipeline existed.
  4. simplify_metadata        - keep + rename fields to the app's schema
  5. validate_population_coverage - drop (with a warning) any population whose
                               aadr_population still has no matching Group_Name
  6. generate_adna_populations - bin aDNA samples into time/region populations
                               (runs last, appended to the modern population list)
  7. validate_population_coverage again, over the full merged list, before writing output
"""
import argparse
import difflib
import json
from collections import defaultdict
from pathlib import Path


# ---------------------------------------------------------------------------
# shared IO helpers
# ---------------------------------------------------------------------------

def load_json(path):
	path = Path(path)
	text = path.read_text(encoding='utf-8').strip()
	if text.startswith('['):
		return json.loads(text)
	return [json.loads(line) for line in text.splitlines() if line.strip()]


def save_json(data, path):
	Path(path).write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding='utf-8')


# ---------------------------------------------------------------------------
# stage 1: regions
# ---------------------------------------------------------------------------

REGION_BY_GROUP = {
	'BantuKenya': 'Africa', 'BantuSA': 'Africa', 'Biaka': 'Africa', 'Mandenka': 'Africa',
	'Mbuti': 'Africa', 'Ju_hoan_North': 'Africa', 'Yoruba': 'Africa', 'ASW': 'Africa',
	'ACB': 'Africa', 'ESN': 'Africa', 'GWD': 'Africa', 'LWK': 'Africa', 'MSL': 'Africa',
	'YRI': 'Africa',
	'BedouinA': 'Middle East', 'Druze': 'Middle East', 'Mozabite': 'Middle East',
	'Palestinian': 'Middle East',
	'Adygei': 'Europe', 'Basque': 'Europe', 'Bergamo': 'Europe', 'French': 'Europe',
	'Orcadian': 'Europe', 'Russian': 'Europe', 'Sardinian': 'Europe', 'Italian_North': 'Europe',
	'CEU': 'Europe', 'FIN': 'Europe', 'GBR': 'Europe', 'IBS': 'Europe', 'TSI': 'Europe',
	'Balochi': 'Central/South Asia', 'Brahui': 'Central/South Asia', 'Burusho': 'Central/South Asia',
	'Hazara': 'Central/South Asia', 'Kalash': 'Central/South Asia', 'Makrani': 'Central/South Asia',
	'Pathan': 'Central/South Asia', 'Sindhi_Pakistan': 'Central/South Asia', 'Uyghur': 'Central/South Asia',
	'BEB': 'Central/South Asia', 'GIH': 'Central/South Asia', 'ITU': 'Central/South Asia',
	'PJL': 'Central/South Asia', 'STU': 'Central/South Asia',
	'Cambodian': 'East Asia', 'Dai': 'East Asia', 'Daur': 'East Asia', 'Han': 'East Asia',
	'Hezhen': 'East Asia', 'Japanese': 'East Asia', 'China_Lahu': 'East Asia', 'Miao': 'East Asia',
	'Mongola': 'East Asia', 'Naxi': 'East Asia', 'NorthernHan': 'East Asia', 'Oroqen': 'East Asia',
	'She': 'East Asia', 'Tu': 'East Asia', 'Tujia': 'East Asia', 'Xibo': 'East Asia',
	'Yakut': 'East Asia', 'Yi': 'East Asia', 'CDX': 'East Asia', 'CHB': 'East Asia',
	'CHS': 'East Asia', 'JPT': 'East Asia', 'KHV': 'East Asia',
	'Nasioi': 'Oceania', 'PapuanHighlands': 'Oceania', 'PapuanSepik': 'Oceania',
	'Piapoco': 'America', 'Karitiana': 'America', 'Mayan': 'America', 'Pima': 'America',
	'Surui': 'America', 'CLM': 'America', 'MXL': 'America', 'PEL': 'America', 'PUR': 'America',
}

REGION_BY_COUNTRY_ISO = {
	'DZ': 'Africa', 'AO': 'Africa', 'BJ': 'Africa', 'BW': 'Africa', 'BF': 'Africa', 'BI': 'Africa',
	'CM': 'Africa', 'CV': 'Africa', 'CF': 'Africa', 'TD': 'Africa', 'KM': 'Africa', 'CG': 'Africa',
	'CD': 'Africa', 'CI': 'Africa', 'DJ': 'Africa', 'EG': 'Africa', 'GQ': 'Africa', 'ER': 'Africa',
	'SZ': 'Africa', 'ET': 'Africa', 'GA': 'Africa', 'GM': 'Africa', 'GH': 'Africa', 'GN': 'Africa',
	'GW': 'Africa', 'KE': 'Africa', 'LS': 'Africa', 'LR': 'Africa', 'LY': 'Africa', 'MG': 'Africa',
	'MW': 'Africa', 'ML': 'Africa', 'MR': 'Africa', 'MU': 'Africa', 'MA': 'Africa', 'MZ': 'Africa',
	'NA': 'Africa', 'NE': 'Africa', 'NG': 'Africa', 'RW': 'Africa', 'ST': 'Africa', 'SN': 'Africa',
	'SC': 'Africa', 'SL': 'Africa', 'SO': 'Africa', 'ZA': 'Africa', 'SS': 'Africa', 'SD': 'Africa',
	'TZ': 'Africa', 'TG': 'Africa', 'TN': 'Africa', 'UG': 'Africa', 'ZM': 'Africa', 'ZW': 'Africa',
	'AL': 'Europe', 'AD': 'Europe', 'AT': 'Europe', 'BY': 'Europe', 'BE': 'Europe', 'BA': 'Europe',
	'BG': 'Europe', 'HR': 'Europe', 'CY': 'Europe', 'CZ': 'Europe', 'DK': 'Europe', 'EE': 'Europe',
	'FI': 'Europe', 'FR': 'Europe', 'DE': 'Europe', 'GR': 'Europe', 'HU': 'Europe', 'IS': 'Europe',
	'IE': 'Europe', 'IT': 'Europe', 'XK': 'Europe', 'LV': 'Europe', 'LI': 'Europe', 'LT': 'Europe',
	'LU': 'Europe', 'MT': 'Europe', 'MD': 'Europe', 'MC': 'Europe', 'ME': 'Europe', 'NL': 'Europe',
	'MK': 'Europe', 'NO': 'Europe', 'PL': 'Europe', 'PT': 'Europe', 'RO': 'Europe', 'SM': 'Europe',
	'RS': 'Europe', 'SK': 'Europe', 'SI': 'Europe', 'ES': 'Europe', 'SE': 'Europe', 'CH': 'Europe',
	'UA': 'Europe', 'GB': 'Europe',
	'BH': 'Middle East', 'IQ': 'Middle East', 'IL': 'Middle East', 'JO': 'Middle East',
	'KW': 'Middle East', 'LB': 'Middle East', 'OM': 'Middle East', 'PS': 'Middle East',
	'QA': 'Middle East', 'SA': 'Middle East', 'SY': 'Middle East', 'TR': 'Middle East',
	'AE': 'Middle East', 'YE': 'Middle East',
	'AF': 'Central/South Asia', 'AM': 'Central/South Asia', 'AZ': 'Central/South Asia',
	'BD': 'Central/South Asia', 'BT': 'Central/South Asia', 'GE': 'Central/South Asia',
	'IN': 'Central/South Asia', 'IR': 'Central/South Asia', 'KZ': 'Central/South Asia',
	'KG': 'Central/South Asia', 'MV': 'Central/South Asia', 'NP': 'Central/South Asia',
	'PK': 'Central/South Asia', 'LK': 'Central/South Asia', 'TJ': 'Central/South Asia',
	'TM': 'Central/South Asia', 'UZ': 'Central/South Asia',
	'CN': 'East Asia', 'HK': 'East Asia', 'JP': 'East Asia', 'KP': 'East Asia', 'KR': 'East Asia',
	'MO': 'East Asia', 'MN': 'East Asia', 'TW': 'East Asia', 'BN': 'East Asia', 'KH': 'East Asia',
	'ID': 'East Asia', 'LA': 'East Asia', 'MY': 'East Asia', 'MM': 'East Asia', 'PH': 'East Asia',
	'SG': 'East Asia', 'TH': 'East Asia', 'TL': 'East Asia', 'VN': 'East Asia',
	'AU': 'Oceania', 'FJ': 'Oceania', 'KI': 'Oceania', 'MH': 'Oceania', 'FM': 'Oceania',
	'NR': 'Oceania', 'NZ': 'Oceania', 'PW': 'Oceania', 'PG': 'Oceania', 'WS': 'Oceania',
	'SB': 'Oceania', 'TO': 'Oceania', 'TV': 'Oceania', 'VU': 'Oceania',
	'AR': 'America', 'BO': 'America', 'BR': 'America', 'CA': 'America', 'CL': 'America',
	'CO': 'America', 'CR': 'America', 'CU': 'America', 'DO': 'America', 'EC': 'America',
	'SV': 'America', 'GT': 'America', 'GY': 'America', 'HT': 'America', 'HN': 'America',
	'JM': 'America', 'MX': 'America', 'NI': 'America', 'PA': 'America', 'PY': 'America',
	'PE': 'America', 'PR': 'America', 'SR': 'America', 'TT': 'America', 'US': 'America',
	'UY': 'America', 'VE': 'America',
	'BB': 'Africa', 'LC': 'America',
	'SH': 'Africa', 'BS': 'America', 'BZ': 'America', 'RU': 'Europe', 'JE': 'Europe',
	'CW': 'America', 'FO': 'Europe', 'PF': 'Oceania', 'GI': 'Europe', 'GL': 'America', 'GP': 'America',
}


def normalize_group_name(group_name):
	if group_name is None:
		return None
	group = str(group_name).split('.')[0]
	if group.startswith('Ignore_'):
		group = group[len('Ignore_'):]
	if '(' in group:
		group = group.split('(')[0]
	for suffix in ['_o1', '_o2', '_o3', '_o', '_lc']:
		if group.endswith(suffix):
			group = group[: -len(suffix)]
	return group


def add_regions(records):
	missing = []
	for sample in records:
		poseidon_id = sample.get('Poseidon_ID')
		group_name = sample.get('Group_Name')
		group = normalize_group_name(group_name)
		country = sample.get('Country')
		country_iso = sample.get('Country_ISO')
		if str(poseidon_id).endswith('.REF') or str(group_name).endswith('.REF'):
			sample['Region'] = None
			continue
		region = REGION_BY_GROUP.get(group)
		if region is None and group is not None and 'African' in group:
			region = 'Africa'
		if region is None and country_iso is not None:
			region = REGION_BY_COUNTRY_ISO.get(str(country_iso).upper())
		if region is None and country in {'Botswana or Namibia', 'Namibia'}:
			region = 'Africa'
		sample['Region'] = region
		if region is None:
			missing.append({
				'Poseidon_ID': poseidon_id,
				'Group_Name': group_name,
				'Country': country,
				'Country_ISO': country_iso,
			})
	if missing:
		unmapped_country_iso = sorted({m['Country_ISO'] for m in missing if m['Country_ISO']})
		unmapped_groups = sorted({normalize_group_name(m['Group_Name']) for m in missing if m['Group_Name']})
		summary_lines = [f'Missing region mapping for {len(missing)} samples.']
		if unmapped_country_iso:
			summary_lines.append(f'Unmapped Country_ISO codes ({len(unmapped_country_iso)}), add these to REGION_BY_COUNTRY_ISO: {unmapped_country_iso}')
		if unmapped_groups:
			summary_lines.append(f'Unmapped normalized Group_Names ({len(unmapped_groups)}), add these to REGION_BY_GROUP if Country_ISO above is not enough: {unmapped_groups}')
		example_str = '\n'.join(map(str, missing[:20]))
		summary_lines.append(f'First {min(20, len(missing))} unresolved records:\n{example_str}')
		raise ValueError('\n'.join(summary_lines))
	return records


# ---------------------------------------------------------------------------
# stage 2: snap sample Group_Name to the population's aadr_population
#
# browser/pops.js matches samples to a population with an exact
# `aadr_population === Group_Name` check, but the raw metadata's Group_Name
# sometimes carries a different dataset suffix/prefix than aadr_population
# (e.g. Group_Name "BedouinA" vs. aadr_population "BedouinA.DG"), so the
# match silently returns zero samples ("no data loaded", no console error).
#
# aadr_population is also used, unmodified, to look up gnomAD .npy files
# (assets.js strips only a trailing ".DG"), so it must never be rewritten --
# only Group_Name is adjusted here, and only for a *plain* mismatch: Group_Name
# is missing its dataset-type suffix entirely (e.g. "BedouinA" -> "BedouinA.DG"),
# with no other differences. normalize_group_name() also strips AADR curation
# flags -- outlier suffixes (_o, _o1, _o2, _o3, _lc), "Ignore_" prefixes,
# "(relative)"/"(discovery)" annotations, and an alternate genotyping method
# (.SG shotgun vs. .DG diploid) -- which mark an individual as a flagged
# variant of a population (a known relative, a QC outlier, or processed with
# a different pipeline), not simply the same data missing a tag. Those are
# intentionally *not* renamed, so they stay excluded from every population's
# sample set exactly like before, and are only reported as a warning.
# ---------------------------------------------------------------------------

def is_plain_suffix_mismatch(group_name, aadr_population):
	return '.' not in group_name and aadr_population.startswith(f'{group_name}.')


def snap_group_names_to_populations(metadata_records, population_entries):
	normalized_to_aadr = {}
	ambiguous = set()
	for population in population_entries:
		aadr_population = population.get('aadr_population')
		normalized = normalize_group_name(aadr_population)
		existing = normalized_to_aadr.get(normalized)
		if existing is not None and existing != aadr_population:
			ambiguous.add(normalized)
			print(f'WARNING: "{existing}" and "{aadr_population}" both normalize to "{normalized}" -- skipping automatic Group_Name matching for this name')
			continue
		normalized_to_aadr[normalized] = aadr_population

	renamed_counts = defaultdict(int)
	excluded_counts = defaultdict(int)
	for sample in metadata_records:
		group_name = sample.get('Group_Name')
		if group_name is None:
			continue
		normalized = normalize_group_name(group_name)
		if normalized in ambiguous:
			continue
		target = normalized_to_aadr.get(normalized)
		if target is None or target == group_name:
			continue
		if is_plain_suffix_mismatch(group_name, target):
			sample['Group_Name'] = target
			renamed_counts[(group_name, target)] += 1
		else:
			excluded_counts[(group_name, target)] += 1

	for (old_name, new_name), count in renamed_counts.items():
		print(f'WARNING: renamed Group_Name "{old_name}" -> "{new_name}" for {count} samples (normalized match)')
	for (old_name, new_name), count in excluded_counts.items():
		print(f'WARNING: excluded {count} samples with Group_Name "{old_name}" (flagged variant of "{new_name}" -- outlier, relative, Ignore_-tagged, or different genotyping method) -- left unmatched to any population')

	return metadata_records


# ---------------------------------------------------------------------------
# stage 3: simplify/rename fields
# ---------------------------------------------------------------------------

FIELDS_TO_KEEP = [
	'Poseidon_ID', 'Group_Name', 'Country', 'Location', 'Region', 'date',
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


def simplify_metadata(records, fields=FIELDS_TO_KEEP, rename_map=RENAME_MAP):
	simplified = []
	for record in records:
		filtered = {field: record.get(field) for field in fields}
		renamed = {rename_map.get(key, key): value for key, value in filtered.items()}
		simplified.append(renamed)
	return simplified


# ---------------------------------------------------------------------------
# stage 3b: use informative display names for 1000 Genomes populations
#
# 1KGP entries in modern_populations.json are keyed by aadr_population (e.g.
# "CDX.DG"), and historically the "population" display label -- the name
# shown in the UI, and the storage key browser/pops.js caches the population
# under -- was left as that same acronym instead of a readable name. This
# only rewrites "population"; aadr_population/Group_Name (sample matching)
# and the gnomAD lookup in assets.js are untouched, so it's purely cosmetic.
# ---------------------------------------------------------------------------

POPULATION_DISPLAY_NAMES = {
	'CDX.DG': 'Dai-1KGP',
	'CHB.DG': 'Beijing Han',
	'JPT.DG': 'Japanese-1KGP',
	'KHV.DG': 'Kinh',
	'CHS.DG': 'Southern Han',
	'BEB.DG': 'Bengali',
	'GIH.DG': 'Gujarati',
	'ITU.DG': 'Telugu',
	'PJL.DG': 'Punjabi',
	'STU.DG': 'Sri Lankan',
	'ASW.DG': 'African-American',
	'ACB.DG': 'African-Caribbean',
	'ESN.DG': 'Esan',
	'GWD.DG': 'Gambian',
	'LWK.DG': 'Luhya',
	'MSL.DG': 'Mende',
	'YRI.DG': 'Yoruba-1KGP',
	'GBR.DG': 'British',
	'FIN.DG': 'Finnish',
	'IBS.DG': 'Iberian',
	'TSI.DG': 'Toscani',
	'CEU.DG': 'Utah European',
	'CLM.DG': 'Colombian-1KGP',
	'MXL.DG': 'Mexican',
	'PEL.DG': 'Peruvian',
	'PUR.DG': 'Puerto Rican',
}


def apply_population_display_names(population_entries, display_names=POPULATION_DISPLAY_NAMES):
	for population in population_entries:
		aadr_population = population.get('aadr_population')
		display_name = display_names.get(aadr_population)
		if display_name is not None and population.get('population') != display_name:
			print(f'INFO: renamed population display name "{population.get("population")}" -> "{display_name}" ({aadr_population})')
			population['population'] = display_name
	return population_entries


# ---------------------------------------------------------------------------
# stage 4/6: validate population coverage
# ---------------------------------------------------------------------------

def validate_population_coverage(population_entries, metadata_records):
	group_names = {record.get('Group_Name') for record in metadata_records}
	valid_populations = []
	for population in population_entries:
		aadr_population = population.get('aadr_population')
		if aadr_population in group_names:
			valid_populations.append(population)
			continue
		suggestion = difflib.get_close_matches(aadr_population, group_names, n=1)
		message = f'WARNING: population "{population.get("population")}" aadr_population "{aadr_population}" has no matching Group_Name in metadata'
		if suggestion:
			message += f' (did you mean "{suggestion[0]}"?)'
		message += ' -- dropping from output'
		print(message)
	return valid_populations


# ---------------------------------------------------------------------------
# stage 5: generate aDNA populations (runs last)
# ---------------------------------------------------------------------------

def nanmean(values):
	valid = [v for v in values if v is not None]
	return sum(valid) / len(valid) if valid else None


def get_european_region(latitude, longitude):
	if 36 <= latitude < 47 and 8 <= longitude <= 31:
		return 'South East EUR'
	if 42 <= latitude < 49 and 20 <= longitude <= 31:
		return 'South East EUR'
	if 55 <= latitude <= 72 and 4 <= longitude <= 32:
		return 'Central North EUR'
	if 47 <= latitude < 55 and 5 <= longitude <= 25:
		return 'Central North EUR'
	if longitude < 5:
		return 'West EUR'
	return 'South East EUR'


def get_sample_region(sample):
	region = sample['Region']
	if region != 'Europe':
		return region.replace('_', ' ') if region else None
	latitude = sample['Latitude']
	longitude = sample['Longitude']
	if latitude is None or longitude is None:
		return None
	return get_european_region(latitude, longitude)


def get_time_window(date):
	window_start = int(date // 1000)
	window_end = window_start + 1
	return window_start, window_end


def get_group_name(region, date):
	window_start, window_end = get_time_window(date)
	return f'{region} {window_start}-{window_end} kya'


def get_aadr_population_name(group_name):
	safe_group_name = group_name.replace(' ', '_')
	safe_group_name = safe_group_name.replace('/', '_')
	safe_group_name = safe_group_name.replace('-', '_')
	return f'aDNA_{safe_group_name}'


def group_samples(samples):
	sample_groups = defaultdict(list)
	for sample in samples:
		date = sample['Date']
		if date is None or date == 0:
			continue
		region = get_sample_region(sample)
		if region is None:
			continue
		group_name = get_group_name(region, date)
		sample_groups[group_name].append(sample['Poseidon_ID'])
	return sample_groups


def keep_large_groups(sample_groups, min_group_size):
	return {
		group_name: sample_ids
		for group_name, sample_ids in sample_groups.items()
		if len(sample_ids) >= min_group_size
	}


def convert_groups_to_populations(sample_groups):
	population_entries = []
	for group_name in sorted(sample_groups):
		population_entries.append({
			'population': f'aDNA {group_name}',
			'aadr_population': get_aadr_population_name(group_name),
			'dataset': 'AADR',
		})
	return population_entries


def get_sample_group_names(sample_groups):
	sample_group_names = {}
	for group_name, sample_ids in sample_groups.items():
		aadr_population = get_aadr_population_name(group_name)
		for sample_id in sample_ids:
			sample_group_names[sample_id] = aadr_population
	return sample_group_names


def update_group_names(samples, sample_group_names):
	updated_samples = []
	for sample in samples:
		updated_sample = sample.copy()
		sample_id = sample['Poseidon_ID']
		if sample_id in sample_group_names:
			updated_sample['Group_Name'] = sample_group_names[sample_id]
		updated_samples.append(updated_sample)
	return updated_samples


def generate_adna_populations(metadata_records, population_entries, min_group_size):
	sample_groups = keep_large_groups(group_samples(metadata_records), min_group_size)
	adna_population_entries = convert_groups_to_populations(sample_groups)
	sample_group_names = get_sample_group_names(sample_groups)
	updated_metadata = update_group_names(metadata_records, sample_group_names)
	updated_populations = population_entries + adna_population_entries
	return updated_metadata, updated_populations


# ---------------------------------------------------------------------------
# pipeline entry point
# ---------------------------------------------------------------------------

def build(metadata_path, populations_path, output_dir, min_group_size):
	metadata = load_json(metadata_path)
	populations = load_json(populations_path)

	populations = apply_population_display_names(populations)

	metadata = add_regions(metadata)
	metadata = snap_group_names_to_populations(metadata, populations)
	metadata = simplify_metadata(metadata)
	populations = validate_population_coverage(populations, metadata)

	metadata, populations = generate_adna_populations(metadata, populations, min_group_size)
	populations = validate_population_coverage(populations, metadata)

	output_dir = Path(output_dir)
	output_dir.mkdir(parents=True, exist_ok=True)
	metadata_out = output_dir / 'Poseidon_AADR_v62_metadata.json'
	populations_out = output_dir / 'modern_populations.json'
	save_json(metadata, metadata_out)
	save_json(populations, populations_out)
	print(f'Wrote {len(metadata)} samples to {metadata_out}')
	print(f'Wrote {len(populations)} populations to {populations_out}')


def main():
	parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
	parser.add_argument('--metadata', required=True, help='Path to Poseidon_AADR_v62_metadata_ORIGINAL.json')
	parser.add_argument('--populations', required=True, help='Path to modern_populations_ORIGINAL.json')
	parser.add_argument('--output-dir', required=True, help='Directory to write the deployable assets to')
	parser.add_argument('--min-group-size', type=int, default=15, help='Minimum sample count for an aDNA population (default: 15)')
	args = parser.parse_args()
	build(args.metadata, args.populations, args.output_dir, args.min_group_size)


if __name__ == '__main__':
	main()
