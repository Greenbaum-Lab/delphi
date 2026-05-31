import json
from pathlib import Path

FIELDS_TO_KEEP = [
    "Poseidon_ID",
    "Group_Name",
    "Country",
    "Location",
    "Region",
    "date",
    "Latitude",
    "Longitude",
    "Genetic_Sex",
    "chelsa_pc1",
    "chelsa_pc2",
    "ag_urbanization",
    "ag_foraging",
    "ag_extensive_agriculture",
    "ag_intensive_agriculture",
    "ag_pastoralism",
    "ukb_pc1",
    "ukb_pc2",
]

RENAME_MAP = {
    "date": "Date",
    "chelsa_pc1": "Temperature_index",
    "chelsa_pc2": "Precipitation_index",
    "ag_urbanization": "Urbanization_onset",
    "ag_foraging": "Foraging_onset",
    "ag_extensive_agriculture": "Agriculture_extensiveness",
    "ag_intensive_agriculture": "Agriculture_intensity",
    "ag_pastoralism": "Pastoralism_onset",
    "ukb_pc1": "Genetic_distance_PC1",
    "ukb_pc2": "Genetic_distance_PC2",
}

def load_json_records(path):
    path = Path(path)
    text = path.read_text(encoding="utf-8").strip()
    if text.startswith("["):
        return json.loads(text)
    return [json.loads(line) for line in text.splitlines() if line.strip()]
def write_json_records(records, path):
    Path(path).write_text(json.dumps(records, indent=2, ensure_ascii=False), encoding="utf-8")
def keep_fields(record, fields):
    return {field: record.get(field) for field in fields}
def rename_fields(record, rename_map):
    return {rename_map.get(key, key): value for key, value in record.items()}

def simplify_metadata(records, fields, rename_map):
    simplified = []
    for record in records:
        filtered = keep_fields(record, fields)
        renamed = rename_fields(filtered, rename_map)
        simplified.append(renamed)
    return simplified

def main():
    input_path = "/home/lab2/Downloads/annotation_hg19/Poseidon_AADR_v62_metadata_withregion.json"
    output_path = "/home/lab2/Downloads/annotation_hg19/Poseidon_AADR_v62_metadata.json"
    records = load_json_records(input_path)
    records = simplify_metadata(records, FIELDS_TO_KEEP, RENAME_MAP)
    write_json_records(records, output_path)
    print(f"Saved {len(records)} records to {output_path}")

if __name__ == "__main__":
    main()
