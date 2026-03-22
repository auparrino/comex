"""
Validate Argentina INDEC data against Comtrade mirror data.

For each partner country:
1. Download what Comtrade shows for Argentina (reporter=32)
2. Compare totals with INDEC data
3. For countries with high chapter 99 (NCM 9999), use mirror data
   (what the partner reports trading with Argentina) to infer probable products

Usage: python scripts/validate_comtrade_arg.py

Requires: COMTRADE_API_KEY environment variable
"""

import json
import os
import time
import requests
from pathlib import Path
from collections import defaultdict
from country_names import normalize_comtrade_name

SCRIPT_DIR = Path(__file__).parent
CACHE_DIR = SCRIPT_DIR / "comtrade_cache"
ARG_DATA = SCRIPT_DIR.parent / "public" / "data" / "reporters" / "arg"
OUTPUT_FILE = ARG_DATA / "comtrade_validation.json"

API_BASE = "https://comtradeapi.un.org/data/v1/get/C/A/HS"
API_KEY = os.environ.get("COMTRADE_API_KEY", "")
HEADERS = {"Ocp-Apim-Subscription-Key": API_KEY}

ARG_CODE = 32
YEARS = [str(y) for y in range(2015, 2025)]

# Top partners to validate (by Comtrade code)
# We'll detect these from INDEC data
CH99_THRESHOLD = 0.20  # 20% to flag as "high ch99"


def fetch_cached(cache_key, params):
    """Fetch from Comtrade API with cache."""
    cache_file = CACHE_DIR / f"{cache_key}.json"
    if cache_file.exists():
        with open(cache_file, encoding="utf-8") as f:
            return json.load(f)

    if not API_KEY:
        return None

    time.sleep(1.5)
    for attempt in range(3):
        try:
            resp = requests.get(API_BASE, headers=HEADERS, params=params, timeout=180)
            resp.raise_for_status()
            data = resp.json().get("data", [])
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
            return data
        except requests.exceptions.HTTPError:
            if resp.status_code == 429:
                time.sleep(60 * (attempt + 1))
                continue
            print(f"  HTTP {resp.status_code}")
            return None
        except Exception as e:
            print(f"  Error: {e}")
            if attempt < 2:
                time.sleep(10)
            continue
    return None


def load_partner_reference():
    """Load partner code -> ISO2 + name mapping."""
    ref_file = CACHE_DIR / "partnerAreas.json"
    if not ref_file.exists():
        return {}, {}

    with open(ref_file, encoding="utf-8") as f:
        raw = json.load(f)

    results = raw if isinstance(raw, list) else raw.get("results", raw.get("data", []))
    code_to_name = {}
    name_to_code = {}
    for entry in results:
        if isinstance(entry, dict):
            code = int(entry.get("id", entry.get("PartnerCode", 0)))
            text = entry.get("text", entry.get("PartnerDesc", ""))
            if code and text:
                code_to_name[code] = text
                # Normalize to canonical name
                canonical = normalize_comtrade_name(text)
                if canonical:
                    name_to_code[canonical] = code

    return code_to_name, name_to_code


def load_indec_data():
    """Load INDEC Argentina data (summary + products)."""
    summary = json.load(open(ARG_DATA / "summary.json", encoding="utf-8"))
    products = json.load(open(ARG_DATA / "products.json", encoding="utf-8"))
    return summary, products


def calc_ch99_by_country(products):
    """Calculate chapter 99 percentage per country per year."""
    ch99_stats = {}
    for country, years_data in products.items():
        ch99_stats[country] = {}
        for year, flows in years_data.items():
            exp_total = sum(flows.get("exp", {}).values())
            imp_total = sum(flows.get("imp", {}).values())
            exp_99 = sum(v for k, v in flows.get("exp", {}).items() if k.startswith("99"))
            imp_99 = sum(v for k, v in flows.get("imp", {}).items() if k.startswith("99"))
            ch99_stats[country][year] = {
                "exp_pct": exp_99 / exp_total if exp_total > 0 else 0,
                "imp_pct": imp_99 / imp_total if imp_total > 0 else 0,
                "exp_val": exp_99,
                "imp_val": imp_99,
            }
    return ch99_stats


