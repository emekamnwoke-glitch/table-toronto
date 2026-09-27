// Loads Toronto's 158 official neighbourhoods from the GeoJSON pulled by
// scripts/fetch-data.sh into the neighbourhoods table, using PostGIS's
// ST_GeomFromGeoJSON rather than a separate GIS library -- this is the
// only place the schema needs geometry input, so it isn't worth adding
// a geo dependency to the Node toolchain for it.
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const GEOJSON_PATH = path.join(__dirname, "../../ml-pipeline/data/raw/neighbourhoods.geojson");

async function main() {
  if (!fs.existsSync(GEOJSON_PATH)) {
    console.error(`${GEOJSON_PATH} not found -- run scripts/fetch-data.sh first`);
    process.exit(1);
  }

  const geojson = JSON.parse(fs.readFileSync(GEOJSON_PATH, "utf8"));
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  let inserted = 0;
  for (const feature of geojson.features) {
    const { AREA_NAME, AREA_SHORT_CODE } = feature.properties;
    const result = await client.query(
      `INSERT INTO neighbourhoods (area_name, area_short_code, geom)
       VALUES ($1, $2, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($3), 4326)))
       ON CONFLICT (area_name) DO NOTHING`,
      [AREA_NAME, AREA_SHORT_CODE, JSON.stringify(feature.geometry)]
    );
    inserted += result.rowCount;
  }

  console.log(`inserted ${inserted} of ${geojson.features.length} neighbourhoods (rest already present)`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
