"""
Download trade data from UN Comtrade API v2 for Argentina, Uruguay, Paraguay.
Years 2018-2024, HS 6-digit level, annual frequency.

Usage: python scripts/download_comtrade.py
"""

import requests
import json
import time
import os
from pathlib import Path

API_BASE = "https://comtradeapi.un.org/data/v1/get/C/A/HS"
API_KEY = os.environ.get("COMTRADE_API_KEY", "")

REPORTERS = {
    "ury": 858,
    "pry": 600,
}

YEARS = list(range(2018, 2025))  # 2018-2024
FLOWS = {"M": "imports", "X": "exports"}

SCRIPT_DIR = Path(__file__).parent
CACHE_DIR = SCRIPT_DIR / "comtrade_cache"
RAW_DIR = SCRIPT_DIR / "comtrade_raw"

HEADERS = {
    "Ocp-Apim-Subscription-Key": API_KEY,
}


def fetch_comtrade(reporter_code, period, flow_code, cmd_code="AG6"):
    """Fetch data from Comtrade API with caching and rate limiting.
    Does NOT specify partnerCode so API returns all individual partners.
    """
    cache_key = f"{reporter_code}_{period}_{flow_code}_{cmd_code}_all"
    cache_file = CACHE_DIR / f"{cache_key}.json"

    if cache_file.exists():
        with open(cache_file, encoding="utf-8") as f:
            return json.load(f)

    params = {
        "reporterCode": reporter_code,
        "period": period,
        "flowCode": flow_code,
        "cmdCode": cmd_code,
        "maxRecords": 250000,
        "format": "JSON",
        "includeDesc": True,
    }

    time.sleep(1.5)  # Rate limit: 1 req/sec + margin

    for attempt in range(3):
        try:
            resp = requests.get(API_BASE, headers=HEADERS, params=params, timeout=180)
            resp.raise_for_status()
            result = resp.json()
            data = result.get("data", [])

            # Cache the result
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)

            return data
        except requests.exceptions.HTTPError as e:
            print(f"    HTTP ERROR {resp.status_code}: {resp.text[:200]}")
            if resp.status_code == 429:
                wait = 60 * (attempt + 1)
                print(f"    Rate limited, waiting {wait}s (attempt {attempt+1}/3)...")
                time.sleep(wait)
                continue
            return None
        except Exception as e:
            print(f"    ERROR: {e}")
            if attempt < 2:
                print(f"    Retrying in 10s (attempt {attempt+1}/3)...")
                time.sleep(10)
                continue
            return None

    return None


def fetch_with_fallback(reporter_code, period, flow_code):
    """Try AG6 first. If truncated (>=250K records), split by chapter."""
    print(f"  Trying AG6 for {reporter_code}/{period}/{flow_code}...")
    data = fetch_comtrade(reporter_code, period, flow_code, cmd_code="AG6")

    if data is None:
        return []

    if len(data) < 100000:
        print(f"    Got {len(data)} records (fits in single call)")
        return data

    # Need to split by chapter (2-digit codes 01-99)
    print(f"    AG6 truncated ({len(data)} records). Splitting by chapter...")
    all_data = []
    for ch in range(1, 100):
        ch_code = f"{ch:02d}"
        ch_data = fetch_comtrade(reporter_code, period, flow_code, cmd_code=ch_code)
        if ch_data:
            all_data.extend(ch_data)
            if len(ch_data) > 0:
                print(f"      Chapter {ch_code}: {len(ch_data)} records")

    return all_data


def download_partner_reference():
    """Download partner areas reference for code->name mapping."""
    ref_file = CACHE_DIR / "partnerAreas.json"
    if ref_file.exists():
        print("Partner reference already cached.")
        return

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    print("Downloading partner areas reference...")
    resp = requests.get(
        "https://comtradeapi.un.org/files/v1/app/reference/partnerAreas.json",
        timeout=30
    )
    resp.raise_for_status()
    with open(ref_file, "w", encoding="utf-8") as f:
        json.dump(resp.json(), f, ensure_ascii=False)
    print(f"  Saved to {ref_file}")


def download_all():
    """Main download loop."""
    download_partner_reference()

    total_queries = len(REPORTERS) * len(YEARS) * len(FLOWS)
    done = 0

    for reporter_key, reporter_code in REPORTERS.items():
        print(f"\n{'='*60}")
        print(f"Reporter: {reporter_key.upper()} (code {reporter_code})")
        print(f"{'='*60}")

        reporter_dir = RAW_DIR / reporter_key
        reporter_dir.mkdir(parents=True, exist_ok=True)

        for year in YEARS:
            for flow_code, flow_label in FLOWS.items():
                done += 1
                out_file = reporter_dir / f"{year}_{flow_label}.json"

                if out_file.exists():
                    # Re-download if file is empty (failed previous attempt)
                    try:
                        existing = json.load(open(out_file, encoding="utf-8"))
                        if len(existing) > 0:
                            print(f"  [{done}/{total_queries}] {year} {flow_label}: already downloaded ({len(existing)} records), skipping")
                            continue
                        else:
                            print(f"  [{done}/{total_queries}] {year} {flow_label}: empty file, re-downloading...")
                            out_file.unlink()
                    except Exception:
                        pass

                print(f"  [{done}/{total_queries}] {year} {flow_label}:")
                data = fetch_with_fallback(reporter_code, year, flow_code)

                if data:
                    with open(out_file, "w", encoding="utf-8") as f:
                        json.dump(data, f, ensure_ascii=False)
                    print(f"    Total: {len(data)} records -> {out_file.name}")
                else:
                    print(f"    WARNING: No data returned, skipping file creation")

    print(f"\n{'='*60}")
    print("Download complete!")
    print(f"{'='*60}")


if __name__ == "__main__":
    download_all()
