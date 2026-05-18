import os
import json
import uuid
import boto3
from pathlib import Path
import numpy as np
import pandas as pd
from bed_reader import open_bed, to_bed


cache_dir = '/tmp'
s3_client = boto3.client('s3')

_bed_cache = {}
_bim_cache = {}
_meta_cache = {}


def _aws_cloud_options():
	'''
	Return AWS credentials/region in the form expected by bed_reader (fsspec).
	'''
	session = boto3.session.Session()
	creds = session.get_credentials()
	region = session.region_name or os.environ.get('AWS_REGION')
	if not creds:
		return {'aws_region': region} if region else {}
	frozen = creds.get_frozen_credentials()
	opts = {
		'aws_region': region,
		'aws_access_key_id': frozen.access_key,
		'aws_secret_access_key': frozen.secret_key
	}
	if frozen.token:
		opts['aws_session_token'] = frozen.token
	return opts


def save_object_local(key_name, bucket_name=os.environ['adna_bucket'], local_filename=None):
	key_saved = key_name.replace('/', '_') if not local_filename else local_filename
	local_path = f'{cache_dir}/{bucket_name}_{key_saved}'
	if os.path.isfile(local_path) and os.path.getsize(local_path) > 0:
		return local_path
	with open(local_path, 'wb') as fh:
		s3_client.download_fileobj(Bucket=bucket_name, Key=key_name, Fileobj=fh)
	return local_path


def read_index(path):
	with open(path) as fh:
		line = fh.readline().strip()
	if not line:
		raise ValueError(f'Index file is empty: {path}')
	parts = line.split()
	if len(parts) != 2:
		raise ValueError(f'Index file malformed (expected two numbers): {path}')
	return tuple(map(int, parts))


def _get_bim(meta):
	'''
	Load the BIM file associated with a BED prefix or with a meta-dict.

	The file is parsed once per unique md5sum.  A copy is cached on disk
	as  /tmp/bim_<md5>.bim  so later Lambda invocations that reuse the same
	container avoid a second S3 download.
	'''
	md5sum = meta.bim_md5
	if md5sum in _bim_cache:
		return _bim_cache[md5sum]
	local_path = save_object_local(meta.bim_path, local_filename=f'bim_{md5sum}.bim')
	df = pd.read_csv(local_path, sep='\t', names=['chr', 'rsid', 'pos'], usecols=[0, 1, 3])
	_bim_cache[md5sum] = df
	return df


def _choose_orientation(variant_count, sample_count, req_variants, req_samples):
	return 'snp' if req_variants <= req_samples else 'sample'


def _open_bed(meta, orientation, threads=2, count_A1=False, bucket=os.environ['adna_bucket']):
	key = (meta.bed_prefix, orientation)
	if key in _bed_cache:
		return _bed_cache[key]
	bed_s3 = f's3://{bucket}/{meta.bed_prefix}.bed' if orientation == 'snp' \
		else f's3://{bucket}/{meta.bed_prefix}.samples.bed'
	bed = open_bed(
		bed_s3,
		sid_count=meta.variants_n,
		iid_count=meta.samples_n,
		fam_location=f's3://{bucket}/{meta.bed_prefix}.fam',
		cloud_options=_aws_cloud_options(),
		count_A1=count_A1,
		num_threads=threads
	)
	_bed_cache[key] = bed
	return bed


def _get_sample_indices(bed_file, sample_ids):
	iid = bed_file.iid
	inter = np.intersect1d(sample_ids, iid, return_indices=True)
	idx = np.array(inter[1:]).T
	idx = idx[np.argsort(idx[:, 0])]
	return idx[:, 1], sample_ids[idx[:, 0]]


def variant_indices_from_ranges(meta, variant_ranges):
	'''
	Convert ``variant_ranges`` into row indices of the BIM file.  Returned numpy array is deduplicated and sorted ascending.

	variant_range formats
	1. Single variant
	    {'variant_rsid': 'rs123'}

	2. Region / random sampling
	    {
	        'type'       : 'region',
	        'chr'        : '6',          # omit / None -> genome-wide
	        'start'      : 29600000,     # optional
	        'end'        : 33111000,     # optional
	        'variants_n' : 10000,        # 0 or missing -> take all variants
	        'random_seed': 42            # optional, for repeatable sampling
	    }
	'''
	bim = _get_bim(meta)
	selected = []
	for variant_range in variant_ranges:
		if 'variant_rsid' in variant_range:
			idx = bim.index[bim['rsid'] == variant_range['variant_rsid']]
			if not idx.empty:
				selected.append(idx[0])
			continue
		if variant_range.get('type') != 'region':
			continue

		mask = pd.Series(True, index=bim.index)
		chr_val = variant_range.get('chr')
		if chr_val is not None:
			mask &= bim['chr'].astype(str) == str(chr_val)
			if variant_range.get('start') is not None:
				mask &= bim['pos'] >= int(variant_range['start'])
			if variant_range.get('end') is not None:
				mask &= bim['pos'] <= int(variant_range['end'])
		range_idx = bim.index[mask]
		if range_idx.empty:
			continue
		variants_n = int(variant_range.get('variants_n', 0))
		if variants_n and variants_n < len(range_idx):
			rng = np.random.default_rng(variant_range.get('random_seed'))
			selected.extend(rng.choice(range_idx, variants_n, replace=False))
		else:
			selected.extend(range_idx)
	return pd.unique(np.sort(selected))


