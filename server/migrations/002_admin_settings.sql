BEGIN;

-- Development application:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/migrations/002_admin_settings.sql
-- This is additive and idempotent. Do not apply it to production without review.
CREATE TABLE IF NOT EXISTS admin_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  dispatch_timeout_minutes integer NOT NULL DEFAULT 5
    CHECK (dispatch_timeout_minutes BETWEEN 1 AND 60),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO admin_settings (id, dispatch_timeout_minutes)
VALUES (1, 5)
ON CONFLICT (id) DO NOTHING;

COMMIT;