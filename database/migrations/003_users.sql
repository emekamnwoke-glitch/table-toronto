-- Diners and restaurant managers share one users table, distinguished by
-- role; a manager's restaurant relationship is set on restaurants.manager_user_id
-- (see 004_restaurants.sql).
CREATE TYPE user_role AS ENUM ('diner', 'manager');

CREATE TABLE users (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role                  user_role NOT NULL DEFAULT 'diner',
    email                 TEXT NOT NULL UNIQUE,
    password_hash         TEXT NOT NULL,
    display_name          TEXT,

    -- onboarding preferences (cuisine, budget, dining style) -- soft
    -- preferences used for offer-matching ranking, not hard constraints
    cuisine_preferences   TEXT[] NOT NULL DEFAULT '{}',
    budget_preference     SMALLINT CHECK (budget_preference BETWEEN 1 AND 4),
    dining_style          TEXT,

    -- accessibility is a hard constraint in offer matching, not a
    -- soft preference -- see the original project's design rationale,
    -- carried into this rebuild
    accessibility_needs   TEXT[] NOT NULL DEFAULT '{}',

    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
