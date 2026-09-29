-- Lets the restaurant seed be re-run safely (ON CONFLICT DO NOTHING) rather
-- than needing a destructive TRUNCATE each time, matching the pattern
-- already used for neighbourhoods (002_neighbourhoods.sql).
ALTER TABLE restaurants
    ADD CONSTRAINT restaurants_name_address_unique UNIQUE (operating_name, address);
