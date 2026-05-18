import boto3
import json
import os
import re
import math
import gzip
import numpy as np
from io import BytesIO, StringIO

s3_client = boto3.client('s3')

def get_s3_object(bucket, key):
    response = s3_client.get_object(Bucket=bucket, Key=key)
    if response.get('ContentEncoding') == 'gzip':
        gzip_file = gzip.GzipFile(fileobj=BytesIO(response['Body'].read()))
        content = gzip_file.read().decode('utf-8')
    else:
        content = response['Body'].read().decode('utf-8')
    return content

class ValueFromCoordFile:
    def __init__(self):
        self.cache = {}

    def get_value(self, data, long, lat, year, n=4):
        cache_key = f"{long}_{lat}_{year}"
        if cache_key in self.cache:
            return self.cache[cache_key]

        if not data:
            return 'null'

        data_array = np.array(data)
        longs = data_array[:, 0]
        lats = data_array[:, 1]
        values = data_array[:, 2]

        distances = np.sqrt((longs - long) ** 2 + (lats - lat) ** 2)

        closest_indices = np.argsort(distances)[:n]

        value = np.mean(values[closest_indices])
        self.cache[cache_key] = value
        return value

def compile_metadata_from_samples(bucket_name, index):
    all_samples_data = []
    for file_key, file_info in index.items():
        if file_info.get('file_type') == 'samples':
            samples_content = get_s3_object(bucket_name, f"{file_key}.samples")
            samples_data = json.loads(samples_content)
            all_samples_data.extend(samples_data)
    return all_samples_data

def list_files_in_s3_bucket(bucket, prefix):
    response = s3_client.list_objects_v2(Bucket=bucket, Prefix=prefix)
    return [item['Key'] for item in response.get('Contents', [])]

def process_files_in_bucket(bucket_name, index, directory):
    for file_key in list_files_in_s3_bucket(bucket_name, directory):
        if file_key in index:
            continue  # Skip if file is already in the index
        try:
            file_info, file_content = process_file(bucket_name, directory, file_key, index)
            if file_info:
                update_index_and_upload_file(bucket_name, file_key, index, file_info, file_content)
        except Exception as e:
            print(f"Error processing file {file_key}: {e}")

def process_file(bucket, directory, file_key, index):
    file_extension = os.path.splitext(file_key)[1]
    match file_extension:
        case '.anno':
            return process_anno_file(bucket, directory, file_key)
        case '.csv' | '.tsv':
            return process_csv_tsv_file(bucket, directory, file_key)
        case '.bed':
            return process_bed_file(bucket, directory, file_key)
        case '.bim':
            return process_bim_file(bucket, directory, file_key)
        case '.fam':
            return process_fam_file(bucket, directory, file_key)
        case '.Q':
            return process_admx_file(bucket, directory, file_key)
        case '.coords':
            return process_coords_file(bucket, directory, file_key, index)
        case _:
            raise Exception("Unsupported file type")

def process_bed_file(bucket, directory, file_key):
    ## Somewhat wasteful but for the moment load the fam/bim files to count the lines
    if file_key.find('.samples.bed') != -1:
        raise Exception("Ignoring sample-major bed file")
    fam_file_key = re.sub(r'\.bed$', '.fam', file_key)
    bim_file_key = re.sub(r'\.bed$', '.bim', file_key)
    try:
        fam_file_content = get_s3_object(bucket, fam_file_key)
        bim_file_content = get_s3_object(bucket, bim_file_key)
    except Exception as e:
        raise Exception("Could not find associated fam/bim files for BED file")
    variants = len(bim_file_content.split('\n')) - 1
    samples = len(fam_file_content.split('\n')) - 1
    return {'label': file_key.replace(directory, '').replace('.bed', ''), 'file_name': file_key, 'file_type': 'bed', 'file_extension': 'bed', 'shape': [variants, samples]}, None

def process_bim_file(bucket, directory, file_key):
    file_content = get_s3_object(bucket, file_key)
    return {'label': file_key.replace(directory, '').replace('.bim', ''), 'file_name': file_key, 'file_type': 'bim', 'file_extension': 'bim', 'shape': [len(file_content.split('\n')) - 1]}, None

def process_fam_file(bucket, directory, file_key):
    file_content = get_s3_object(bucket, file_key)
    return {'label': file_key.replace(directory, '').replace('.fam', ''), 'file_name': file_key, 'file_type': 'fam', 'file_extension': 'fam', 'shape': [len(file_content.split('\n')) - 1]}, None

