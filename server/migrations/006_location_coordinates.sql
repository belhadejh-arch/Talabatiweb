-- Migration 006: Location coordinates for restaurants and drivers
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS longitude double precision;

ALTER TABLE drivers ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS location_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_restaurants_coords ON restaurants(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_drivers_coords ON drivers(latitude, longitude);
