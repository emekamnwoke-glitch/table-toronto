"""
Builds the restaurant x weekday x hour feature grid the busyness model
will eventually train on.

THIS IS DELIBERATELY PARTIAL. Of the original model's feature set
(Table II in the source paper), only three groups are buildable from
data we actually have right now:

  - mobility demand      (Bike Share Toronto trip_count, ADR-0004)
  - cyclical time         (hour_sin, hour_cos)
  - weekday indicators    (is_friday, is_saturday, is_sunday)

Still missing, blocked on open decisions (see DECISIONS.md):
  - google_rating, review_count, typical_visit_duration  -- needs
    Google Places API access, not yet set up
  - restaurant_area, turnover_rate, takeaway_ratio        -- needs a
    PLUTO-equivalent land-use/cuisine source, not yet chosen
  - busyness_level (the TARGET)                           -- also
    Google Places popular-times data

Running this now is still useful: it's the full restaurant x time grid
the app needs for serving predictions at every hour, and it's the
mobility feature actually joined at restaurant grain rather than just
neighbourhood grain, which is a real integration step even without a
trainable target yet.
"""
import numpy as np
import pandas as pd
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROCESSED = HERE / "../data/processed"

WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def main():
    restaurants = pd.read_csv(PROCESSED / "restaurants_with_neighbourhood.csv")
    restaurants = restaurants.rename(columns={"Operating Name": "operating_name", "AREA_NAME": "area_name"})
    restaurants = restaurants[["operating_name", "area_name"]].reset_index().rename(columns={"index": "restaurant_id"})

    trips = pd.read_csv(PROCESSED / "neighbourhood_hourly_trips.csv").rename(columns={"AREA_NAME": "area_name"})

    # full restaurant x weekday x hour grid -- this is the serving-time
    # grid, not a training-observation grid, since there's no target
    # timestamps to observe yet
    hours = pd.DataFrame({"hour": range(24)})
    weekdays = pd.DataFrame({"weekday": WEEKDAYS})
    grid = restaurants.merge(weekdays, how="cross").merge(hours, how="cross")

    merged = grid.merge(trips, on=["area_name", "weekday", "hour"], how="left")
    merged["trip_count"] = merged["trip_count"].fillna(0).astype(int)

    # cyclical time encoding, same sine/cosine approach as the original
    merged["hour_sin"] = np.sin(2 * np.pi * merged["hour"] / 24)
    merged["hour_cos"] = np.cos(2 * np.pi * merged["hour"] / 24)

    merged["is_friday"] = (merged["weekday"] == "Friday").astype(int)
    merged["is_saturday"] = (merged["weekday"] == "Saturday").astype(int)
    merged["is_sunday"] = (merged["weekday"] == "Sunday").astype(int)

    # a neighbourhood has zero coverage if it never appears in trips at all
    covered_neighbourhoods = set(trips["area_name"].unique())
    merged["has_mobility_coverage"] = merged["area_name"].isin(covered_neighbourhoods).astype(int)

    # explicit placeholders for the features that can't be built yet --
    # present as columns (so downstream code doesn't have to special-case
    # their absence) but genuinely empty, not zero-filled or guessed
    for col in ["google_rating", "review_count", "typical_visit_duration",
                "restaurant_area", "turnover_rate", "takeaway_ratio", "busyness_level"]:
        merged[col] = np.nan

    out_cols = [
        "restaurant_id", "operating_name", "area_name", "weekday", "hour",
        "trip_count", "hour_sin", "hour_cos", "is_friday", "is_saturday", "is_sunday",
        "has_mobility_coverage",
        "google_rating", "review_count", "typical_visit_duration",
        "restaurant_area", "turnover_rate", "takeaway_ratio", "busyness_level",
    ]
    result = merged[out_cols]
    result.to_csv(PROCESSED / "feature_matrix.csv", index=False)

    n_restaurants = restaurants["restaurant_id"].nunique()
    no_coverage = result[result["has_mobility_coverage"] == 0]["restaurant_id"].nunique()
    print(f"wrote {len(result):,} rows ({n_restaurants:,} restaurants x 7 weekdays x 24 hours)")
    print(f"{no_coverage:,} of {n_restaurants:,} restaurants ({no_coverage / n_restaurants:.1%}) "
          f"have zero mobility-proxy coverage for every hour")
    print("7 of 16 feature columns are populated; the rest (including the target) "
          "are empty pending the Google Places / land-use decisions in DECISIONS.md")


if __name__ == "__main__":
    main()