def fetch_arg_comtrade_totals():
    """Fetch Argentina as reporter from Comtrade (chapter-level for comparison)."""
    print("\n--- Fetching Argentina Comtrade data (reporter) ---")
    totals = {}  # partner_name -> {year: {exp, imp}}

    for year in YEARS:
        for flow_code, flow_key in [("X", "exp"), ("M", "imp")]:
            cache_key = f"arg_validate_{year}_{flow_code}_chapters"
            data = fetch_cached(cache_key, {
                "reporterCode": ARG_CODE,
                "period": year,
                "flowCode": flow_code,
                "cmdCode": "TOTAL",
                "maxRecords": 100000,
                "format": "JSON",
                "includeDesc": True,
            })

            if not data:
                print(f"  {year} {flow_key}: no data")
                continue

            print(f"  {year} {flow_key}: {len(data)} records")
            for rec in data:
                partner_desc = rec.get("partnerDesc", "")
                partner_name = normalize_comtrade_name(partner_desc)
                if partner_name is None:
                    continue
                value = rec.get("primaryValue") or rec.get("fobvalue") or rec.get("cifvalue") or 0
                if value <= 0:
                    continue

                if partner_name not in totals:
                    totals[partner_name] = {}
                if year not in totals[partner_name]:
                    totals[partner_name][year] = {"exp": 0, "imp": 0}
                totals[partner_name][year][flow_key] += value

    return totals


def fetch_mirror_products(partner_code, partner_name):
    """Fetch what a partner reports trading with Argentina (mirror data).
    Returns top chapters by value for each flow."""
    print(f"  Fetching mirror data from {partner_name} (code {partner_code})...")
    chapter_totals = {"exp": defaultdict(float), "imp": defaultdict(float)}

    for year in YEARS:
        for flow_code, flow_key in [("X", "imp"), ("M", "exp")]:
            # Mirror: partner's exports to ARG = ARG's imports
            # Partner's imports from ARG = ARG's exports
            cache_key = f"mirror_{partner_code}_{year}_{flow_code}_arg"
            data = fetch_cached(cache_key, {
                "reporterCode": partner_code,
                "partnerCode": ARG_CODE,
                "period": year,
                "flowCode": flow_code,
                "cmdCode": "AG2",  # Chapter level
                "maxRecords": 100000,
                "format": "JSON",
                "includeDesc": True,
            })

            if not data:
                continue

            for rec in data:
                cmd_code = str(rec.get("cmdCode", ""))
                cmd_desc = rec.get("cmdDesc", "")
                value = rec.get("primaryValue") or 0
                if len(cmd_code) == 2 and value > 0 and not cmd_code.startswith("99"):
                    chapter_totals[flow_key][cmd_code] += value

    # Return top chapters
    result = {}
    for flow_key in ["exp", "imp"]:
        sorted_chs = sorted(chapter_totals[flow_key].items(), key=lambda x: -x[1])
        result[flow_key] = [
            {"chapter": ch, "value": round(val)}
            for ch, val in sorted_chs[:5]
        ]

    return result


