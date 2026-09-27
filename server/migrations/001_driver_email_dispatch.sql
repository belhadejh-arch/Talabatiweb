BEGIN;

-- Additive changes only: historical orders, attempts and notification records remain intact.
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS reservation_date date;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reservation_time time without time zone;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS party_size integer;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_payout_amount numeric(12, 2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_request_id uuid;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_request_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS orders_source_request_unique
  ON orders (source, client_request_id) WHERE client_request_id IS NOT NULL;

ALTER TABLE order_driver_attempts ADD COLUMN IF NOT EXISTS driver_email text;
ALTER TABLE order_driver_attempts ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
ALTER TABLE order_driver_attempts ADD COLUMN IF NOT EXISTS rejected_at timestamptz;
ALTER TABLE order_driver_attempts ADD COLUMN IF NOT EXISTS timed_out_at timestamptz;
ALTER TABLE order_driver_attempts ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- The older rows have no job: restarting this service never dispatches historical orders.
CREATE TABLE IF NOT EXISTS order_email_dispatch_jobs (
  order_id integer PRIMARY KEY REFERENCES orders(id),
  state text NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE', 'DONE')),
  next_check_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_email_deliveries (
  id bigserial PRIMARY KEY,
  order_id integer NOT NULL REFERENCES orders(id),
  driver_id integer NOT NULL REFERENCES drivers(id),
  assignment_id integer NOT NULL UNIQUE REFERENCES order_driver_attempts(assignment_id),
  driver_email text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'FAILED')),
  sent_at timestamptz,
  last_attempt_at timestamptz,
  next_retry_at timestamptz,
  error text,
  retry_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE order_email_deliveries ADD COLUMN IF NOT EXISTS smtp_started_at timestamptz;
CREATE INDEX IF NOT EXISTS order_email_deliveries_retry_idx
  ON order_email_deliveries (next_retry_at, created_at)
  WHERE status IN ('PENDING', 'FAILED');
CREATE UNIQUE INDEX IF NOT EXISTS order_driver_attempts_one_pending
  ON order_driver_attempts (order_id) WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS api_sessions (
  token_hash text PRIMARY KEY,
  role text NOT NULL CHECK (role IN ('ADMIN', 'DRIVER')),
  owner_id integer NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_sessions_expires_idx ON api_sessions (expires_at);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  key_hash text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 0,
  reset_at timestamptz NOT NULL
);

COMMIT;