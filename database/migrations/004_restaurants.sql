CREATE TABLE restaurants (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manager_user_id        UUID REFERENCES users(id),

    operating_name         TEXT NOT NULL,
    address                TEXT NOT NULL,
    location               geometry(Point, 4326) NOT NULL,
    neighbourhood_id       INTEGER REFERENCES neighbourhoods(id),

    cuisine                TEXT,
    price_level            SMALLINT CHECK (price_level BETWEEN 1 AND 4),
    accessible             BOOLEAN NOT NULL DEFAULT false,
    seating_capacity       SMALLINT,

    -- how long a confirmed booking's table is held before it's released
    -- back to inventory -- this is what ETA validation checks against
    hold_window_minutes    SMALLINT NOT NULL DEFAULT 15,

    -- sourced from Toronto Business Licences (ADR-0003); frozen at the
    -- source snapshot date, not necessarily current
    source_licence_issued  DATE,

    created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX restaurants_location_idx ON restaurants USING GIST (location);
CREATE INDEX restaurants_neighbourhood_idx ON restaurants (neighbourhood_id);
