BEGIN;

-- Keep the transaction-level order lock in the API, and enforce the same
-- invariant in PostgreSQL in case another code path attempts a second accept.
CREATE UNIQUE INDEX IF NOT EXISTS order_driver_attempts_one_accepted
  ON order_driver_attempts (order_id)
  WHERE status = 'ACCEPTED';

COMMIT;
