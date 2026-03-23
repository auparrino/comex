"""
Generate INDEC vs Comtrade discrepancy statistics from cached data.
Detects countries where INDEC public data is significantly lower than
what Argentina reports to Comtrade (indicating confidential/missing data).

No API key needed - works from comtrade_cache/ files.

Usage: python scripts/generate_discrepancy_stats.py
"""

import json
import sys
from pathlib import Path
from collections import defaultdict

SCRIPT_DIR = Path(__file__).parent
CACHE_DIR = SCRIPT_DIR / "comtrade_cache"
DATA_DIR = SCRIPT_DIR.parent / "public" / "data"
ARG_DIR = DATA_DIR / "reporters" / "arg"

# Discrepancy thresholds (applied to exp gap, since imp is systematically lower)
# Using percentile-based: high = above P75 of exp gap distribution
# Will be computed dynamically from data
DISC_HIGH_FALLBACK = 5.0   # 500% - fallback if no distribution data
DISC_MEDIUM_FALLBACK = 1.0  # 100%

sys.path.insert(0, str(SCRIPT_DIR))
from country_names import normalize_comtrade_name

SKIP_CODES = {0, 97, 290, 472, 490, 492, 527, 568, 577, 636, 837, 838, 839, 849, 879, 896, 899}


def load_partner_ref():
    ref_file = CACHE_DIR / "partnerAreas.json"
    if not ref_file.exists():
        return {}
    raw = json.load(open(ref_file, encoding="utf-8"))
    results = raw if isinstance(raw, list) else raw.get("results", raw.get("data", []))
    mapping = {}
    for entry in results:
        if isinstance(entry, dict):
            code = int(entry.get("id", entry.get("PartnerCode", 0)))
            text = entry.get("text", entry.get("PartnerDesc", ""))
            if code and text:
                mapping[code] = text
    return mapping


def load_comtrade_totals(partner_ref):
    """Load Comtrade totals for Argentina (reporter=32) from cache.
    Returns (totals_by_year, chapters_by_partner)."""
    ct = defaultdict(lambda: defaultdict(lambda: {"exp": 0, "imp": 0}))
    # Also capture chapter-level data: ct_ch[country][year][(chapter, flow)] = value
    ct_ch = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))

    # First, find which years have chapter-level files vs AG6
    chapter_year_flows = set()
    ag6_files = []
    chapter_files = []

    for f in sorted(CACHE_DIR.glob("32_*_all.json")):
        parts = f.stem.split("_")
        year, flow = parts[1], parts[2]
        chapter_part = parts[3] if len(parts) > 3 else ""
        if len(chapter_part) == 2 and chapter_part.isdigit():
            chapter_files.append(f)
            chapter_year_flows.add((year, flow))
        elif chapter_part == "AG6":
            ag6_files.append(f)

    # Process chapter-level files first
    for f in chapter_files:
        parts = f.stem.split("_")
        year, flow = parts[1], parts[2]
        records = json.load(open(f, encoding="utf-8"))
        for rec in records:
            pc = rec.get("partnerCode", 0)
            if pc in SKIP_CODES or pc == 32:
                continue
            val = rec.get("primaryValue") or rec.get("fobvalue") or rec.get("cifvalue") or 0
            if val <= 0:
                continue
            pname = partner_ref.get(pc, "")
            canonical = normalize_comtrade_name(pname)
            if not canonical:
                continue
            fk = "exp" if flow == "X" else "imp"
            ct[canonical][year][fk] += val
            cmd = str(rec.get("cmdCode", ""))
            if len(cmd) == 2 and not cmd.startswith("99"):
                ct_ch[canonical][year][(cmd, fk)] += val

    # Process AG6 files for years without chapter files
    for f in ag6_files:
        parts = f.stem.split("_")
        year, flow = parts[1], parts[2]
        if (year, flow) in chapter_year_flows:
            continue  # Already have chapter-level data
        records = json.load(open(f, encoding="utf-8"))
        for rec in records:
            pc = rec.get("partnerCode", 0)
            if pc in SKIP_CODES or pc == 32:
                continue
            val = rec.get("primaryValue") or rec.get("fobvalue") or rec.get("cifvalue") or 0
            if val <= 0:
                continue
            pname = partner_ref.get(pc, "")
            canonical = normalize_comtrade_name(pname)
            if not canonical:
                continue
            fk = "exp" if flow == "X" else "imp"
            ct[canonical][year][fk] += val
            # Aggregate 6-digit codes to 2-digit for chapter breakdown
            cmd = str(rec.get("cmdCode", ""))
            ch = cmd[:2] if len(cmd) >= 2 else cmd
            if len(ch) == 2 and ch.isdigit() and not ch.startswith("99"):
                ct_ch[canonical][year][(ch, fk)] += val

    return ct, ct_ch


