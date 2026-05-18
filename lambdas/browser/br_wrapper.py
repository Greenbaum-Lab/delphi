import os
import json
import uuid
import time
import boto3
from pathlib import Path
import numpy as np
import pandas as pd
from bed_reader import open_bed, to_bed


cache_dir = '/tmp'
s3_client = boto3.client('s3')

_bed_cache = {}
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
	Return (indices, positions) for variants across multiple ranges.
	Uses pre-binned chromosome files for O(1) lookup.
	'''
	binned_prefix = meta.bim_path.replace('.bim', '')
	
	all_indices = []
	all_positions = []
	
	for variant_range in variant_ranges:
		chrom = variant_range['chr']
		start = variant_range['start']
		end = variant_range['end']
		
		binned_path = f'{binned_prefix}.chr{chrom}.bins.npz'
		local_path = save_object_local(binned_path)
		data = np.load(local_path, allow_pickle=True)
		
		bin_size = int(data['bin_size'])
		start_bin = start // bin_size
		end_bin = end // bin_size
		
		print(start_bin, end_bin, bin_size)
		
		indices = np.concatenate(data['indices'][start_bin:end_bin + 1])
		positions = np.concatenate(data['positions'][start_bin:end_bin + 1])
		
		all_indices.append(indices)
		all_positions.append(positions)
	
	return np.concatenate(all_indices), np.concatenate(all_positions)


def get_canonical_bim_metadata(bed_prefixes, datasets_index='delphi_datasets.csv'):
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


def read_bed(bed_prefixes, sample_ids, variant_ranges, threads=2, bed_orientation=None):
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
	t0 = time.time()
	canonical_row, bed_metadata = get_canonical_bim_metadata(bed_prefixes)
	print(f'Time to get canonical BIM metadata: {time.time() - t0:.4f}s')

	t1 = time.time()
	global_variant_idx, positions = variant_indices_from_ranges(canonical_row, variant_ranges)
	global_variant_len = len(global_variant_idx)
	print(f'Time to resolve variant ranges: {time.time() - t1:.4f}s ({global_variant_len} variants)')

	frames, all_sample_ids = [], []
	for row in bed_metadata.itertuples(index=False):
		t2 = time.time()
		orientation = bed_orientation if bed_orientation != None else _choose_orientation(
			row.variants_n, row.samples_n,
			len(global_variant_idx), len(sample_ids)
		)
		orientation = orientation if orientation in row.orientations.split(',') else 'snp'
		bed = _open_bed(row, orientation, threads=threads)
		print(f'Time to open BED ({row.bed_prefix}, {orientation}): {time.time() - t2:.4f}s')

		t2a = time.time()
		sample_idx, sample_ids_present = _get_sample_indices(bed, sample_ids)
		print(f'Time to get sample indices: {time.time() - t2a:.4f}s ({len(sample_idx)} samples)')
		if sample_idx.size == 0 or global_variant_idx.size == 0:
			continue

		t2b = time.time()
		part = bed.read(index=np.s_[sample_idx, global_variant_idx])
		print(f'Time to read genotypes: {time.time() - t2b:.4f}s (shape: {part.shape})')

		frames.append(part)
		all_sample_ids.extend(sample_ids_present)

	if not frames:
		print(f'No data read, returning empty DataFrame')
		return pd.DataFrame(np.empty((0, global_variant_len), dtype=np.float32), columns=positions)

	t3 = time.time()
	genotypes = np.vstack(frames)
	print(f'Time to vstack frames: {time.time() - t3:.4f}s')
	t4 = time.time()
	result = pd.DataFrame(genotypes, index=all_sample_ids, columns=positions)
	print(f'Time to create DataFrame: {time.time() - t4:.4f}s')

	missing_samples = np.setdiff1d(sample_ids, all_sample_ids)
	if missing_samples.size > 0:
		nan_rows = pd.DataFrame(np.nan, index=missing_samples, columns=positions)
		result = pd.concat([result, nan_rows])

	print(f'Total read_bed time: {time.time() - t0:.4f}s')
	return result


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
