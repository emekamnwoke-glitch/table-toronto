-- A campaign is a restaurant manager's private, quota-limited flash deal.
-- It ends when quota fills, its TTL elapses, or the manager cancels it.
CREATE TYPE campaign_status AS ENUM ('active', 'filled', 'expired', 'cancelled');

CREATE TABLE campaigns (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id  UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    quota          SMALLINT NOT NULL CHECK (quota > 0),
    claimed_count  SMALLINT NOT NULL DEFAULT 0,
    status         campaign_status NOT NULL DEFAULT 'active',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at     TIMESTAMPTZ NOT NULL
);

CREATE INDEX campaigns_restaurant_idx ON campaigns (restaurant_id);
CREATE INDEX campaigns_status_idx ON campaigns (status);

-- One offer per (campaign, user): the matching service (see
-- backend/api-gateway/src/services) ranks pre-filtered candidates by the
-- distance/budget/diet heuristic and writes one row per selected diner.
-- match_score is kept for audit -- it's what the ranking actually
-- produced, not recomputed later.
CREATE TYPE offer_status AS ENUM ('pending', 'claimed', 'expired', 'declined');

CREATE TABLE offers (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id  UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES users(id),
    status       offer_status NOT NULL DEFAULT 'pending',
    match_score  NUMERIC(6, 4),
    sent_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL,
    UNIQUE (campaign_id, user_id)
);

CREATE INDEX offers_user_idx ON offers (user_id);
CREATE INDEX offers_campaign_idx ON offers (campaign_id);