def main():
    print("=" * 60)
    print("Generating INDEC vs Comtrade discrepancy stats")
    print("=" * 60)

    if not CACHE_DIR.exists() or not list(CACHE_DIR.glob("32_*_all.json")):
        print("No Comtrade cache found for Argentina (32_*_all.json).")
        print("Run download_comtrade.py first or check comtrade_cache/")
        return

    partner_ref = load_partner_ref()
    ct_totals, ct_chapters = load_comtrade_totals(partner_ref)
    summary = json.load(open(ARG_DIR / "summary.json", encoding="utf-8"))
    products = json.load(open(ARG_DIR / "products.json", encoding="utf-8"))
    chapters = json.load(open(DATA_DIR / "chapters.json", encoding="utf-8"))

    # Also load existing ch99 validation if present
    existing_validation = {}
    val_file = ARG_DIR / "comtrade_validation.json"
    if val_file.exists():
        existing_validation = json.load(open(val_file, encoding="utf-8")).get("countries", {})

    years_available = sorted(set(y for country in ct_totals for y in ct_totals[country]))
    print(f"Comtrade years available: {years_available}")
    print(f"Partners in Comtrade: {len(ct_totals)}")

    validation = {
        "metadata": {
            "source": "comtrade_cache (local)",
            "years_compared": years_available,
            "disc_threshold_high": "P75 (dynamic)",
            "disc_threshold_medium": "P50 (dynamic)",
        },
        "countries": {},
    }

    # First pass: compute all discrepancy values to find thresholds
    raw_disc = {}
    for country in ct_totals:
        if country not in summary:
            continue
        total_ie = sum(summary[country]["years"].get(y, {}).get("exp", 0) for y in years_available)
        total_ce = sum(ct_totals[country].get(y, {}).get("exp", 0) for y in years_available)
        total_ii = sum(summary[country]["years"].get(y, {}).get("imp", 0) for y in years_available)
        total_ci = sum(ct_totals[country].get(y, {}).get("imp", 0) for y in years_available)

        gap_exp_pct = (total_ce - total_ie) / total_ie if total_ie > 0 else None
        gap_imp_pct = (total_ci - total_ii) / total_ii if total_ii > 0 else None
        raw_disc[country] = (total_ie, total_ce, total_ii, total_ci, gap_exp_pct, gap_imp_pct)

    # Compute percentile-based thresholds from export gaps (more systematic)
    exp_gaps = sorted([v[4] for v in raw_disc.values() if v[4] is not None])
    imp_gaps = sorted([v[5] for v in raw_disc.values() if v[5] is not None])

    if exp_gaps:
        p75_exp = exp_gaps[int(len(exp_gaps) * 0.75)]
        p50_exp = exp_gaps[int(len(exp_gaps) * 0.50)]
        disc_high = p75_exp
        disc_medium = p50_exp
        print(f"Exp gap distribution: median={p50_exp:.0%}, P75={p75_exp:.0%}")
    else:
        disc_high = DISC_HIGH_FALLBACK
        disc_medium = DISC_MEDIUM_FALLBACK

    if imp_gaps:
        p75_imp = imp_gaps[int(len(imp_gaps) * 0.75)]
        p50_imp = imp_gaps[int(len(imp_gaps) * 0.50)]
        print(f"Imp gap distribution: median={p50_imp:.0%}, P75={p75_imp:.0%}")

    print(f"Thresholds: high={disc_high:.0%}, medium={disc_medium:.0%}")

    # Second pass: build entries with severity
    high_count = 0
    for country in sorted(set(list(ct_totals.keys()) + list(existing_validation.keys()))):
        entry = {}

        # Preserve existing ch99 data
        if country in existing_validation and "ch99" in existing_validation[country]:
            entry["ch99"] = existing_validation[country]["ch99"]
        if country in existing_validation and "known_products" in existing_validation[country]:
            entry["known_products"] = existing_validation[country]["known_products"]

        # Compute discrepancy
        if country in raw_disc:
            total_ie, total_ce, total_ii, total_ci, gap_exp_pct, gap_imp_pct = raw_disc[country]

            by_year = {}
            for y in years_available:
                ie = summary[country]["years"].get(y, {}).get("exp", 0)
                ce = ct_totals[country].get(y, {}).get("exp", 0)
                ii = summary[country]["years"].get(y, {}).get("imp", 0)
                ci = ct_totals[country].get(y, {}).get("imp", 0)
                by_year[y] = {
                    "indec_exp": round(ie), "ct_exp": round(ce),
                    "indec_imp": round(ii), "ct_imp": round(ci),
                    "gap_exp": round(ce - ie), "gap_imp": round(ci - ii),
                    "gap_exp_pct": round((ce - ie) / ie, 4) if ie > 0 else None,
                    "gap_imp_pct": round((ci - ii) / ii, 4) if ii > 0 else None,
                }

            # Severity based on exp gap (more informative than imp)
            exp_gap = gap_exp_pct if gap_exp_pct is not None else 0
            severity = "high" if exp_gap > disc_high else "medium" if exp_gap > disc_medium else "low"

            entry["discrepancy"] = {
                "by_year": by_year,
                "total": {
                    "indec_exp": round(total_ie), "ct_exp": round(total_ce),
                    "indec_imp": round(total_ii), "ct_imp": round(total_ci),
                    "gap_exp": round(total_ce - total_ie),
                    "gap_imp": round(total_ci - total_ii),
                    "gap_exp_pct": round(gap_exp_pct, 4) if gap_exp_pct is not None else None,
                    "gap_imp_pct": round(gap_imp_pct, 4) if gap_imp_pct is not None else None,
                },
                "severity": severity,
            }

            if severity == "high":
                high_count += 1

        # Compute probable_products for high ch99 countries, per year
        # Store per-year CT chapter data so UI can filter by selectedYears
        is_ch99_high = entry.get("ch99", {}).get("high", False)
        if is_ch99_high and country in ct_chapters and country in products:
            probable_by_year = {}
            for y in years_available:
                ch99_exp_y = products[country].get(y, {}).get("exp", {}).get("99", 0)
                ch99_imp_y = products[country].get(y, {}).get("imp", {}).get("99", 0)

                if ch99_exp_y < 50000 and ch99_imp_y < 50000:
                    continue

                year_ct = ct_chapters[country].get(y, {})
                if not year_ct:
                    continue

                year_probable = {}
                for fk in ["exp", "imp"]:
                    ch99_val = ch99_exp_y if fk == "exp" else ch99_imp_y
                    if ch99_val < 50000:
                        continue
                    ct_by_ch = [(ch, val) for (ch, f), val in year_ct.items() if f == fk]
                    top = sorted(ct_by_ch, key=lambda x: -x[1])[:5]
                    if top:
                        year_probable[fk] = [
                            {"chapter": ch, "name": chapters.get(ch, f"Cap. {ch}"), "ct_value": round(val)}
                            for ch, val in top
                        ]

                if year_probable:
                    probable_by_year[y] = year_probable

            if probable_by_year:
                entry["probable_products_by_year"] = probable_by_year

        if entry:
            validation["countries"][country] = entry

    # Write output
    with open(val_file, "w", encoding="utf-8") as f:
        json.dump(validation, f, ensure_ascii=False, indent=2)

    total = len(validation["countries"])
    with_disc = sum(1 for c in validation["countries"].values() if "discrepancy" in c)
    print(f"\nOutput: {val_file}")
    print(f"Countries: {total} total, {with_disc} with discrepancy data")
    print(f"High discrepancy (>P75): {high_count}")

    # Show top discrepancies
    disc_list = [
        (name, data["discrepancy"]["total"])
        for name, data in validation["countries"].items()
        if "discrepancy" in data and data["discrepancy"]["severity"] == "high"
    ]
    disc_list.sort(key=lambda x: abs(x[1].get("gap_exp", 0)) + abs(x[1].get("gap_imp", 0)), reverse=True)

    print(f"\nTop high-discrepancy countries:")
    for name, t in disc_list[:15]:
        gep = t.get("gap_exp_pct")
        gip = t.get("gap_imp_pct")
        ge_str = f"{gep:+.0%}" if gep is not None else "n/a"
        gi_str = f"{gip:+.0%}" if gip is not None else "n/a"
        print(f"  {name:25s}  exp gap: ${t['gap_exp']/1e6:>+8.0f}M ({ge_str})  imp gap: ${t['gap_imp']/1e6:>+8.0f}M ({gi_str})")


if __name__ == "__main__":
    main()
