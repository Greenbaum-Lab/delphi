import io
import os
import requests
import numpy as np
import pandas as pd
import boto3
from botocore.exceptions import ClientError
from br_wrapper import save_object_local

s3_client = boto3.client('s3')


def load_pgs_from_csv(url):
	buf = io.BytesIO(requests.get(url, timeout=60).content)
	comp = 'gzip' if url.endswith('.gz') else None

	head = pd.read_csv(buf, sep='\t', comment='#', compression=comp, nrows=0)
	if 'rsID' in head.columns:
		labels = ['rsID', 'effect_allele', 'effect_weight']
	else:
		labels = ['chr_name', 'chr_position', 'effect_allele', 'effect_weight']

	buf.seek(0)
	df = pd.read_csv(
		buf,
		sep='\t',
		comment='#',
		compression=comp,
		usecols=labels,
		dtype=str
	)
	df['effect_weight'] = df['effect_weight'].astype(float)
	return df, labels


def load_bim(path):
	return pd.read_csv(
		path,
		sep=r'\s+',
		header=None,
		usecols=[0, 1, 3, 4, 5],
		names=['chrom', 'rsid', 'bp', 'allele1', 'allele2'],
		dtype=str
	)


def match_by_rsid(pgs, bim):
	pgs = pgs[~pgs['rsID'].isna()]
	bim_idx = bim.reset_index()

	m1 = pgs.merge(
		bim_idx,
		left_on=['rsID', 'effect_allele'],
		right_on=['rsid', 'allele1'],
		how='inner'
	)
	m1['allele_code'] = 0

	m2 = pgs.merge(
		bim_idx,
		left_on=['rsID', 'effect_allele'],
		right_on=['rsid', 'allele2'],
		how='inner'
	)
	m2['allele_code'] = 1

	merged = pd.concat(
		[m1[['index', 'effect_weight', 'allele_code']],
		 m2[['index', 'effect_weight', 'allele_code']]],
		ignore_index=True
	)

	arr = merged.to_numpy(np.float64)
	arr = arr[arr[:, 0].argsort()]
	return arr


def match_by_pos(pgs, bim):
	bim_idx = bim.reset_index()

	m1 = pgs.merge(
		bim_idx,
		left_on=['chr_name', 'chr_position', 'effect_allele'],
		right_on=['chrom', 'bp', 'allele1'],
		how='inner'
	)
	m1['allele_code'] = 0

	m2 = pgs.merge(
		bim_idx,
		left_on=['chr_name', 'chr_position', 'effect_allele'],
		right_on=['chrom', 'bp', 'allele2'],
		how='inner'
	)
	m2['allele_code'] = 1

	merged = pd.concat(
		[m1[['index', 'effect_weight', 'allele_code']],
		 m2[['index', 'effect_weight', 'allele_code']]],
		ignore_index=True
	)

	arr = merged.to_numpy(np.float64)
	arr = arr[arr[:, 0].argsort()]
	return arr


def get_cached_pgs_numpy(bim_md5, pgs_id, bucket=os.environ['adna_bucket'], prefix='pgs_cache/'):
	'''
	Try to load a cached NumPy array for the requested (bim_md5, pgs_id) from S3.
	Returns the array or None if the object does not exist.
	'''
	key = f'{prefix}{bim_md5}_{pgs_id}.npy'
	try:
		local_path = save_object_local(key, bucket)
	except ClientError:
		return None
	return np.load(local_path, allow_pickle=False)


def save_result_to_s3(bucket, key, data_bytes):
	s3_client.put_object(Bucket=bucket, Key=key, Body=data_bytes)


def save_pgs_numpy_to_s3(arr, bim_md5, pgs_id, bucket=os.environ['adna_bucket'], prefix='pgs_cache/'):
	'''
	Serialize `arr` to .npy bytes and upload to S3 using (bim_md5, pgs_id) key.
	'''
	buffer = io.BytesIO()
	np.save(buffer, arr, allow_pickle=False)
	buffer.seek(0)
	key = f'{prefix}{bim_md5}_{pgs_id}.npy'
	save_result_to_s3(bucket, key, buffer.getvalue())


def process_pgs(bim_filepath, bim_md5, pgs_id):
	'''
	Main entry point: return array [[bim_index, weight, allele_code], ...].
	Caches result keyed by (bim_md5, pgs_id).
	'''
	cached = get_cached_pgs_numpy(bim_md5, pgs_id)
	if cached is not None:
		return cached

	pgs_url = f'https://ftp.ebi.ac.uk/pub/databases/spot/pgs/scores/{pgs_id}/ScoringFiles/{pgs_id}.txt.gz'
	pgs_df, labels = load_pgs_from_csv(pgs_url)
	bim_df = load_bim(bim_filepath)

	if 'rsID' in labels:
		result = match_by_rsid(pgs_df, bim_df)
	else:
		result = match_by_pos(pgs_df, bim_df)

	save_pgs_numpy_to_s3(result, bim_md5, pgs_id)
	return result
