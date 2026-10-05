-- Set once a diner has finished (or explicitly skipped) preference
-- onboarding. "All preferences empty" can't stand in for this: someone can
-- legitimately save nothing selected.
ALTER TABLE users ADD COLUMN onboarded_at TIMESTAMPTZ;
