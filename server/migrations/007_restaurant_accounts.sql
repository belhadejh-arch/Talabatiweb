BEGIN;

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS account_serial_hash text,
  ADD COLUMN IF NOT EXISTS account_serial_encrypted text;

CREATE UNIQUE INDEX IF NOT EXISTS restaurants_account_serial_hash_unique
  ON restaurants (account_serial_hash)
  WHERE account_serial_hash IS NOT NULL;

ALTER TABLE api_sessions
  DROP CONSTRAINT IF EXISTS api_sessions_role_check;
ALTER TABLE api_sessions
  ADD CONSTRAINT api_sessions_role_check
  CHECK (role IN ('ADMIN', 'DRIVER', 'RESTAURANT'));

COMMIT;
