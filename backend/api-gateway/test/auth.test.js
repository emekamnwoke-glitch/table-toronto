// Integration tests: they run against the real Postgres from docker-compose
// (start it and run `npm run migrate --prefix database` first). Each run
// uses throwaway @example.test accounts and deletes them afterwards.
process.env.NODE_ENV = "test";
require("dotenv").config({ path: require("path").join(__dirname, "../../../.env") });

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const { assertJwtSecret } = require("../src/auth");
const app = require("../src/app");
const { pool } = require("../src/db");

const run = Date.now();
const email = (n) => `t${run}-${n}@example.test`;
const PASSWORD = "correct-horse-1";

let server;
let base;

before(async () => {
  assertJwtSecret();
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});

after(async () => {
  await pool.query("DELETE FROM users WHERE email LIKE $1", [`t${run}-%@example.test`]);
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

async function call(method, path, { body, token } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

const register = (n, extra = {}) =>
  call("POST", "/auth/register", { body: { email: email(n), password: PASSWORD, displayName: "Tester", ...extra } });

test("register creates a diner and never returns the password hash", async () => {
  const res = await register("a");
  assert.equal(res.status, 201);
  assert.equal(res.body.user.role, "diner");
  assert.equal(res.body.user.onboarded, false);
  assert.ok(res.body.token);
  assert.ok(!JSON.stringify(res.body).includes("password"));
});

test("register validates input and rejects duplicates (case-insensitively)", async () => {
  assert.equal((await call("POST", "/auth/register", { body: { email: "nope", password: PASSWORD } })).status, 400);
  assert.equal((await call("POST", "/auth/register", { body: { email: email("b"), password: "short" } })).status, 400);
  assert.equal(
    (await call("POST", "/auth/register", { body: { email: email("b"), password: "x".repeat(73) } })).status,
    400
  );
  assert.equal((await register("c")).status, 201);
  const dup = await call("POST", "/auth/register", {
    body: { email: email("c").toUpperCase(), password: PASSWORD },
  });
  assert.equal(dup.status, 409);
});

test("login accepts the right password and gives one error for every failure", async () => {
  await register("d");
  const ok = await call("POST", "/auth/login", { body: { email: email("d"), password: PASSWORD } });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);

  const wrongPw = await call("POST", "/auth/login", { body: { email: email("d"), password: "wrong-password" } });
  const unknown = await call("POST", "/auth/login", { body: { email: email("nobody"), password: PASSWORD } });
  assert.equal(wrongPw.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(wrongPw.body, unknown.body);
});

test("protected routes need a valid token", async () => {
  assert.equal((await call("GET", "/users/me")).status, 401);
  assert.equal((await call("GET", "/users/me", { token: "garbage" })).status, 401);
  const { body } = await register("e");
  const me = await call("GET", "/users/me", { token: body.token });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, email("e"));
});

test("preferences update partially, validate, and onboarded is one-way", async () => {
  const { body } = await register("f");
  const token = body.token;

  const saved = await call("PATCH", "/users/me/preferences", {
    token,
    body: { cuisinePreferences: ["Italian"], budgetPreference: 2, accessibilityNeeds: ["wheelchair"] },
  });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.user.cuisinePreferences, ["Italian"]);
  assert.equal(saved.body.user.budgetPreference, 2);
  assert.equal(saved.body.user.onboarded, false, "saving preferences alone does not mark onboarding done");

  const partial = await call("PATCH", "/users/me/preferences", { token, body: { diningStyle: "casual" } });
  assert.deepEqual(partial.body.user.cuisinePreferences, ["Italian"], "untouched fields are kept");

  assert.equal((await call("PATCH", "/users/me/preferences", { token, body: { budgetPreference: 9 } })).status, 400);
  assert.equal((await call("PATCH", "/users/me/preferences", { token, body: {} })).status, 400);
  assert.equal((await call("PATCH", "/users/me/preferences", { token, body: { onboarded: false } })).status, 400);

  const done = await call("PATCH", "/users/me/preferences", { token, body: { onboarded: true } });
  assert.equal(done.body.user.onboarded, true);
});

test("a server without a strong JWT_SECRET refuses to start", () => {
  const saved = process.env.JWT_SECRET;
  try {
    process.env.JWT_SECRET = "change_me";
    assert.throws(assertJwtSecret, /JWT_SECRET/);
    delete process.env.JWT_SECRET;
    assert.throws(assertJwtSecret, /JWT_SECRET/);
  } finally {
    process.env.JWT_SECRET = saved;
  }
});
