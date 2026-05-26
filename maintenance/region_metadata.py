import json
from pathlib import Path
REGION_BY_GROUP = {
    "BantuKenya": "Africa",
    "BantuSA": "Africa",
    "Biaka": "Africa",
    "Mandenka": "Africa",
    "Mbuti": "Africa",
    "Ju_hoan_North": "Africa",
    "Yoruba": "Africa",
    "ASW": "Africa",
    "ACB": "Africa",
    "ESN": "Africa",
    "GWD": "Africa",
    "LWK": "Africa",
    "MSL": "Africa",
    "YRI": "Africa",
    "BedouinA": "Middle East",
    "Druze": "Middle East",
    "Mozabite": "Middle East",
    "Palestinian": "Middle East",
    "Adygei": "Europe",
    "Basque": "Europe",
    "Bergamo": "Europe",
    "French": "Europe",
    "Orcadian": "Europe",
    "Russian": "Europe",
    "Sardinian": "Europe",
    "Italian_North": "Europe",
    "CEU": "Europe",
    "FIN": "Europe",
    "GBR": "Europe",
    "IBS": "Europe",
    "TSI": "Europe",
    "Balochi": "Central/South Asia",
    "Brahui": "Central/South Asia",
    "Burusho": "Central/South Asia",
    "Hazara": "Central/South Asia",
    "Kalash": "Central/South Asia",
    "Makrani": "Central/South Asia",
    "Pathan": "Central/South Asia",
    "Sindhi_Pakistan": "Central/South Asia",
    "Uyghur": "Central/South Asia",
    "BEB": "Central/South Asia",
    "GIH": "Central/South Asia",
    "ITU": "Central/South Asia",
    "PJL": "Central/South Asia",
    "STU": "Central/South Asia",
    "Cambodian": "East Asia",
    "Dai": "East Asia",
    "Daur": "East Asia",
    "Han": "East Asia",
    "Hezhen": "East Asia",
    "Japanese": "East Asia",
    "China_Lahu": "East Asia",
    "Miao": "East Asia",
    "Mongola": "East Asia",
    "Naxi": "East Asia",
    "NorthernHan": "East Asia",
    "Oroqen": "East Asia",
    "She": "East Asia",
    "Tu": "East Asia",
    "Tujia": "East Asia",
    "Xibo": "East Asia",
    "Yakut": "East Asia",
    "Yi": "East Asia",
    "CDX": "East Asia",
    "CHB": "East Asia",
    "CHS": "East Asia",
    "JPT": "East Asia",
    "KHV": "East Asia",
    "Nasioi": "Oceania",
    "PapuanHighlands": "Oceania",
    "PapuanSepik": "Oceania",
    "Piapoco": "America",
    "Karitiana": "America",
    "Mayan": "America",
    "Pima": "America",
    "Surui": "America",
    "CLM": "America",
    "MXL": "America",
    "PEL": "America",
    "PUR": "America",
}
REGION_BY_COUNTRY_ISO = {
    "DZ": "Africa", "AO": "Africa", "BJ": "Africa", "BW": "Africa", "BF": "Africa", "BI": "Africa", "CM": "Africa", "CV": "Africa", "CF": "Africa", "TD": "Africa", "KM": "Africa", "CG": "Africa", "CD": "Africa", "CI": "Africa", "DJ": "Africa", "EG": "Africa", "GQ": "Africa", "ER": "Africa", "SZ": "Africa", "ET": "Africa", "GA": "Africa", "GM": "Africa", "GH": "Africa", "GN": "Africa", "GW": "Africa", "KE": "Africa", "LS": "Africa", "LR": "Africa", "LY": "Africa", "MG": "Africa", "MW": "Africa", "ML": "Africa", "MR": "Africa", "MU": "Africa", "MA": "Africa", "MZ": "Africa", "NA": "Africa", "NE": "Africa", "NG": "Africa", "RW": "Africa", "ST": "Africa", "SN": "Africa", "SC": "Africa", "SL": "Africa", "SO": "Africa", "ZA": "Africa", "SS": "Africa", "SD": "Africa", "TZ": "Africa", "TG": "Africa", "TN": "Africa", "UG": "Africa", "ZM": "Africa", "ZW": "Africa",
    "AL": "Europe", "AD": "Europe", "AT": "Europe", "BY": "Europe", "BE": "Europe", "BA": "Europe", "BG": "Europe", "HR": "Europe", "CY": "Europe", "CZ": "Europe", "DK": "Europe", "EE": "Europe", "FI": "Europe", "FR": "Europe", "DE": "Europe", "GR": "Europe", "HU": "Europe", "IS": "Europe", "IE": "Europe", "IT": "Europe", "XK": "Europe", "LV": "Europe", "LI": "Europe", "LT": "Europe", "LU": "Europe", "MT": "Europe", "MD": "Europe", "MC": "Europe", "ME": "Europe", "NL": "Europe", "MK": "Europe", "NO": "Europe", "PL": "Europe", "PT": "Europe", "RO": "Europe", "SM": "Europe", "RS": "Europe", "SK": "Europe", "SI": "Europe", "ES": "Europe", "SE": "Europe", "CH": "Europe", "UA": "Europe", "GB": "Europe",
    "BH": "Middle East", "IQ": "Middle East", "IL": "Middle East", "JO": "Middle East", "KW": "Middle East", "LB": "Middle East", "OM": "Middle East", "PS": "Middle East", "QA": "Middle East", "SA": "Middle East", "SY": "Middle East", "TR": "Middle East", "AE": "Middle East", "YE": "Middle East",
    "AF": "Central/South Asia", "AM": "Central/South Asia", "AZ": "Central/South Asia", "BD": "Central/South Asia", "BT": "Central/South Asia", "GE": "Central/South Asia", "IN": "Central/South Asia", "IR": "Central/South Asia", "KZ": "Central/South Asia", "KG": "Central/South Asia", "MV": "Central/South Asia", "NP": "Central/South Asia", "PK": "Central/South Asia", "LK": "Central/South Asia", "TJ": "Central/South Asia", "TM": "Central/South Asia", "UZ": "Central/South Asia",
    "CN": "East Asia", "HK": "East Asia", "JP": "East Asia", "KP": "East Asia", "KR": "East Asia", "MO": "East Asia", "MN": "East Asia", "TW": "East Asia", "BN": "East Asia", "KH": "East Asia", "ID": "East Asia", "LA": "East Asia", "MY": "East Asia", "MM": "East Asia", "PH": "East Asia", "SG": "East Asia", "TH": "East Asia", "TL": "East Asia", "VN": "East Asia",
    "AU": "Oceania", "FJ": "Oceania", "KI": "Oceania", "MH": "Oceania", "FM": "Oceania", "NR": "Oceania", "NZ": "Oceania", "PW": "Oceania", "PG": "Oceania", "WS": "Oceania", "SB": "Oceania", "TO": "Oceania", "TV": "Oceania", "VU": "Oceania",
    "AR": "America", "BO": "America", "BR": "America", "CA": "America", "CL": "America", "CO": "America", "CR": "America", "CU": "America", "DO": "America", "EC": "America", "SV": "America", "GT": "America", "GY": "America", "HT": "America", "HN": "America", "JM": "America", "MX": "America", "NI": "America", "PA": "America", "PY": "America", "PE": "America", "PR": "America", "SR": "America", "TT": "America", "US": "America", "UY": "America", "VE": "America",
    "BB": "Africa",    "LC": "America",
    "SH": "Africa", "BS": "America",     "BZ": "America",       "RU": "Europe",         "JE": "Europe",
    "CW": "America",    "FO": "Europe",      "PF": "Oceania",       "GI": "Europe",     "GL": "America",        "GP": "America",
    "NA": "Africa",   "BW": "Africa",
}

