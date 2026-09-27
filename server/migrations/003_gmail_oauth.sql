BEGIN;

-- Additive and idempotent. Review against the intended database before
-- applying in production; existing orders and deliveries are not changed.
CREATE TABLE IF NOT EXISTS gmail_oauth_accounts (
  id integer PRIMARY KEY CHECK (id = 1),
  email text NOT NULL,
  refresh_token_ciphertext text NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gmail_oauth_states (
  state_hash text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);

COMMIT;