"""
Spatially join geocoded restaurants to Toronto Neighbourhoods, producing
the restaurant-level table that neighbourhood_hourly_trips.csv (see
build_neighbourhood_features.py) joins against on AREA_NAME to build
model features.

Run after scripts/geocode_restaurants.py has finished (or at least made
progress — rows without a lat/lon are reported and dropped, not silently
included).
"""
from pathlib import Path

import geopandas as gpd
import pandas as pd

HERE = Path(__file__).resolve().parent
RAW = HERE / "../data/raw"
PROCESSED = HERE / "../data/processed"


def main():
    restaurants = pd.read_csv(PROCESSED / "restaurants_geocoded.csv")
    total = len(restaurants)

    unmatched = restaurants[restaurants["match"] != "ok"]
    geocoded = restaurants[restaurants["match"] == "ok"].copy()
    print(f"{len(geocoded)} of {total} restaurants geocoded ({len(geocoded) / total:.1%}); "
          f"{len(unmatched)} had no geocoding match")

    gdf = gpd.GeoDataFrame(
        geocoded,
        geometry=gpd.points_from_xy(geocoded["lon"].astype(float), geocoded["lat"].astype(float)),
        crs="EPSG:4326",
    )

    neighbourhoods = gpd.read_file(RAW / "neighbourhoods.geojson")[["AREA_NAME", "AREA_SHORT_CODE", "geometry"]]
    joined = gpd.sjoin(gdf, neighbourhoods, how="left", predicate="within")

    outside = joined["AREA_NAME"].isna().sum()
    if outside:
        print(f"warning: {outside} geocoded restaurants fell outside all neighbourhood polygons "
              f"(likely geocoded to just outside Toronto's boundary)")

    result = joined[["Operating Name", "Licence Address Line 1", "lat", "lon", "AREA_NAME", "AREA_SHORT_CODE"]]
    result.to_csv(PROCESSED / "restaurants_with_neighbourhood.csv", index=False)
    print(f"Wrote {len(result)} rows to {PROCESSED / 'restaurants_with_neighbourhood.csv'}")

    # Cross-check against the known bike-share coverage gap (ADR-0004/0005):
    # how many restaurants sit in a neighbourhood with zero bike-share stations?
    stations_nb = pd.read_csv(PROCESSED / "stations_with_neighbourhood.csv")
    zero_coverage_neighbourhoods = set(neighbourhoods["AREA_NAME"]) - set(stations_nb["AREA_NAME"].dropna())
    affected = result["AREA_NAME"].isin(zero_coverage_neighbourhoods).sum()
    print(f"{affected} of {len(result)} geocoded restaurants ({affected / len(result):.1%}) "
          f"sit in a neighbourhood with zero bike-share stations")


if __name__ == "__main__":
    main()
