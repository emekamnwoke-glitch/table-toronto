// Integration tests for the manager role and /merchant routes. Needs the
// docker-compose Postgres with migrations applied; creates a throwaway
// restaurant and accounts (@example.test) and removes them afterwards.
process.env.NODE_ENV = "test";
require("dotenv").config({ path: require("path").join(__dirname, "../../../.env") });

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const { assertJwtSecret } = require("../src/auth");
const app = require("../src/app");
const { pool } = require("../src/db");

const run = Date.now();
const email = (n) => `m${run}-${n}@example.test`;
const PASSWORD = "correct-horse-1";

let server;
let base;
let restaurantId;
let otherRestaurantId;
let managerToken;
let dinerToken;

async function call(method, route, { body, token } = {}) {
  const res = await fetch(base + route, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

const makeRestaurant = async (name) =>
  (
    await pool.query(
      `INSERT INTO restaurants (operating_name, address, location)
       VALUES ($1, $2, ST_SetSRID(ST_MakePoint(-79.38, 43.65), 4326)) RETURNING id`,
      [`${name} ${run}`, `1 Test St ${run}`]
    )
  ).rows[0].id;

before(async () => {
  assertJwtSecret();
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}/api/v1`;

  restaurantId = await makeRestaurant("Test Bistro");
  otherRestaurantId = await makeRestaurant("Other Bistro");

  // Provision the manager the way an operator would: with the script.
  execFileSync(
    process.execPath,
    [
      path.join(__dirname, "../../../database/scripts/create-manager.js"),
      "--email", email("mgr"),
      "--restaurant", restaurantId,
      "--password", PASSWORD,
    ],
    { stdio: "pipe" }
  );
  managerToken = (await call("POST", "/auth/login", { body: { email: email("mgr"), password: PASSWORD } })).body.token;
  dinerToken = (
    await call("POST", "/auth/register", { body: { email: email("diner"), password: PASSWORD } })
  ).body.token;
});

after(async () => {
  await pool.query("DELETE FROM restaurants WHERE id = ANY($1)", [[restaurantId, otherRestaurantId]]);
  await pool.query("DELETE FROM users WHERE email LIKE $1", [`m${run}-%@example.test`]);
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test("login as a manager returns the manager role", async () => {
  const res = await call("POST", "/auth/login", { body: { email: email("mgr"), password: PASSWORD } });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.role, "manager");
});

test("merchant routes reject anonymous users and diners", async () => {
  assert.equal((await call("GET", "/merchant/restaurant")).status, 401);
  assert.equal((await call("GET", "/merchant/restaurant", { token: dinerToken })).status, 403);
  assert.equal(
    (await call("PATCH", "/merchant/restaurant", { token: dinerToken, body: { accessible: true } })).status,
    403
  );
});

test("a manager sees only their own restaurant", async () => {
  const res = await call("GET", "/merchant/restaurant", { token: managerToken });
  assert.equal(res.status, 200);
  assert.equal(res.body.restaurant.id, restaurantId);
  assert.equal(res.body.restaurant.accessible, false);
});

test("a manager can update their restaurant, with validation", async () => {
  const ok = await call("PATCH", "/merchant/restaurant", {
    token: managerToken,
    body: { cuisine: " Italian ", priceLevel: 2, accessible: true, seatingCapacity: 40, holdWindowMinutes: 20 },
  });
  assert.equal(ok.status, 200);
  assert.deepEqual(
    [ok.body.restaurant.cuisine, ok.body.restaurant.priceLevel, ok.body.restaurant.accessible],
    ["Italian", 2, true]
  );
  assert.equal(ok.body.restaurant.seatingCapacity, 40);
  assert.equal(ok.body.restaurant.holdWindowMinutes, 20);

  for (const bad of [{ priceLevel: 9 }, { accessible: "yes" }, { holdWindowMinutes: 1 }, { cuisine: "" }, {}]) {
    const res = await call("PATCH", "/merchant/restaurant", { token: managerToken, body: bad });
    assert.equal(res.status, 400, JSON.stringify(bad));
  }
});

test("edits never touch another restaurant", async () => {
  const { rows } = await pool.query("SELECT cuisine, accessible FROM restaurants WHERE id = $1", [otherRestaurantId]);
  assert.equal(rows[0].cuisine, null);
  assert.equal(rows[0].accessible, false);
});

test("the create-manager script refuses to replace a manager without --force", () => {
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        [
          path.join(__dirname, "../../../database/scripts/create-manager.js"),
          "--email", email("second"),
          "--restaurant", restaurantId,
        ],
        { stdio: "pipe" }
      ),
    (err) => /already has a manager/.test(err.stderr.toString())
  );
});

test("public registration can only ever create diners", async () => {
  const res = await call("POST", "/auth/register", {
    body: { email: email("sneaky"), password: PASSWORD, role: "manager" },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.user.role, "diner");
});
