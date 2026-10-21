BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS restaurant_decision_status text NOT NULL DEFAULT 'PENDING'
    CHECK (restaurant_decision_status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'DEFERRED')),
  ADD COLUMN IF NOT EXISTS restaurant_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS restaurant_deferred_until timestamptz,
  ADD COLUMN IF NOT EXISTS restaurant_decision_note text;

-- Existing finished orders should not reopen as new work in the restaurant portal.
UPDATE orders
   SET restaurant_decision_status='ACCEPTED',
       restaurant_decided_at=COALESCE(restaurant_decided_at, updated_at, created_at)
 WHERE status IN ('CONFIRMED','ACCEPTED','PREPARING','READY','ON_THE_WAY',
                  'COMPLETED','DELIVERED');

UPDATE orders
   SET restaurant_decision_status='REJECTED',
       restaurant_decided_at=COALESCE(restaurant_decided_at, cancelled_at, updated_at, created_at)
 WHERE status='CANCELLED';

COMMIT;