def get_canonical_bim_metadata(bed_prefixes, datasets_index='datasets_index.csv'):
	'''
	Given a list of BED prefixes return the metadata row (as pandas.Series)
	that represents the canonical BIM (the md5 that occurs most often), as
	well as all filtered metadata of loaded datasets.
	Raises KeyError if none of the prefixes are found.
	'''
	bed_datasets = pd.read_csv(save_object_local(datasets_index), delimiter='\t')
	bed_datasets.set_index('bed_prefix', inplace=True, drop=False)
	meta = bed_datasets.loc[bed_prefixes]

	canonical_md5 = meta['bim_md5'].value_counts().idxmax()
	return meta.loc[meta['bim_md5'] == canonical_md5].iloc[0], meta


def read_bed(bed_prefixes, sample_ids, variant_ranges, threads=2):
	'''
	Return genotypes for `sample_ids` and variants defined by `variant_ranges`
	across one or many BED prefixes.

	Rules
	1.	Resolve `variant_ranges` only on the BIM that occurs most often in
		`bed_prefixes` (the *canonical* BIM).
	2.	When another BED shares that BIM nothing extra is done.
	3.	When a BED has a different BIM we keep the global variant set but
		fill missing columns with NaN.
	4.	Columns are left unlabeled to save memory.
	'''
	canonical_row, bed_metadata = get_canonical_bim_metadata(bed_prefixes)

	global_variant_idx = variant_indices_from_ranges(canonical_row, variant_ranges)
	global_variant_len = len(global_variant_idx)
	canonical_bim = _get_bim(canonical_row)
	global_rsids = canonical_bim['rsid'].iloc[global_variant_idx].to_numpy()

	def matched_indices(other_bim):
		inter, pos_global, pos_local = np.intersect1d(
			global_rsids, other_bim['rsid'].to_numpy(), return_indices=True
		)
		return pos_global, pos_local

	frames, all_sample_ids = [], []
	for row in bed_metadata.itertuples(index=False):
		if row.bim_md5 == canonical_row['bim_md5']:
			local_idx = global_variant_idx
			global_pos = None
		else:
			other_bim = _get_bim(row)
			global_pos, pos_local = matched_indices(other_bim)
			if global_pos.size == 0:
				continue
			local_idx = other_bim.index[pos_local].to_numpy()

		orientation = _choose_orientation(
			row.variants_n, row.samples_n,
			len(local_idx), len(sample_ids)
		)

		bed = _open_bed(row, orientation, threads=threads)

		sample_idx, sample_ids_present = _get_sample_indices(bed, sample_ids)
		if sample_idx.size == 0:
			continue

		part = bed.read(index=np.s_[sample_idx, local_idx])

		if global_pos is None:
			target = part
		else:
			target = np.full((part.shape[0], global_variant_len), np.nan, dtype=np.float32)
			target[:, global_pos] = part

		frames.append(target)
		all_sample_ids.extend(sample_ids_present)

	if not frames:
		return pd.DataFrame(np.empty((0, global_variant_len), dtype=np.float32))

	genotypes = np.vstack(frames)
	return pd.DataFrame(genotypes, index=all_sample_ids)


def write_bed(genotype_df, out_prefix=None, count_A1=False):
	'''
	Write the genotype DataFrame produced by read_bed to /tmp as
	a PLINK .bed/.bim/.fam set.

	Parameters
	----------
	genotype_df : pandas.DataFrame
		index   -> sample IDs (order is preserved)
		columns -> variants (unlabelled, any dtype convertible to float32)
	out_prefix : str | pathlib.Path | None
		Directory + basename for the output without extension.
		Defaults to a unique path under /tmp.
	count_A1   : bool
		Passes straight to bed_reader.to_bed (True = PLINK default, False = AADR orientation).

	Returns
	-------
	str
		Prefix path (without extension) of the written files.
	'''

	if out_prefix is None:
		out_prefix = Path('/tmp') / f'emu_{uuid.uuid4().hex}'
	else:
		out_prefix = Path(out_prefix)
	out_bed = str(out_prefix.with_suffix('.bed'))

	values = genotype_df.to_numpy(dtype=np.float32, copy=False)

	variant_count = values.shape[1]
	variant_ids  = [f'v{i}' for i in range(variant_count)]

	properties = {
		'iid'        : genotype_df.index.tolist(),
		'sid'        : [f'v{i}'   for i in range(variant_count)]
	}

	to_bed(
		filepath = out_bed,
		val = values,
		properties = properties,
		count_A1 = count_A1
	)

	return str(out_prefix)
