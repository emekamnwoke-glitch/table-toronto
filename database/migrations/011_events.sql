-- Behaviour events for the diner journey (docs/architecture/event-contract.md,
-- ADR-0016 Decision 6). Append-only. user_id is a pseudonym (an HMAC of the
-- account id), not the account id, and no event ever stores the diner's
-- coordinates. restaurant_id has no foreign key on purpose: history should
-- survive a restaurant being removed.
CREATE TABLE events (
    event_id           UUID PRIMARY KEY,
    event_name         TEXT NOT NULL CHECK (event_name IN (
                           'recommendation_shown',
                           'restaurant_opened',
                           'reservation_intent',
                           'handoff_started',
                           'booking_outcome_received'
                       )),
    occurred_at        TIMESTAMPTZ NOT NULL,
    received_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    session_id         UUID NOT NULL,
    recommendation_id  UUID NOT NULL,
    user_id            TEXT NOT NULL,
    simulated          BOOLEAN NOT NULL,
    restaurant_id      UUID,
    payload            JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX events_recommendation_idx ON events (recommendation_id);
CREATE INDEX events_name_time_idx ON events (event_name, received_at);
CREATE INDEX events_user_idx ON events (user_id, received_at);
