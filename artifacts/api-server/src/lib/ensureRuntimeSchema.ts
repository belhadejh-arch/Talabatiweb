import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * The API can be deployed separately from the workspace database migration.
 * Keep this additive and idempotent so an older production database can
 * receive the driver-account columns before Drizzle queries them.
 */
export async function ensureRuntimeSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id serial PRIMARY KEY,
      restaurant_id integer NOT NULL,
      driver_id integer,
      order_type text NOT NULL DEFAULT 'DELIVERY',
      customer_name text NOT NULL,
      customer_phone text NOT NULL,
      notes text,
      latitude double precision,
      longitude double precision,
      maps_url text,
      subtotal numeric(10, 2) NOT NULL DEFAULT 0,
      delivery_fee numeric(10, 2) NOT NULL DEFAULT 0,
      total_amount numeric(10, 2) NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'NEW',
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id serial PRIMARY KEY,
      order_id integer NOT NULL,
      product_id integer NOT NULL,
      product_name text NOT NULL,
      size_id integer,
      size_name text,
      quantity integer NOT NULL,
      unit_price numeric(10, 2) NOT NULL,
      subtotal numeric(10, 2) NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_item_addons (
      id serial PRIMARY KEY,
      order_item_id integer NOT NULL,
      addon_id integer NOT NULL,
      addon_name text NOT NULL,
      price numeric(10, 2) NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_status_history (
      id serial PRIMARY KEY,
      order_id integer NOT NULL,
      status text NOT NULL,
      note text,
      changed_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id serial PRIMARY KEY,
      type text NOT NULL,
      message text NOT NULL,
      driver_id integer,
      restaurant_id integer,
      order_id integer,
      related_id integer,
      related_type text,
      is_read boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_driver_attempts (
      id serial PRIMARY KEY,
      order_id integer NOT NULL,
      driver_id integer NOT NULL,
      status text NOT NULL DEFAULT 'PENDING',
      sent_at timestamptz NOT NULL DEFAULT NOW(),
      response_at timestamptz,
      timeout_at timestamptz NOT NULL
    )
  `);

  await pool.query(`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS driver_id integer,
      ADD COLUMN IF NOT EXISTS order_type text DEFAULT 'DELIVERY',
      ADD COLUMN IF NOT EXISTS notes text,
      ADD COLUMN IF NOT EXISTS latitude double precision,
      ADD COLUMN IF NOT EXISTS longitude double precision,
      ADD COLUMN IF NOT EXISTS maps_url text,
      ADD COLUMN IF NOT EXISTS subtotal numeric(10, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS delivery_fee numeric(10, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_amount numeric(10, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS status text DEFAULT 'NEW',
      ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT NOW()
  `);

  await pool.query(`
    ALTER TABLE order_items
      ADD COLUMN IF NOT EXISTS size_id integer,
      ADD COLUMN IF NOT EXISTS size_name text
  `);

  await pool.query(`
    ALTER TABLE order_status_history
      ADD COLUMN IF NOT EXISTS note text,
      ADD COLUMN IF NOT EXISTS changed_at timestamptz DEFAULT NOW()
  `);

  await pool.query(`
    ALTER TABLE notifications
      ADD COLUMN IF NOT EXISTS driver_id integer,
      ADD COLUMN IF NOT EXISTS restaurant_id integer,
      ADD COLUMN IF NOT EXISTS order_id integer,
      ADD COLUMN IF NOT EXISTS related_id integer,
      ADD COLUMN IF NOT EXISTS related_type text,
      ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT NOW()
  `);

  await pool.query(`
    ALTER TABLE order_driver_attempts
      ADD COLUMN IF NOT EXISTS response_at timestamptz,
      ADD COLUMN IF NOT EXISTS timeout_at timestamptz DEFAULT NOW()
  `);

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
    UPDATE orders
    SET order_type = COALESCE(order_type, 'DELIVERY'),
        subtotal = COALESCE(subtotal, 0),
        delivery_fee = COALESCE(delivery_fee, 0),
        total_amount = COALESCE(total_amount, 0),
        status = COALESCE(status, 'NEW'),
        created_at = COALESCE(created_at, NOW()),
        updated_at = COALESCE(updated_at, NOW())
  `);

  await pool.query(`
    UPDATE notifications
    SET is_read = COALESCE(is_read, false),
        created_at = COALESCE(created_at, NOW())
  `);

  await pool.query(`
    UPDATE order_status_history
    SET changed_at = COALESCE(changed_at, NOW())
  `);

  await pool.query(`
    UPDATE order_driver_attempts
    SET timeout_at = COALESCE(timeout_at, NOW())
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