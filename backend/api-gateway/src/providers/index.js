// Provider registry. Which provider handles a request is configuration, not
// code: callers ask for a provider by id (or take the default) and never
// import a concrete implementation.
const { assertReservationProvider } = require("./reservationProvider");

const providers = new Map();
let defaultId = null;

function registerProvider(provider, { makeDefault = false } = {}) {
  assertReservationProvider(provider);
  if (providers.has(provider.id)) throw new Error(`Provider "${provider.id}" is already registered`);
  providers.set(provider.id, provider);
  if (makeDefault || defaultId === null) defaultId = provider.id;
  return provider;
}

function getProvider(id = defaultId) {
  const provider = id && providers.get(id);
  if (!provider) throw new Error(`No reservation provider registered${id ? ` with id "${id}"` : ""}`);
  return provider;
}

const listProviders = () => [...providers.values()];

// Test helper: start from a clean registry.
function resetProviders() {
  providers.clear();
  defaultId = null;
}

module.exports = { registerProvider, getProvider, listProviders, resetProviders };
