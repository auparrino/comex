"""
Convert original INDEC Argentina data (root public/data/) to reporter format
(public/data/reporters/arg/), normalizing to 6-digit max and canonical country names.

Usage: python scripts/convert_indec_to_reporter.py
"""

import json
import re
import unicodedata
from pathlib import Path
from collections import defaultdict
from country_names import normalize_indec_name

ROOT_DATA = Path(__file__).parent.parent / "public" / "data"
REPORTER_DIR = ROOT_DATA / "reporters" / "arg"


def slugify(name):
    """Convert country name to filesystem-safe slug."""
    if not name:
        return "unknown"
    name = unicodedata.normalize("NFKD", name)
    name = name.encode("ascii", "ignore").decode("ascii")
    name = re.sub(r"[^\w\s-]", "", name.lower())
    name = re.sub(r"[\s]+", "_", name.strip())
    return name or "unknown"


def merge_dict_add(target, source):
    """Merge source dict into target, summing numeric values."""
    for k, v in source.items():
        if isinstance(v, dict):
            if k not in target:
                target[k] = {}
            merge_dict_add(target[k], v)
        else:
            target[k] = target.get(k, 0) + v


def main():
    print("=" * 60)
    print("Converting INDEC data to reporter format (6-digit max)")
    print("=" * 60)

    REPORTER_DIR.mkdir(parents=True, exist_ok=True)
    (REPORTER_DIR / "details").mkdir(exist_ok=True)
    (REPORTER_DIR / "product_map").mkdir(exist_ok=True)

    # Load original data
    summary_raw = json.load(open(ROOT_DATA / "summary.json", encoding="utf-8"))
    products_raw = json.load(open(ROOT_DATA / "products.json", encoding="utf-8"))
    country_slugs_raw = json.load(open(ROOT_DATA / "country_slugs.json", encoding="utf-8"))

    # Build old-slug -> old-name mapping
    old_name_to_slug = country_slugs_raw
    old_slug_to_name = {v: k for k, v in old_name_to_slug.items()}

    # === 1. Normalize summary.json ===
    print("\n1. summary.json (normalizing country names)")
    summary_new = {}
    name_mapping = {}  # old_name -> new_name (for later use)

    for old_name, data in summary_raw.items():
        new_name = normalize_indec_name(old_name)
        if new_name is None:
            continue  # Skip confidential/indeterminate
        name_mapping[old_name] = new_name

        if new_name in summary_new:
            # Merge (e.g., "Colonia (Uruguay)" + "Uruguay")
            for year, vals in data.get("years", {}).items():
                if year not in summary_new[new_name]["years"]:
                    summary_new[new_name]["years"][year] = {"exp": 0, "imp": 0}
                summary_new[new_name]["years"][year]["exp"] += vals.get("exp", 0)
                summary_new[new_name]["years"][year]["imp"] += vals.get("imp", 0)
        else:
            summary_new[new_name] = {
                "iso2": data.get("iso2", ""),
                "years": {}
            }
            for year, vals in data.get("years", {}).items():
                summary_new[new_name]["years"][year] = {
                    "exp": vals.get("exp", 0),
                    "imp": vals.get("imp", 0)
                }

    with open(REPORTER_DIR / "summary.json", "w", encoding="utf-8") as f:
        json.dump(summary_new, f, ensure_ascii=False)
    print(f"   {len(summary_raw)} -> {len(summary_new)} partners")

    # === 2. Normalize products.json ===
    print("2. products.json")
    products_new = {}
    for old_name, data in products_raw.items():
        new_name = name_mapping.get(old_name)
        if new_name is None:
            continue
        if new_name in products_new:
            # Merge chapter data
            for year, flows in data.items():
                if year not in products_new[new_name]:
                    products_new[new_name][year] = {"exp": {}, "imp": {}}
                for flow in ["exp", "imp"]:
                    for ch, val in flows.get(flow, {}).items():
                        products_new[new_name][year][flow][ch] = (
                            products_new[new_name][year][flow].get(ch, 0) + val
                        )
        else:
            products_new[new_name] = data

    with open(REPORTER_DIR / "products.json", "w", encoding="utf-8") as f:
        json.dump(products_new, f, ensure_ascii=False)
    print(f"   {len(products_raw)} -> {len(products_new)} partners")

    # === 3. Copy globals.json (no country names in it) ===
    print("3. globals.json")
    globals_data = json.load(open(ROOT_DATA / "globals.json", encoding="utf-8"))
    with open(REPORTER_DIR / "globals.json", "w", encoding="utf-8") as f:
        json.dump(globals_data, f, ensure_ascii=False)

    # === 4. Normalize ncm_descriptions.json -> hs_descriptions.json ===
    print("4. hs_descriptions.json")
    ncm_desc = json.load(open(ROOT_DATA / "ncm_descriptions.json", encoding="utf-8"))
    hs_desc = {k: v for k, v in ncm_desc.items() if len(k) <= 6}
    with open(REPORTER_DIR / "hs_descriptions.json", "w", encoding="utf-8") as f:
        json.dump(hs_desc, f, ensure_ascii=False)
    print(f"   {len(ncm_desc)} -> {len(hs_desc)} entries (removed 8-digit)")

    # === 5-6. Normalize details + generate product_map ===
    print("5. details/ (normalizing names, removing 8-digit)")
    details_dir = ROOT_DATA / "details"
    product_by_partner = defaultdict(lambda: defaultdict(lambda: {"exp": 0, "imp": 0}))

    # Group detail files by new_name (for merging zones like Colonia→Uruguay)
    details_by_new_name = defaultdict(list)

    for slug_file in sorted(details_dir.iterdir()):
        if not slug_file.name.endswith(".json"):
            continue
        slug_name = slug_file.stem
        old_name = old_slug_to_name.get(slug_name)
        if old_name is None:
            continue
        new_name = name_mapping.get(old_name)
        if new_name is None:
            continue

        detail = json.load(open(slug_file, encoding="utf-8"))
        details_by_new_name[new_name].append(detail)

    # Write merged details
    new_country_slugs = {}
    detail_count = 0

    for new_name, detail_list in details_by_new_name.items():
        merged = {}
        for detail in detail_list:
            for year, levels in detail.items():
                if year not in merged:
                    merged[year] = {}
                for digit_key in ["2", "4", "6"]:
                    if digit_key not in levels:
                        continue
                    if digit_key not in merged[year]:
                        merged[year][digit_key] = {"exp": {}, "imp": {}}
                    for flow in ["exp", "imp"]:
                        for code, val in levels[digit_key].get(flow, {}).items():
                            if len(code) <= int(digit_key):
                                merged[year][digit_key][flow][code] = (
                                    merged[year][digit_key][flow].get(code, 0) + val
                                )

        # Build product_map from 6-digit data
        for year, levels in merged.items():
            if "6" in levels:
                for flow in ["exp", "imp"]:
                    for code, val in levels["6"].get(flow, {}).items():
                        if len(code) == 6 and val > 0:
                            product_by_partner[code][new_name][flow] += val

        slug = slugify(new_name)
        new_country_slugs[new_name] = slug
        with open(REPORTER_DIR / "details" / f"{slug}.json", "w", encoding="utf-8") as f:
            json.dump(merged, f, ensure_ascii=False)
        detail_count += 1

    print(f"   {detail_count} detail files")

    # === Write country_slugs.json ===
    print("6. country_slugs.json")
    with open(REPORTER_DIR / "country_slugs.json", "w", encoding="utf-8") as f:
        json.dump(new_country_slugs, f, ensure_ascii=False)

    # === 7. Generate product_map/ ===
    print("7. product_map/")
    chapters_map = defaultdict(dict)
    for hs6, partners in product_by_partner.items():
        ch = hs6[:2]
        chapters_map[ch][hs6] = {pname: dict(vals) for pname, vals in partners.items()}

    pm_count = 0
    for ch, prods in chapters_map.items():
        with open(REPORTER_DIR / "product_map" / f"ch{ch}.json", "w", encoding="utf-8") as f:
            json.dump(prods, f, ensure_ascii=False)
        pm_count += 1

    product_map_index = {}
    for ch in sorted(chapters_map.keys()):
        product_map_index[ch] = sorted(chapters_map[ch].keys())
    with open(REPORTER_DIR / "product_map_index.json", "w", encoding="utf-8") as f:
        json.dump(product_map_index, f, ensure_ascii=False)
    print(f"   {pm_count} chapter files, {len(product_by_partner)} HS6 products")

    # === Summary ===
    renamed = sum(1 for old, new in name_mapping.items() if old != new)
    merged_count = len(summary_raw) - len(summary_new)
    print(f"\n   Names renamed: {renamed}")
    print(f"   Partners merged: {merged_count}")

    print("\n" + "=" * 60)
    print("Conversion complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()
