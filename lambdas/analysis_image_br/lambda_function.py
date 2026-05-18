import os
import json
import zlib
import base64
import math
import types
import traceback
import numpy as np
import boto3
from io import BytesIO


def deploy_analysis_script(job):
	'''
	Download the analysis script specified by job['type'], load it as a
	module, run its run_analysis(options) function, and return the result.
	'''
	analysis_type = job['params']['type']
	analysis_bucket = os.environ['analysis_bucket']
	script_key = f'analyses/{analysis_type}.py'
	session = boto3.session.Session()
	s3 = session.client('s3')
	try:
		resp = s3.get_object(Bucket=analysis_bucket, Key=script_key)
		source = resp['Body'].read()
		source = source.decode('utf-8') if isinstance(source, bytes) else source
		mod = types.ModuleType(f'analysis_{analysis_type}')
		code = compile(source, script_key, 'exec')
		exec(code, mod.__dict__)
		if 'run_analysis' not in mod.__dict__:
			raise RuntimeError('run_analysis() not found in analysis script')
		return mod.run_analysis(job)
	except Exception as err:
		print('Failed to load or execute analysis script:')
		print(traceback.format_exc())
		print(err)
		return None


def load_job_from_s3(bucket, job_uid):
	'''Retrieve a job description from S3.'''
	session = boto3.session.Session()
	s3_client = session.client('s3')
	try:
		response = s3_client.get_object(Bucket=bucket, Key=f'jobs/{job_uid}')
		data = response['Body'].read()
		return json.loads(data.decode('utf-8'))
	except Exception as err:
		print(f'Failed to load job from S3: {err}')
		return None


def save_result_to_s3(bucket, key, data):
	'''Upload job results to S3.'''
	session = boto3.session.Session()
	s3_client = session.client('s3')
	try:
		return s3_client.put_object(Bucket=bucket, Key=key, Body=data)
	except Exception as err:
		print(f'Failed to save object to S3: {err}')
		return None


def main(job_uid):
	'''Orchestrate job loading, execution, and result storage.'''
	results_bucket = os.environ['results_bucket']
	job = load_job_from_s3(results_bucket, job_uid)
	if job is None:
		raise Exception('Job could not be loaded.')
	result = deploy_analysis_script(job)
	return save_result_to_s3(results_bucket, f'results/{job_uid}.json', json.dumps(result))


def lambda_handler(event, context):
	job_uid = event['job_uid']
	try:
		return main(job_uid)
	except Exception as err:
		print(traceback.format_exc())
		print(err)
		return None
