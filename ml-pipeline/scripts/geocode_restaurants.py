"""
Geocode active Toronto restaurant listings via Nominatim (OpenStreetMap).

Respects Nominatim's 1 req/sec polite-use policy. Resumable: re-running
skips rows already geocoded in the output file, so an interrupted run
loses no progress. See docs/architecture/adr/0013-geocoding-service.md.
"""
import csv
import re
import sys
import time
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
INPUT = HERE / "../data/processed/active_eating_establishments.csv"
OUTPUT = HERE / "../data/processed/restaurants_geocoded.csv"
USER_AGENT = "table-toronto-research/0.1 (solo academic project; contact: alertsforemeka@gmail.com)"
RATE_LIMIT_SECONDS = 1.1


def clean_address(addr: str) -> str:
    # Strip unit/suite/floor qualifiers after the first comma — Nominatim
    # matches the base street address far more reliably without them.
    return re.split(r",", addr)[0].strip()


def load_done(output_path: Path) -> set[str]:
    if not output_path.exists():
        return set()
    with output_path.open(newline="", encoding="utf-8") as f:
        return {row["Operating Name"] + "|" + row["Licence Address Line 1"] for row in csv.DictReader(f)}


def geocode(address: str) -> tuple[str, str] | None:
    resp = requests.get(
        "https://nominatim.openstreetmap.org/search",
        params={"q": f"{address}, Toronto, ON, Canada", "format": "json", "limit": 1},
        headers={"User-Agent": USER_AGENT},
        timeout=10,
    )
    resp.raise_for_status()
    hits = resp.json()
    if not hits:
        return None
    return hits[0]["lat"], hits[0]["lon"]


def main():
    with INPUT.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    done = load_done(OUTPUT)
    file_exists = OUTPUT.exists()
    fieldnames = ["Operating Name", "Licence Address Line 1", "lat", "lon", "match"]

    with OUTPUT.open("a", newline="", encoding="utf-8") as out:
        writer = csv.DictWriter(out, fieldnames=fieldnames)
        if not file_exists:
            writer.writeheader()

        remaining = [r for r in rows if r["Operating Name"] + "|" + r["Licence Address Line 1"] not in done]
        print(f"{len(rows)} total, {len(done)} already geocoded, {len(remaining)} remaining", file=sys.stderr)

        for i, row in enumerate(remaining):
            addr = clean_address(row["Licence Address Line 1"])
            try:
                hit = geocode(addr)
            except requests.RequestException as e:
                print(f"[{i}] request error for {addr!r}: {e}", file=sys.stderr)
                hit = None

            base = {"Operating Name": row["Operating Name"], "Licence Address Line 1": row["Licence Address Line 1"]}
            if hit:
                lat, lon = hit
                writer.writerow({**base, "lat": lat, "lon": lon, "match": "ok"})
            else:
                writer.writerow({**base, "lat": "", "lon": "", "match": "no_match"})

            out.flush()
            if (i + 1) % 100 == 0:
                print(f"[{i + 1}/{len(remaining)}] {row['Operating Name']}", file=sys.stderr)

            time.sleep(RATE_LIMIT_SECONDS)

    print("Done.", file=sys.stderr)


if __name__ == "__main__":
    main()
