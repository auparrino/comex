"""
Process downloaded Comtrade raw data into the app's JSON format.
Generates per-reporter data files in public/data/reporters/{arg,ury,pry}/

Usage: python scripts/process_comtrade.py
"""

import json
import os
import re
import unicodedata
from pathlib import Path
from collections import defaultdict
from country_names import normalize_comtrade_name

SCRIPT_DIR = Path(__file__).parent
RAW_DIR = SCRIPT_DIR / "comtrade_raw"
CACHE_DIR = SCRIPT_DIR / "comtrade_cache"
OUTPUT_BASE = Path(__file__).parent.parent / "public" / "data" / "reporters"

REPORTERS = {
    "ury": {"code": 858, "name": "Uruguay", "iso2": "UY", "coords": [-34.9, -56.2]},
    "pry": {"code": 600, "name": "Paraguay", "iso2": "PY", "coords": [-25.3, -57.6]},
}

YEARS = [str(y) for y in range(2018, 2025)]

# ISO3 to ISO2 mapping for common countries
ISO3_TO_ISO2 = {}


def load_partner_reference():
    """Load partner areas reference and build code->iso2 mapping."""
    ref_file = CACHE_DIR / "partnerAreas.json"
    if not ref_file.exists():
        print("WARNING: partnerAreas.json not found. Run download_comtrade.py first.")
        return {}

    with open(ref_file, encoding="utf-8") as f:
        data = json.load(f)

    results = data if isinstance(data, list) else data.get("results", data.get("data", []))
    mapping = {}
    for entry in results:
        if isinstance(entry, dict):
            code = entry.get("id", entry.get("PartnerCode"))
            iso2 = entry.get("PartnerCodeIsoAlpha2", "")
            if code is not None and iso2:
                mapping[int(code)] = iso2

    print(f"  Partner reference: {len(mapping)} codes with ISO2")
    return mapping


def get_partner_iso2(partner_code, partner_ref):
    """Get ISO2 code for a partner from Comtrade numeric code."""
    # Some special codes not in the reference file
    EXTRA = {842: "US", 841: "US", 0: "", 97: "", 290: "", 849: ""}
    if partner_code in EXTRA:
        return EXTRA[partner_code]
    return partner_ref.get(partner_code, "")


def translate_name(comtrade_name):
    """Translate Comtrade English name to canonical Spanish."""
    return normalize_comtrade_name(comtrade_name)


def slugify(name):
    """Convert country name to filesystem-safe slug."""
    if not name:
        return "unknown"
    name = unicodedata.normalize("NFKD", name)
    name = name.encode("ascii", "ignore").decode("ascii")
    name = re.sub(r"[^\w\s-]", "", name.lower())
    name = re.sub(r"[\s]+", "_", name.strip())
    return name or "unknown"


def load_raw_data(reporter_key):
    """Load all raw Comtrade data for a reporter."""
    reporter_dir = RAW_DIR / reporter_key
    all_records = []

    for year in YEARS:
        for flow_label in ["exports", "imports"]:
            fpath = reporter_dir / f"{year}_{flow_label}.json"
            if fpath.exists():
                with open(fpath, encoding="utf-8") as f:
                    try:
                        records = json.load(f)
                        if isinstance(records, list):
                            all_records.extend(records)
                    except json.JSONDecodeError:
                        print(f"  WARNING: Could not parse {fpath}")

    return all_records


