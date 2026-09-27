-- A booking is only confirmed once the API gateway's ETA check (via
-- Valhalla, ADR-0012) shows the diner can arrive within the restaurant's
-- hold_window_minutes. hold_expires_at is when an unconfirmed/unarrived
-- booking releases the table back to inventory.
CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'cancelled', 'expired', 'completed');

CREATE TABLE bookings (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id),
    restaurant_id    UUID NOT NULL REFERENCES restaurants(id),
    table_id         UUID REFERENCES restaurant_tables(id),

    party_size       SMALLINT NOT NULL CHECK (party_size > 0),
    eta_minutes      NUMERIC(6, 2),
    status           booking_status NOT NULL DEFAULT 'pending',
    hold_expires_at  TIMESTAMPTZ,

    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX bookings_user_idx ON bookings (user_id);
CREATE INDEX bookings_restaurant_idx ON bookings (restaurant_id);
CREATE INDEX bookings_status_idx ON bookings (status);
