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
		if 'region_signal' not in mod.__dict__:
			raise RuntimeError('region_signal() not found in analysis script')
		return mod.region_signal(job)
	except Exception as err:
		print('Failed to load or execute analysis script:')
		print(traceback.format_exc())
		print(err)
		return None


def get_cors_headers(event):
	'''Return CORS headers for browser requests.'''
	return {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type',
		'Content-Type': 'application/json'
	}


def main(job):
	'''Execute analysis and return result directly.'''
	result = deploy_analysis_script(job)
	if result is None:
		raise Exception('Analysis script returned no result.')
	return result


def lambda_handler(event, context):
	if event.get('httpMethod') == 'OPTIONS':
		return {'statusCode': 200, 'headers': get_cors_headers(event), 'body': ''}
	
	job = json.loads(event.get('body', '{}'))
	
	try:
		result = main(job)
		return {
			'statusCode': 200,
			'headers': get_cors_headers(event),
			'body': json.dumps(result)
		}
	except Exception as err:
		print(traceback.format_exc())
		print(err)
		return {
			'statusCode': 500,
			'headers': get_cors_headers(event),
			'body': json.dumps({'error': str(err)})
		}
