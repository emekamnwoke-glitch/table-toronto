-- Physical table inventory. Availability is flipped by booking writes,
-- inside a transaction that locks the row first (see backend booking
-- service) to prevent concurrent double-booking of the same table.
CREATE TABLE restaurant_tables (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id  UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    seats          SMALLINT NOT NULL,
    is_available   BOOLEAN NOT NULL DEFAULT true,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX restaurant_tables_restaurant_idx ON restaurant_tables (restaurant_id);
CREATE INDEX restaurant_tables_available_idx ON restaurant_tables (restaurant_id) WHERE is_available;
