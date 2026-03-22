"""
Generate chapter 99 (NCM 9999) statistics from existing INDEC data.
No API key needed - works purely from local data.

For countries with high ch99, flags them as "Prob. confidencial".

Usage: python scripts/generate_ch99_stats.py
"""

import json
from pathlib import Path
from collections import defaultdict

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "public" / "data"
REPORTERS = ["arg", "ury", "pry"]

CH99_THRESHOLD = 0.05  # 5%


def process_reporter(reporter_key):
    """Process ch99 stats for a reporter."""
    reporter_dir = DATA_DIR / "reporters" / reporter_key
    products_file = reporter_dir / "products.json"
    summary_file = reporter_dir / "summary.json"

    if not products_file.exists():
        print(f"  {reporter_key}: no products.json, skipping")
        return

    products = json.load(open(products_file, encoding="utf-8"))
    summary = json.load(open(summary_file, encoding="utf-8"))

    # Load chapters for names
    chapters_file = DATA_DIR / "chapters.json"
    chapters = json.load(open(chapters_file, encoding="utf-8")) if chapters_file.exists() else {}

    validation = {"metadata": {"source": "local", "ch99_threshold": CH99_THRESHOLD}, "countries": {}}

    for country, years_data in sorted(products.items()):
        ch99_by_year = {}
        all_exp_pct = []
        all_imp_pct = []

        for year, flows in years_data.items():
            exp_total = sum(flows.get("exp", {}).values())
            imp_total = sum(flows.get("imp", {}).values())
            exp_99 = sum(v for k, v in flows.get("exp", {}).items() if k.startswith("99"))
            imp_99 = sum(v for k, v in flows.get("imp", {}).items() if k.startswith("99"))

            exp_pct = exp_99 / exp_total if exp_total > 0 else 0
            imp_pct = imp_99 / imp_total if imp_total > 0 else 0

            ch99_by_year[year] = {
                "exp_pct": round(exp_pct, 4),
                "imp_pct": round(imp_pct, 4),
                "exp_val": round(exp_99),
                "imp_val": round(imp_99),
            }
            all_exp_pct.append(exp_pct)
            all_imp_pct.append(imp_pct)

        avg_exp = sum(all_exp_pct) / len(all_exp_pct) if all_exp_pct else 0
        avg_imp = sum(all_imp_pct) / len(all_imp_pct) if all_imp_pct else 0
        max_exp = max(all_exp_pct) if all_exp_pct else 0
        max_imp = max(all_imp_pct) if all_imp_pct else 0
        is_high = max_exp > CH99_THRESHOLD or max_imp > CH99_THRESHOLD

        # Only include countries with some ch99 trade
        has_any_99 = any(
            s["exp_val"] > 0 or s["imp_val"] > 0 for s in ch99_by_year.values()
        )
        if not has_any_99:
            continue

        entry = {
            "ch99": {
                "by_year": ch99_by_year,
                "avg_exp_pct": round(avg_exp, 4),
                "avg_imp_pct": round(avg_imp, 4),
                "max_exp_pct": round(max_exp, 4),
                "max_imp_pct": round(max_imp, 4),
                "high": is_high,
            }
        }

        # For high-ch99 countries, find which non-99 products dominate
        # (to give context about what's NOT confidential)
        if is_high:
            top_known = {"exp": defaultdict(float), "imp": defaultdict(float)}
            for year, flows in years_data.items():
                for flow in ["exp", "imp"]:
                    for ch, val in flows.get(flow, {}).items():
                        if not ch.startswith("99"):
                            top_known[flow][ch] += val

            known_products = {}
            for flow in ["exp", "imp"]:
                sorted_chs = sorted(top_known[flow].items(), key=lambda x: -x[1])[:5]
                known_products[flow] = [
                    {"chapter": ch, "name": chapters.get(ch, f"Cap. {ch}"), "value": round(val)}
                    for ch, val in sorted_chs
                ]
            entry["known_products"] = known_products

        validation["countries"][country] = entry

    # Write
    output_file = reporter_dir / "comtrade_validation.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(validation, f, ensure_ascii=False, indent=2)

    # Stats
    total = len(validation["countries"])
    high = sum(1 for c in validation["countries"].values() if c.get("ch99", {}).get("high"))
    print(f"  {reporter_key}: {total} countries with ch99, {high} flagged high (>{CH99_THRESHOLD:.0%})")

    # Show top high-ch99 countries
    if high > 0:
        high_list = [
            (name, data["ch99"]["max_exp_pct"], data["ch99"]["max_imp_pct"])
            for name, data in validation["countries"].items()
            if data["ch99"]["high"]
        ]
        high_list.sort(key=lambda x: max(x[1], x[2]), reverse=True)
        for name, ep, ip in high_list[:10]:
            print(f"    {name}: exp {ep:.1%}, imp {ip:.1%}")


def main():
    print("=" * 60)
    print("Generating Chapter 99 (NCM 9999) statistics")
    print("=" * 60)

    for reporter_key in REPORTERS:
        print(f"\n{reporter_key.upper()}:")
        process_reporter(reporter_key)

    print(f"\n{'='*60}")
    print("Done! Files written to reporters/*/comtrade_validation.json")
    print("='*60")


if __name__ == "__main__":
    main()
