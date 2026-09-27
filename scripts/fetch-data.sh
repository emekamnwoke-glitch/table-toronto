#!/usr/bin/env bash
# Pulls the raw open datasets this project depends on into ml-pipeline/data/raw/.
# Re-running is safe; each dataset overwrites its own file.
set -euo pipefail

RAW_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/ml-pipeline/data/raw"
mkdir -p "$RAW_DIR"
cd "$RAW_DIR"

echo "==> Toronto business licences (restaurant listings)"
curl -sL "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/57b2285f-4f80-45fb-ae3e-41a02c3a137f/resource/169e90ba-3ae0-43dd-8b2f-919e87002f50/download/business.licences.csv" \
  -o business_licences.csv

echo "==> Bike Share Toronto ridership (current year)"
CURRENT_YEAR=$(date +%Y)
curl -sL "https://opendata.toronto.ca/toronto.parking.authority/bike-share-toronto-ridership-data/bikeshare-ridership-${CURRENT_YEAR}.zip" \
  -o "bikeshare-ridership-${CURRENT_YEAR}.zip"
unzip -o -q "bikeshare-ridership-${CURRENT_YEAR}.zip"

echo "==> Bike Share station locations (live GBFS feed)"
curl -s "https://tor.publicbikesystem.net/ube/gbfs/v1/en/station_information" \
  -o station_info.json

echo "Done. Raw files are in $RAW_DIR (gitignored)."
echo "Note: business_licences.csv is known to be frozen at Dec 2022 upstream —"
echo "see docs/architecture/DECISIONS.md before treating it as current."