def process_reporter(reporter_key, reporter_info, partner_ref):
    """Process all records for one reporter into the app's JSON format."""
    print(f"\nProcessing {reporter_key.upper()}...")
    records = load_raw_data(reporter_key)
    print(f"  Loaded {len(records)} total records")

    if not records:
        print(f"  WARNING: No records for {reporter_key}. Skipping.")
        return

    output_dir = OUTPUT_BASE / reporter_key
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "details").mkdir(exist_ok=True)
    (output_dir / "product_map").mkdir(exist_ok=True)

    # Accumulators
    summary = {}          # partner_name -> {iso2, years: {year: {exp, imp}}}
    products = {}         # partner_name -> {year: {exp: {ch: val}, imp: {ch: val}}}
    details = {}          # partner_name -> {year: {"2": {exp, imp}, "4": {}, "6": {}}}
    globals_products = defaultdict(lambda: {"exp": defaultdict(float), "imp": defaultdict(float)})
    hs_descriptions = {}
    country_slugs = {}
    product_by_partner = defaultdict(lambda: defaultdict(lambda: {"exp": 0, "imp": 0}))

    reporter_code = reporter_info["code"]
    skipped = 0

    # Known aggregate/special partner codes to skip from per-partner data
    SKIP_PARTNER_CODES = {0, 97, 290, 472, 490, 492, 527, 568, 577, 636, 837, 838, 839, 849, 879, 896, 899}
    # Codes that should still count toward global totals (e.g., Free Zones = real trade)
    GLOBALS_ONLY_CODES = {838}  # Free Zones

    # Filter to aggregate records only: customsCode=C00 (all customs procedures)
    # and motCode=0 (all modes of transport). This avoids double-counting from
    # breakdown records (C03=specific procedure, motCode=1000=sea, 2100=air, etc.)
    # Some reporters (e.g. PRY) only have C00+mot=0, so this is a no-op for them.
    filtered = []
    for rec in records:
        customs = rec.get("customsCode", "C00")
        mot = rec.get("motCode", 0)
        if customs == "C00" and mot == 0:
            filtered.append(rec)
    print(f"  After C00+mot=0 filter: {len(records)} -> {len(filtered)} records")

    # Deduplicate: some records appear twice with same values but different
    # partner2Code (0 vs 899). Keep first occurrence.
    # Also, records may exist at both chapter (aggrLevel=2) and HS6 level.
    # Prefer HS6 when available.
    seen_keys = {}  # (partner, period, flow, cmd) -> aggrLevel
    deduped_records = []

    globals_only_records = []  # Records for globals totals only (e.g., Free Zones)

    for rec in filtered:
        partner_code = rec.get("partnerCode", 0)
        if partner_code == reporter_code:
            continue

        # Records for globals-only codes (Free Zones etc.) go to a separate list
        if partner_code in GLOBALS_ONLY_CODES:
            globals_only_records.append(rec)
            continue

        if partner_code in SKIP_PARTNER_CODES:
            continue

        period = str(rec.get("period", rec.get("refYear", "")))
        flow = rec.get("flowCode", rec.get("flow_code", ""))
        cmd_code = str(rec.get("cmdCode", rec.get("cmd_code", "")))
        aggr_level = rec.get("aggrLevel", 6)
        key = (partner_code, period, flow, cmd_code)

        if key in seen_keys:
            # Already have this record; skip duplicate (partner2Code variant)
            skipped += 1
            continue

        seen_keys[key] = aggr_level
        deduped_records.append(rec)

    # For each (partner, period, flow), check if HS6 data exists.
    # If so, skip chapter-level aggregates to avoid double-counting.
    has_hs6 = set()
    for rec in deduped_records:
        partner_code = rec.get("partnerCode", 0)
        period = str(rec.get("period", rec.get("refYear", "")))
        flow = rec.get("flowCode", rec.get("flow_code", ""))
        cmd_code = str(rec.get("cmdCode", rec.get("cmd_code", "")))
        if len(cmd_code) == 6:
            has_hs6.add((partner_code, period, flow))

    print(f"  Deduped: {len(records)} -> {len(deduped_records)} records ({skipped} duplicates)")
    print(f"  Partner-period-flows with HS6 data: {len(has_hs6)}")

    for rec in deduped_records:
        partner_code = rec.get("partnerCode", 0)
        period = str(rec.get("period", rec.get("refYear", "")))
        flow = rec.get("flowCode", rec.get("flow_code", ""))
        cmd_code = str(rec.get("cmdCode", rec.get("cmd_code", "")))

        # Skip chapter-level records when HS6 data exists for this partner/period/flow
        if len(cmd_code) < 6 and (partner_code, period, flow) in has_hs6:
            continue

        # Use primaryValue, fall back to fobvalue/cifvalue
        value = rec.get("primaryValue") or rec.get("fobvalue") or rec.get("cifvalue") or 0
        cmd_desc = rec.get("cmdDesc", rec.get("cmd_desc", ""))
        partner_desc = rec.get("partnerDesc", rec.get("partner_desc", "Unknown"))

        if not period or not flow or not cmd_code or value <= 0:
            continue

        # Normalize flow key
        if flow in ("X", "x", "2"):
            flow_key = "exp"
        elif flow in ("M", "m", "1"):
            flow_key = "imp"
        else:
            continue

        # Translate partner name
        partner_name = translate_name(partner_desc)
        if partner_name is None:  # Skip aggregates
            continue

        partner_iso2 = get_partner_iso2(partner_code, partner_ref)

        # Store HS description (at all digit levels)
        if cmd_code and cmd_desc and len(cmd_code) <= 6:
            hs_descriptions[cmd_code] = cmd_desc

        # --- Summary ---
        if partner_name not in summary:
            summary[partner_name] = {"iso2": partner_iso2, "years": {}}
        if period not in summary[partner_name]["years"]:
            summary[partner_name]["years"][period] = {"exp": 0, "imp": 0}
        summary[partner_name]["years"][period][flow_key] += value

        # --- Products (chapter level = 2-digit) ---
        chapter = cmd_code[:2]
        if partner_name not in products:
            products[partner_name] = {}
        if period not in products[partner_name]:
            products[partner_name][period] = {"exp": {}, "imp": {}}
        products[partner_name][period][flow_key][chapter] = (
            products[partner_name][period][flow_key].get(chapter, 0) + value
        )

        # --- Globals ---
        globals_products[period][flow_key][chapter] += value

        # --- Details (2, 4, 6 digit levels) ---
        if partner_name not in details:
            details[partner_name] = {}
        if period not in details[partner_name]:
            details[partner_name][period] = {}

        for digits in [2, 4, 6]:
            dkey = str(digits)
            if len(cmd_code) >= digits:
                code_at_level = cmd_code[:digits]
                if dkey not in details[partner_name][period]:
                    details[partner_name][period][dkey] = {"exp": {}, "imp": {}}
                details[partner_name][period][dkey][flow_key][code_at_level] = (
                    details[partner_name][period][dkey][flow_key].get(code_at_level, 0)
                    + value
                )

        # --- Product map (inverted index for choropleth) ---
        if len(cmd_code) == 6:
            product_by_partner[cmd_code][partner_name][flow_key] += value

    # Add globals-only records (Free Zones, etc.) to global totals
    # These are real trade but can't be attributed to a specific country on the map
    globals_only_val = 0
    seen_go = set()
    for rec in globals_only_records:
        partner_code = rec.get("partnerCode", 0)
        period = str(rec.get("period", rec.get("refYear", "")))
        flow = rec.get("flowCode", rec.get("flow_code", ""))
        cmd_code = str(rec.get("cmdCode", rec.get("cmd_code", "")))
        key = (partner_code, period, flow, cmd_code)
        if key in seen_go:
            continue
        seen_go.add(key)

        value = rec.get("primaryValue") or rec.get("fobvalue") or rec.get("cifvalue") or 0
        if not period or not flow or not cmd_code or value <= 0:
            continue
        if len(cmd_code) < 6:
            continue  # Only HS6 to avoid double-counting with chapters

        flow_key = "exp" if flow in ("X", "x", "2") else "imp" if flow in ("M", "m", "1") else None
        if not flow_key:
            continue

        chapter = cmd_code[:2]
        globals_products[period][flow_key][chapter] += value
        globals_only_val += value

    if globals_only_val > 0:
        print(f"  Globals-only (Free Zones etc.): ${globals_only_val/1e6:.0f}M added to totals")

    print(f"  Partners: {len(summary)}")
    print(f"  HS descriptions: {len(hs_descriptions)}")
    if skipped:
        print(f"  Skipped {skipped} records (aggregate partner codes)")

    # --- Write summary.json ---
    # Keep only partners with meaningful trade (> $1000 in any year)
    filtered_summary = {}
    for name, data in summary.items():
        total = sum(y["exp"] + y["imp"] for y in data["years"].values())
        if total > 1000:
            filtered_summary[name] = data
    with open(output_dir / "summary.json", "w", encoding="utf-8") as f:
        json.dump(filtered_summary, f, ensure_ascii=False)
    print(f"  summary.json: {len(filtered_summary)} partners")

    # --- Write products.json (only top 100 partners to keep file small) ---
    top_partners = sorted(
        filtered_summary.keys(),
        key=lambda n: sum(y["exp"] + y["imp"] for y in filtered_summary[n]["years"].values()),
        reverse=True
    )[:100]
    filtered_products = {n: products.get(n, {}) for n in top_partners if n in products}
    with open(output_dir / "products.json", "w", encoding="utf-8") as f:
        json.dump(filtered_products, f, ensure_ascii=False)
    print(f"  products.json: {len(filtered_products)} partners")

    # --- Write globals.json ---
    globals_out = {"products": {}, "monthly": {}}
    for year in YEARS:
        if year in globals_products:
            globals_out["products"][year] = {
                "exp": dict(globals_products[year]["exp"]),
                "imp": dict(globals_products[year]["imp"]),
            }
        globals_out["monthly"][year] = {"exp": [0]*12, "imp": [0]*12}
    with open(output_dir / "globals.json", "w", encoding="utf-8") as f:
        json.dump(globals_out, f, ensure_ascii=False)

    # --- Write details/{slug}.json ---
    detail_count = 0
    for partner_name in filtered_summary:
        if partner_name not in details:
            continue
        slug = slugify(partner_name)
        country_slugs[partner_name] = slug
        with open(output_dir / "details" / f"{slug}.json", "w", encoding="utf-8") as f:
            json.dump(details[partner_name], f, ensure_ascii=False)
        detail_count += 1
    print(f"  details/: {detail_count} files")

    # --- Write country_slugs.json ---
    with open(output_dir / "country_slugs.json", "w", encoding="utf-8") as f:
        json.dump(country_slugs, f, ensure_ascii=False)

    # --- Write hs_descriptions.json ---
    # Also add parent descriptions (2 and 4 digit) from the 6-digit ones
    # Plus load chapters.json for 2-digit names
    chapters_file = OUTPUT_BASE.parent / "chapters.json"
    if chapters_file.exists():
        with open(chapters_file, encoding="utf-8") as f:
            existing_chapters = json.load(f)
        for code, desc in existing_chapters.items():
            if code not in hs_descriptions:
                hs_descriptions[code] = desc

    with open(output_dir / "hs_descriptions.json", "w", encoding="utf-8") as f:
        json.dump(hs_descriptions, f, ensure_ascii=False)
    print(f"  hs_descriptions.json: {len(hs_descriptions)} entries")

    # --- Write product_map/ (inverted index for choropleth) ---
    chapters_map = defaultdict(dict)
    for hs6, partners in product_by_partner.items():
        ch = hs6[:2]
        # Convert defaultdict to regular dict
        chapters_map[ch][hs6] = {pname: dict(vals) for pname, vals in partners.items()}

    pm_count = 0
    for ch, prods in chapters_map.items():
        with open(output_dir / "product_map" / f"ch{ch}.json", "w", encoding="utf-8") as f:
            json.dump(prods, f, ensure_ascii=False)
        pm_count += 1

    # Write product_map_index.json
    product_map_index = {}
    for ch in sorted(chapters_map.keys()):
        product_map_index[ch] = sorted(chapters_map[ch].keys())
    with open(output_dir / "product_map_index.json", "w", encoding="utf-8") as f:
        json.dump(product_map_index, f, ensure_ascii=False)
    print(f"  product_map/: {pm_count} chapter files")

    return filtered_summary