def normalize_group_name(group_name):
    if group_name is None:
        return None
    group = str(group_name).split(".")[0]
    if group.startswith("Ignore_"):
        group = group[len("Ignore_"):]
    if "(" in group:
        group = group.split("(")[0]
    for suffix in ["_o1", "_o2", "_o3", "_o", "_lc"]:
        if group.endswith(suffix):
            group = group[: -len(suffix)]
    return group

def load_metadata(path):
    path = Path(path)
    text = path.read_text(encoding="utf-8").strip()
    if text.startswith("["):
        return json.loads(text)
    return [json.loads(line) for line in text.splitlines() if line.strip()]

def write_metadata(records, path):
    Path(path).write_text(json.dumps(records, indent=2, ensure_ascii=False), encoding="utf-8")

def add_regions(records):
    missing = []
    for sample in records:
        poseidon_id = sample.get("Poseidon_ID")
        group_name = sample.get("Group_Name")
        group = normalize_group_name(group_name)
        country = sample.get("Country")
        country_iso = sample.get("Country_ISO")
        if str(poseidon_id).endswith(".REF") or str(group_name).endswith(".REF"):
            sample["Region"] = None
            continue
        region = REGION_BY_GROUP.get(group)
        if region is None and group is not None and "African" in group:
            region = "Africa"
        if region is None and country_iso is not None:
            region = REGION_BY_COUNTRY_ISO.get(str(country_iso).upper())
        if region is None and country in {"Botswana or Namibia", "Namibia"}:
            region = "Africa"
        sample["Region"] = region
        if region is None:
            missing.append({
                "Poseidon_ID": poseidon_id,
                "Group_Name": group_name,
                "Country": country,
                "Country_ISO": country_iso,
            })
    if missing:
        missing_str = "\n".join(map(str, missing[:100]))
        raise ValueError(f"Missing region mapping for {len(missing)} samples. First unresolved records:\n{missing_str}")
    return records

def main():
    input_path = "/home/lab2/Downloads/annotation_hg19/Poseidon_AADR_v62_metadata.json"
    output_path = "/home/lab2/Downloads/annotation_hg19/Poseidon_AADR_v62_metadata_region.json"
    records = load_metadata(input_path)
    records = add_regions(records)
    write_metadata(records, output_path)
    print(f"Saved {len(records)} samples to {output_path}")

if __name__ == "__main__":
    main()
