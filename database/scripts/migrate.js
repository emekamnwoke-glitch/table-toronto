// Minimal migration runner: applies numbered .sql files from
// database/migrations/ in order, tracking what's already run in
// schema_migrations. Postgres's own docker-entrypoint-initdb.d only
// runs scripts once, on a completely empty data volume -- it can't
// apply new migrations to an already-initialized database, so this
// exists instead of relying on that mechanism.
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const MIGRATIONS_DIR = path.join(__dirname, "../migrations");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set(
    (await client.query("SELECT filename FROM schema_migrations")).rows.map((r) => r.filename)
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let ranCount = 0;
  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    console.log(`applying ${file}`);
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      await client.query("COMMIT");
      ranCount++;
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`failed on ${file}:`, err.message);
      process.exitCode = 1;
      break;
    }
  }

  console.log(ranCount ? `applied ${ranCount} migration(s)` : "nothing to apply, up to date");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
