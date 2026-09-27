// Flash-deal matching service (see the system diagram,
// docs/architecture/table-toronto-system-diagram.svg). Not implemented
// yet -- holds the module boundary for the candidate-ranking heuristic
// from the original design: distance + budget/diet preference match +
// a small tie-breaking jitter, with the accessibility flag applied as a
// hard pre-filter, never a ranked-in preference.

module.exports = {};
