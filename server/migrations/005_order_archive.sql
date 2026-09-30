-- Migration 005: Order Archive Support
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_orders_is_archived ON orders(is_archived);
