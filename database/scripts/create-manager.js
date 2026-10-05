// Creates a restaurant-manager account and assigns it to one restaurant.
// Managers are not self-service: nothing in the public API can mint one,
// so this is the operator's tool.
//
//   npm run create-manager -- --email owner@example.com --restaurant "<uuid or exact name>"
//                             [--name "Display Name"] [--password "..."] [--force]
//
// Without --password a random one is generated and printed once. --force
// replaces an existing manager of that restaurant (the old account is kept
// but loses the assignment).
const crypto = require("crypto");
const path = require("path");
const bcrypt = require("bcryptjs");
const { Client } = require("pg");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else out[key] = argv[++i];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args.email !== "string" || typeof args.restaurant !== "string") {
    console.error('usage: create-manager --email <email> --restaurant "<uuid or exact name>" [--name ..] [--password ..] [--force]');
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(args.restaurant);
    const found = await client.query(
      isUuid
        ? "SELECT id, operating_name, address, manager_user_id FROM restaurants WHERE id = $1"
        : "SELECT id, operating_name, address, manager_user_id FROM restaurants WHERE operating_name = $1",
      [args.restaurant]
    );
    if (found.rowCount === 0) throw new Error(`No restaurant matches "${args.restaurant}"`);
    if (found.rowCount > 1) {
      const list = found.rows.map((r) => `  ${r.id}  ${r.operating_name}, ${r.address}`).join("\n");
      throw new Error(`"${args.restaurant}" matches ${found.rowCount} restaurants; pass one of these ids instead:\n${list}`);
    }
    const restaurant = found.rows[0];
    if (restaurant.manager_user_id && !args.force) {
      throw new Error(`${restaurant.operating_name} already has a manager; pass --force to replace them`);
    }

    const password = typeof args.password === "string" ? args.password : crypto.randomBytes(12).toString("base64url");
    if (password.length < 8 || Buffer.byteLength(password) > 72) throw new Error("Password must be 8-72 bytes");
    const hash = await bcrypt.hash(password, 10);

    await client.query("BEGIN");
    const user = await client.query(
      `INSERT INTO users (email, password_hash, display_name, role, onboarded_at)
       VALUES (lower($1), $2, $3, 'manager', now()) RETURNING id`,
      [args.email.trim(), hash, typeof args.name === "string" ? args.name : null]
    );
    await client.query("UPDATE restaurants SET manager_user_id = $1 WHERE id = $2", [user.rows[0].id, restaurant.id]);
    await client.query("COMMIT");

    console.log(`Created manager ${args.email.toLowerCase()} for ${restaurant.operating_name} (${restaurant.address})`);
    if (typeof args.password !== "string") console.log(`Password (shown once): ${password}`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err.code === "23505" ? "That email is already registered" : err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
