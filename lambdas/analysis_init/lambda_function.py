import json
import boto3
import random
import os

def generate_unique_id():
	return ''.join(random.choices('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', k=16))

def upload_job_to_s3(bucket, job_uid, job_string):
	s3_client = boto3.client('s3')
	return s3_client.put_object(Bucket=bucket, Key=f'jobs/{job_uid}', Body=job_string)

def invoke_processing_lambda(job_uid, origin):
	lambda_client = boto3.client('lambda')
	analysis_lambda_name = os.environ.get('analysis_lambda_beta') if origin == 'https://adna.modelrxiv.org' else os.environ.get('analysis_lambda')
	lambda_client.invoke(
		FunctionName=analysis_lambda_name,
		InvocationType='Event',
		Payload=json.dumps({
			'job_uid': job_uid
		})
	)

def get_cors_headers(event, allowed_origins, default_origin = 'https://dora.modelrxiv.org'):
	origin = event.get('headers', {}).get('Origin', '*')
	if origin not in allowed_origins:
		origin = default_origin
	return {
		'Access-Control-Allow-Origin': origin,
		'Access-Control-Allow-Headers': 'Content-Type',
		'Access-Control-Allow-Methods': 'OPTIONS,POST',
		'Access-Control-Allow-Credentials': True
	}

def create_response(event, allowed_origins, body, status_code):
	return {
		'statusCode': status_code,
		'headers': get_cors_headers(event, allowed_origins),
		'body': json.dumps(body)
	}

def lambda_handler(event, context):
	try:
		allowed_origins = ['https://dora.modelrxiv.org', 'https://adna.modelrxiv.org']
		origin = event.get('headers', {}).get('Origin', '*')
		job_string = event.get('body', '{}')
		job_uid = generate_unique_id()
		upload_job_to_s3(os.environ.get('results_bucket'), job_uid, job_string)
		invoke_processing_lambda(job_uid, origin)
		return create_response(event, allowed_origins, {'job_uid': job_uid}, 200)
	except Exception as e:
		print(f"An error occurred: {e}")
		return create_response(event, allowed_origins, {"error": "Bad request"}, 400)
