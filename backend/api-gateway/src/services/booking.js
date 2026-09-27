// Booking + ETA validation service (see the system diagram,
// docs/architecture/table-toronto-system-diagram.svg). Not implemented
// yet -- this file exists to hold the module boundary the diagram
// already commits to, so route handlers have somewhere real to call
// into once Valhalla (ADR-0012) is wired up.
//
// Planned shape: validateEta(restaurantId, userLocation, transitMode)
// calls Valhalla, compares the result against the restaurant's
// hold_window_minutes, and confirmBooking(...) locks the chosen
// restaurant_tables row inside a transaction before writing the booking,
// per 005_restaurant_tables.sql's concurrency note.

module.exports = {};
