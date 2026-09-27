-- Toronto's 158 official neighbourhoods -- the spatial join unit chosen in
-- ADR-0005 over raw StatCan Dissemination Areas. Seeded from
-- ml-pipeline/data/raw/neighbourhoods.geojson via
-- database/scripts/seed-neighbourhoods.js, not by this migration.
CREATE TABLE neighbourhoods (
    id               SERIAL PRIMARY KEY,
    area_name        TEXT NOT NULL UNIQUE,
    area_short_code  TEXT,
    geom             geometry(MultiPolygon, 4326) NOT NULL
);

CREATE INDEX neighbourhoods_geom_idx ON neighbourhoods USING GIST (geom);
