import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * The API can be deployed separately from the workspace database migration.
 * Keep this additive and idempotent so an older production database can
 * receive the driver-account columns before Drizzle queries them.
 */
export async function ensureRuntimeSchema(): Promise<void> {
  await pool.query(`
    ALTER TABLE drivers
      ADD COLUMN IF NOT EXISTS serial_number text,
      ADD COLUMN IF NOT EXISTS status text DEFAULT 'INACTIVE',
      ADD COLUMN IF NOT EXISTS birth_date date,
      ADD COLUMN IF NOT EXISTS profile_image_url text,
      ADD COLUMN IF NOT EXISTS vehicle_type text,
      ADD COLUMN IF NOT EXISTS vehicle_plate text,
      ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS total_deliveries integer DEFAULT 0,
      ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT NOW()
  `);

  // Fill only missing/invalid values. Existing valid serial numbers remain
  // unchanged so current drivers keep the number already shared with them.
  await pool.query(`
    DO $$
    DECLARE
      driver_row RECORD;
      candidate TEXT;
      offset_value INTEGER;
    BEGIN
      FOR driver_row IN
        SELECT id
        FROM drivers
        WHERE serial_number IS NULL
           OR serial_number !~ '^[0-9]{6}$'
           OR EXISTS (
             SELECT 1
             FROM drivers duplicate
             WHERE duplicate.serial_number = drivers.serial_number
               AND duplicate.id < drivers.id
           )
        ORDER BY id
      LOOP
        offset_value := 0;
        LOOP
          candidate := LPAD(((driver_row.id + offset_value) % 1000000)::TEXT, 6, '0');
          EXIT WHEN NOT EXISTS (
            SELECT 1
            FROM drivers occupied
            WHERE occupied.serial_number = candidate
              AND occupied.id <> driver_row.id
          );
          offset_value := offset_value + 1;
          IF offset_value >= 1000000 THEN
            RAISE EXCEPTION 'Unable to generate a unique driver serial number during schema upgrade';
          END IF;
        END LOOP;

        UPDATE drivers
        SET serial_number = candidate
        WHERE id = driver_row.id;
      END LOOP;
    END $$;
  `);

  await pool.query(`
    UPDATE drivers
    SET status = COALESCE(status, 'INACTIVE'),
        is_active = COALESCE(is_active, false),
        total_deliveries = COALESCE(total_deliveries, 0),
        created_at = COALESCE(created_at, NOW())
  `);

  await pool.query(`
    ALTER TABLE drivers
      ALTER COLUMN serial_number SET NOT NULL,
      ALTER COLUMN status SET DEFAULT 'INACTIVE',
      ALTER COLUMN status SET NOT NULL,
      ALTER COLUMN is_active SET DEFAULT false,
      ALTER COLUMN is_active SET NOT NULL,
      ALTER COLUMN total_deliveries SET DEFAULT 0,
      ALTER COLUMN total_deliveries SET NOT NULL,
      ALTER COLUMN created_at SET DEFAULT NOW(),
      ALTER COLUMN created_at SET NOT NULL
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS drivers_serial_number_unique
    ON drivers (serial_number)
  `);

  logger.info("Runtime database schema verified for driver accounts");
}