def main():
    print("=" * 60)
    print("Validating Argentina INDEC vs Comtrade")
    print("=" * 60)

    code_to_name, name_to_code = load_partner_reference()
    summary, products = load_indec_data()

    # Calculate ch99 stats
    ch99_stats = calc_ch99_by_country(products)

    # Identify countries with high ch99
    high_ch99_countries = set()
    for country, year_stats in ch99_stats.items():
        for year, stats in year_stats.items():
            if stats["exp_pct"] > CH99_THRESHOLD or stats["imp_pct"] > CH99_THRESHOLD:
                high_ch99_countries.add(country)
                break

    print(f"\nCountries with >5% ch99: {len(high_ch99_countries)}")
    for c in sorted(high_ch99_countries):
        # Get max ch99 pct across years
        max_exp = max(s["exp_pct"] for s in ch99_stats[c].values()) if ch99_stats[c] else 0
        max_imp = max(s["imp_pct"] for s in ch99_stats[c].values()) if ch99_stats[c] else 0
        print(f"  {c}: max exp {max_exp:.1%}, max imp {max_imp:.1%}")

    # Fetch Comtrade totals for comparison
    comtrade_totals = {}
    if API_KEY:
        comtrade_totals = fetch_arg_comtrade_totals()
    else:
        print("\nNo COMTRADE_API_KEY set. Skipping Comtrade comparison.")
        print("Set the env variable to enable full validation.")

    # Fetch mirror data for high-ch99 countries
    mirror_data = {}
    if API_KEY:
        print(f"\n--- Fetching mirror data for {len(high_ch99_countries)} countries ---")
        for country in sorted(high_ch99_countries):
            partner_code = name_to_code.get(country)
            if partner_code:
                mirror_data[country] = fetch_mirror_products(partner_code, country)
    else:
        print("Skipping mirror data (no API key).")

    # Load chapters for names
    chapters_file = ARG_DATA.parent.parent / "chapters.json"
    chapters = {}
    if chapters_file.exists():
        chapters = json.load(open(chapters_file, encoding="utf-8"))

    # Build output
    validation = {
        "metadata": {
            "source": "Comtrade API v1",
            "reporter": "Argentina (32)",
            "years": YEARS,
            "ch99_threshold": CH99_THRESHOLD,
            "has_comtrade_comparison": bool(API_KEY),
        },
        "countries": {},
    }

    # Process all countries in products
    for country in sorted(products.keys()):
        entry = {}

        # Ch99 stats (always available - from INDEC data)
        if country in ch99_stats:
            # Aggregate across years
            all_exp_pct = [s["exp_pct"] for s in ch99_stats[country].values()]
            all_imp_pct = [s["imp_pct"] for s in ch99_stats[country].values()]
            entry["ch99"] = {
                "by_year": ch99_stats[country],
                "avg_exp_pct": sum(all_exp_pct) / len(all_exp_pct) if all_exp_pct else 0,
                "avg_imp_pct": sum(all_imp_pct) / len(all_imp_pct) if all_imp_pct else 0,
                "max_exp_pct": max(all_exp_pct) if all_exp_pct else 0,
                "max_imp_pct": max(all_imp_pct) if all_imp_pct else 0,
                "high": country in high_ch99_countries,
            }

        # Comtrade comparison (if API key available)
        if country in comtrade_totals:
            ct = comtrade_totals[country]
            indec_total_exp = sum(
                summary[country]["years"].get(y, {}).get("exp", 0) for y in YEARS
            ) if country in summary else 0
            indec_total_imp = sum(
                summary[country]["years"].get(y, {}).get("imp", 0) for y in YEARS
            ) if country in summary else 0
            ct_total_exp = sum(ct.get(y, {}).get("exp", 0) for y in YEARS)
            ct_total_imp = sum(ct.get(y, {}).get("imp", 0) for y in YEARS)

            entry["comparison"] = {
                "indec": {"exp": round(indec_total_exp), "imp": round(indec_total_imp)},
                "comtrade": {"exp": round(ct_total_exp), "imp": round(ct_total_imp)},
                "diff_pct": {
                    "exp": round((ct_total_exp - indec_total_exp) / indec_total_exp, 4)
                    if indec_total_exp > 0 else None,
                    "imp": round((ct_total_imp - indec_total_imp) / indec_total_imp, 4)
                    if indec_total_imp > 0 else None,
                },
            }

        # Mirror-based probable products (for high-ch99 countries)
        if country in mirror_data and mirror_data[country]:
            m = mirror_data[country]
            probable = {}
            for flow in ["exp", "imp"]:
                if m.get(flow):
                    probable[flow] = [
                        {
                            "chapter": p["chapter"],
                            "name": chapters.get(p["chapter"], f"Cap. {p['chapter']}"),
                            "mirror_value": p["value"],
                        }
                        for p in m[flow][:5]
                    ]
            if probable:
                entry["probable_products"] = probable

        if entry:
            validation["countries"][country] = entry

    # Write output
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(validation, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*60}")
    print(f"Output: {OUTPUT_FILE}")
    print(f"Countries processed: {len(validation['countries'])}")
    high_count = sum(1 for c in validation['countries'].values() if c.get('ch99', {}).get('high'))
    print(f"Countries with high ch99: {high_count}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
