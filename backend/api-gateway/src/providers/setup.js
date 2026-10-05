// Registers the providers this deployment uses. Idempotent, so requiring the
// app more than once (tests) is safe. Only the simulated provider exists
// today; a real one is added here, behind configuration, when it does.
const { createMockProvider } = require("./mockProvider");
const { listProviders, registerProvider } = require("./index");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function setupProviders() {
  if (listProviders().length > 0) return;
  // Routes check the restaurant exists in the database before calling the
  // provider, so the mock only needs to reject malformed ids.
  registerProvider(createMockProvider({ isKnownRestaurant: (id) => UUID_RE.test(id) }), { makeDefault: true });
}

module.exports = { setupProviders };
