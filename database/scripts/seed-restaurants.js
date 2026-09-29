// Loads ml-pipeline/data/processed/restaurants_with_neighbourhood.csv
// (geocoded restaurants joined to their neighbourhood, built by
// ml-pipeline/scripts/build_restaurant_features.py) into the restaurants
// table.
//
// Only the fields that pipeline actually produces are set: name, address,
// location, and neighbourhood. cuisine, price_level, accessible, and
// seating_capacity stay NULL/default for now -- Toronto's Business
// Licences source (ADR-0003) doesn't carry them, and there's no PLUTO-
// equivalent land-use source wired up yet (see the open question in
// DECISIONS.md). Enriching those is separate future work, not something
// to fake here with placeholder values.
const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");
const { Client } = require("pg");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const CSV_PATH = path.join(
  __dirname,
  "../../ml-pipeline/data/processed/restaurants_with_neighbourhood.csv"
);

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`${CSV_PATH} not found -- run build_restaurant_features.py first`);
    process.exit(1);
  }

  const rows = parse(fs.readFileSync(CSV_PATH, "utf8"), { columns: true, skip_empty_lines: true });

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const nbRes = await client.query("SELECT id, area_name FROM neighbourhoods");
  const neighbourhoodIdByName = new Map(nbRes.rows.map((r) => [r.area_name, r.id]));

  let inserted = 0;
  let skippedNoNeighbourhood = 0;
  let skippedBlankName = 0;

  for (const row of rows) {
    // A handful of Toronto Business Licences records ship with an empty
    // Operating Name -- real messiness in the source, not something to
    // paper over with a placeholder. Not useful for a discovery app, so
    // skipped rather than seeded.
    if (!row["Operating Name"] || !row["Operating Name"].trim()) {
      skippedBlankName++;
      continue;
    }

    const neighbourhoodId = neighbourhoodIdByName.get(row.AREA_NAME) ?? null;
    if (!neighbourhoodId) skippedNoNeighbourhood++;

    const result = await client.query(
      `INSERT INTO restaurants (operating_name, address, location, neighbourhood_id)
       VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), $5)
       ON CONFLICT (operating_name, address) DO NOTHING`,
      [row["Operating Name"], row["Licence Address Line 1"], Number(row.lon), Number(row.lat), neighbourhoodId]
    );
    inserted += result.rowCount;
  }

  console.log(
    `inserted ${inserted} of ${rows.length} restaurants (rest already present); ` +
      `${skippedBlankName} skipped for a blank operating name, ` +
      `${skippedNoNeighbourhood} had no matching neighbourhood row`
  );
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
