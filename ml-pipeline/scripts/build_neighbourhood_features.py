"""
Join Bike Share Toronto stations to Toronto Neighbourhoods, then aggregate
trips into hourly-by-weekday counts per neighbourhood. This is the
Toronto substitute for the original project's taxi-drop-off-by-zone
aggregation. See:
  - docs/architecture/adr/0004-mobility-proxy-bike-share.md
  - docs/architecture/adr/0005-zone-geometry-unit.md
"""
import glob
import json
from pathlib import Path

import geopandas as gpd
import pandas as pd

HERE = Path(__file__).resolve().parent
RAW = HERE / "../data/raw"
PROCESSED = HERE / "../data/processed"


def load_stations_with_neighbourhood() -> gpd.GeoDataFrame:
    neighbourhoods = gpd.read_file(RAW / "neighbourhoods.geojson")[["AREA_NAME", "AREA_SHORT_CODE", "geometry"]]

    stations = json.load(open(RAW / "station_info.json"))["data"]["stations"]
    st_df = pd.DataFrame(stations)[["station_id", "name", "lat", "lon"]]
    st_gdf = gpd.GeoDataFrame(st_df, geometry=gpd.points_from_xy(st_df.lon, st_df.lat), crs="EPSG:4326")

    joined = gpd.sjoin(st_gdf, neighbourhoods, how="left", predicate="within")
    unmatched = joined["AREA_NAME"].isna().sum()
    if unmatched:
        print(f"warning: {unmatched} of {len(joined)} stations did not fall inside any neighbourhood polygon")
    return joined[["station_id", "name", "lat", "lon", "AREA_NAME", "AREA_SHORT_CODE"]]


def aggregate_trips(stations_with_nb: pd.DataFrame) -> pd.DataFrame:
    trip_files = sorted(glob.glob(str(RAW / "bikeshare-ridership-*.csv")))
    if not trip_files:
        raise FileNotFoundError(f"No bikeshare-ridership-*.csv files found in {RAW} — run scripts/fetch-data.sh first")

    frames = []
    for path in trip_files:
        df = pd.read_csv(path, usecols=["Start_Time", "Start_Station_Id"])
        df["Start_Time"] = pd.to_datetime(df["Start_Time"], errors="coerce")
        frames.append(df)
    trips = pd.concat(frames, ignore_index=True)

    trips["hour"] = trips["Start_Time"].dt.hour
    trips["weekday"] = trips["Start_Time"].dt.day_name()
    trips["Start_Station_Id"] = trips["Start_Station_Id"].astype(str)

    stations_with_nb = stations_with_nb.copy()
    stations_with_nb["station_id"] = stations_with_nb["station_id"].astype(str)

    merged = trips.merge(
        stations_with_nb[["station_id", "AREA_NAME"]],
        left_on="Start_Station_Id",
        right_on="station_id",
        how="left",
    )
    resolved = merged["AREA_NAME"].notna().sum()
    print(f"{resolved} of {len(merged)} trips resolved to a neighbourhood ({resolved / len(merged):.1%})")

    return merged.groupby(["AREA_NAME", "weekday", "hour"]).size().reset_index(name="trip_count")


def report_coverage_gap(neighbourhoods_path: Path, stations_with_nb: pd.DataFrame) -> None:
    all_names = gpd.read_file(neighbourhoods_path)["AREA_NAME"]
    covered = set(stations_with_nb["AREA_NAME"].dropna())
    zero_coverage = sorted(set(all_names) - covered)
    print(f"{len(zero_coverage)} of {len(all_names)} neighbourhoods have zero bike-share stations:")
    for n in zero_coverage:
        print(f"  - {n}")


def main():
    PROCESSED.mkdir(parents=True, exist_ok=True)

    stations_with_nb = load_stations_with_neighbourhood()
    stations_with_nb.to_csv(PROCESSED / "stations_with_neighbourhood.csv", index=False)

    report_coverage_gap(RAW / "neighbourhoods.geojson", stations_with_nb)

    hourly = aggregate_trips(stations_with_nb)
    hourly.to_csv(PROCESSED / "neighbourhood_hourly_trips.csv", index=False)
    print(f"Wrote {len(hourly)} neighbourhood/weekday/hour rows to {PROCESSED / 'neighbourhood_hourly_trips.csv'}")


if __name__ == "__main__":
    main()