def process_admx_file(bucket, directory, file_key):
    fam_file_key = re.sub(r'\.[0-9]+\.Q$', '.fam', file_key)
    try:
        fam_file_content = get_s3_object(bucket, fam_file_key)
    except Exception as e:
        raise Exception("Could not find associated fam files for Q file")
    fam_ids = np.loadtxt(StringIO(fam_file_content), delimiter=' ', dtype=str)[:,1]
    file_content = get_s3_object(bucket, file_key)
    ancestry_components = np.loadtxt(StringIO(file_content), delimiter=' ')
    k = ancestry_components.shape[1]
    data = {fam_id: ancestry_components[i].tolist() for i, fam_id in enumerate(fam_ids)}
    return {'label': f"{file_key.replace(directory, '').replace(f'.{k}.Q', '')} (K={k})", 'file_name': f'{file_key}.q', 'file_type': 'q', 'file_extension': 'q', 'shape': [ancestry_components.shape[0]]}, json.dumps(data)

def process_anno_file(bucket, directory, file_key):
    file_content = get_s3_object(bucket, file_key)
    lines = [line.split('\t') for line in file_content.split('\n') if line]
    data = [{
        'sample_id': line[1],
        'bed_id': line[0],
        'date': int(line[9]),
        'study': line[5],
        'doi': line[6],
        'repository': line[7],
        'country': line[15],
        'lat': np.round(float(line[16]), 2),
        'long': np.round(float(line[17]), 2),
        'sex': line[24],
        'snps': line[22],
        'coverage': np.round(float(line[22]) / 1233014, 3),
        'qc': line[40]
    } for line in lines[1:] if line[16] != '..']
    return {'label': file_key.replace(directory, '').replace('.anno', ''), 'file_name': f'{file_key}.samples', 'file_type': 'samples', 'file_extension': 'anno', 'shape': [len(lines) - 1]}, json.dumps(data)

def process_csv_tsv_file(bucket, directory, file_key):
    file_content = get_s3_object(bucket, file_key)
    lines = [line.split('\t') for line in file_content.split('\n') if line]
    cols = lines[0]
    data = [{'sample_id': line[0], **dict(zip(cols[1:], line[1:]))} for line in lines[1:]]
    return {'label': re.sub(r'\.(csv|tsv)$', '', file_key.replace(directory, '')), 'file_name': f'{file_key}.samples', 'file_type': 'samples', 'file_extension': 'csv', 'shape': [len(lines) - 1]}, json.dumps(data)

def process_coords_file(bucket, directory, file_key, index):
    metadata = compile_metadata_from_samples(bucket, index)
    file_content = get_s3_object(bucket, file_key)
    coords_data_years = {}
    for line in file_content.split('\n')[1:]:
        if line:
            long, lat, year, value = map(float, re.split('[\t ]+', line))
            year = round(year)
            if year not in coords_data_years:
                coords_data_years[year] = []
            coords_data_years[year].append([long, lat, value])
    extractor = ValueFromCoordFile()
    data = {entry['sample_id']: extractor.get_value(coords_data_years[math.ceil(entry['date'] / 1000) * 1000], entry['long'], entry['lat'], math.ceil(entry['date'] / 1000) * 1000) for entry in metadata if (math.ceil(entry['date'] / 1000) * 1000) in coords_data_years}
    return {'label': file_key.replace(directory, '').replace('.coords', ''), 'file_name': f'{file_key}.col', 'file_type': 'col', 'file_extension': 'coords', 'shape': [len(data)]}, json.dumps(data)

def update_index_and_upload_file(bucket, file_key, index, file_info, file_content):
    if file_content:
        new_file_key = f"{file_key}.{file_info['file_type']}"
        s3_client.put_object(Bucket=bucket, Key=new_file_key, Body=file_content)
    index[file_key] = file_info

def save_index_to_s3(bucket, index_key, index):
    s3_client.put_object(Bucket=bucket, Key=index_key, Body=json.dumps(index))

def load_index_from_s3(bucket, index_key):
    try:
        file_content = get_s3_object(bucket, index_key)
        return json.loads(file_content)
    except s3_client.exceptions.NoSuchKey:
        return {} # Return an empty index if the index file doesn't exist

def lambda_handler(event, context):
    bucket_name = 'adna.db'
    directory = 'public_new/'
    index_key = os.path.join(directory, 'index.list')
    index_data = load_index_from_s3(bucket_name, index_key)
    process_files_in_bucket(bucket_name, index_data, directory)
    save_index_to_s3(bucket_name, index_key, index_data)
    return {}