def generate_chapters_from_descriptions():
    """Generate/update chapters.json from all HS descriptions across reporters."""
    print("\nGenerating shared chapters.json...")
    chapters = {}

    for reporter_key in REPORTERS:
        desc_file = OUTPUT_BASE / reporter_key / "hs_descriptions.json"
        if desc_file.exists():
            with open(desc_file, encoding="utf-8") as f:
                descs = json.load(f)
            for code, desc in descs.items():
                if len(code) == 2 and code not in chapters:
                    chapters[code] = desc

    out_file = OUTPUT_BASE.parent / "chapters.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(dict(sorted(chapters.items())), f, ensure_ascii=False, indent=2)
    print(f"  chapters.json: {len(chapters)} chapters")


def generate_reporters_json():
    """Generate reporters.json (includes ARG from INDEC + URY/PRY from Comtrade)."""
    ALL_REPORTERS = {
        "arg": {"name": "Argentina", "code": 32, "iso2": "AR", "coords": [-34.6, -58.4]},
        "ury": {"name": "Uruguay", "code": 858, "iso2": "UY", "coords": [-34.9, -56.2]},
        "pry": {"name": "Paraguay", "code": 600, "iso2": "PY", "coords": [-25.3, -57.6]},
    }
    reporters_list = []
    for key, info in ALL_REPORTERS.items():
        reporters_list.append({
            "key": key,
            "name": info["name"],
            "code": info["code"],
            "iso2": info["iso2"],
            "coords": info["coords"],
        })

    out_file = OUTPUT_BASE.parent / "reporters.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(reporters_list, f, ensure_ascii=False, indent=2)
    print(f"\nreporters.json: {len(reporters_list)} reporters")


def main():
    print("=" * 60)
    print("Processing Comtrade data")
    print("=" * 60)

    OUTPUT_BASE.mkdir(parents=True, exist_ok=True)
    partner_ref = load_partner_reference()

    for reporter_key, reporter_info in REPORTERS.items():
        process_reporter(reporter_key, reporter_info, partner_ref)

    generate_chapters_from_descriptions()
    generate_reporters_json()

    print("\n" + "=" * 60)
    print("Processing complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()
