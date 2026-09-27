BEGIN;

-- Verification of the driver's existing address. No Gmail access/refresh token
-- is retained, and this does not authorize sending from a driver's mailbox.
CREATE TABLE IF NOT EXISTS driver_gmail_links (
  driver_id integer PRIMARY KEY REFERENCES drivers(id) ON DELETE CASCADE,
  email text NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS driver_gmail_states (
  state_hash text PRIMARY KEY,
  driver_id integer NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

COMMIT;