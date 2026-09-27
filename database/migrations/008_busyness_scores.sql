-- Persisted busyness predictions, refreshed asynchronously on a TTL
-- rather than computed per-request -- discovery reads should never
-- block on inference latency. is_stale is set once a score exceeds its
-- TTL so a background refresh can be triggered without deleting the
-- last-known-good value the app keeps serving in the meantime.
CREATE TYPE busyness_level AS ENUM ('no_wait', 'queue_required', 'severe_queue');

CREATE TABLE busyness_scores (
    id             BIGSERIAL PRIMARY KEY,
    restaurant_id  UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    level          busyness_level NOT NULL,
    raw_score      NUMERIC(5, 2),
    computed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_stale       BOOLEAN NOT NULL DEFAULT false
);

-- fetch the latest score for a restaurant fast
CREATE INDEX busyness_scores_latest_idx ON busyness_scores (restaurant_id, computed_at DESC);
