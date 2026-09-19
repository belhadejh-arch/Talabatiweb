import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * The API can be deployed separately from the workspace database migration.
 * Keep this additive and idempotent so an older production database can
 * receive the driver-account columns before Drizzle queries them.
 */
export async function ensureRuntimeSchema(): Promise<void> {
  // Imported environments may contain only the tables created by an older
  // runtime-schema version. Create the foundational tables before the
  // additive driver/order checks below; otherwise a missing `drivers` table
  // aborts startup before the API can serve public orders.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS restaurants (
      id serial PRIMARY KEY,
      name text NOT NULL,
      slug text NOT NULL UNIQUE,
      phone text NOT NULL,
      address text NOT NULL,
      logo_url text,
      cover_url text,
      description text,
      primary_color text,
      delivery_fee numeric(10, 2) NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'ACTIVE',
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS admins (
      id serial PRIMARY KEY,
      username text NOT NULL UNIQUE,
      email text,
      password_hash text NOT NULL,
      role text NOT NULL DEFAULT 'super_admin',
      created_at timestamptz NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id serial PRIMARY KEY,
      restaurant_id integer NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      plan text NOT NULL,
      status text NOT NULL DEFAULT 'TRIAL',
      start_date date NOT NULL,
      expiry_date date NOT NULL,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS categories (
      id serial PRIMARY KEY,
      restaurant_id integer NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      name text NOT NULL,
      name_ar text,
      image_url text,
      sort_order integer NOT NULL DEFAULT 0,
      is_available boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS products (
      id serial PRIMARY KEY,
      restaurant_id integer NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      category_id integer NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      name text NOT NULL,
      name_ar text,
      description text,
      description_ar text,
      image_url text,
      price numeric(10, 2) NOT NULL,
      is_available boolean NOT NULL DEFAULT true,
      stock_quantity integer,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS product_sizes (
      id serial PRIMARY KEY,
      product_id integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      name text NOT NULL,
      name_ar text,
      price numeric(10, 2) NOT NULL,
      sort_order integer NOT NULL DEFAULT 0,
      is_available boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS addons (
      id serial PRIMARY KEY,
      product_id integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      name text NOT NULL,
      name_ar text,
      price numeric(10, 2) NOT NULL DEFAULT 0,
      is_available boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS settings (
      id serial PRIMARY KEY,
      platform_name text NOT NULL DEFAULT 'TALABAT',
      default_currency text NOT NULL DEFAULT 'LYD',
      maps_api_key text,
      driver_response_timeout_seconds integer NOT NULL DEFAULT 300,
      updated_at timestamptz NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS drivers (
      id serial PRIMARY KEY,
      restaurant_id integer NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      serial_number text NOT NULL,
      name text NOT NULL,
      phone text NOT NULL,
      whatsapp_number text,
      status text NOT NULL DEFAULT 'INACTIVE',
      address text,
      birth_date date,
      profile_image_url text,
      vehicle_type text,
      vehicle_plate text,
      is_active boolean NOT NULL DEFAULT false,
      total_deliveries integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS drivers_serial_number_unique
      ON drivers (serial_number);
  `);

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
       source text NOT NULL DEFAULT 'UNKNOWN',
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
       assignment_id serial PRIMARY KEY,
      order_id integer NOT NULL,
      driver_id integer NOT NULL,
      restaurant_id integer NOT NULL,
      status text NOT NULL DEFAULT 'PENDING',
       created_at timestamptz NOT NULL DEFAULT NOW(),
       expires_at timestamptz NOT NULL,
       sent_at timestamptz,
      response_at timestamptz,
       onesignal_status text NOT NULL DEFAULT 'PENDING',
       onesignal_response text,
       onesignal_error text
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS driver_push_subscriptions (
      id serial PRIMARY KEY,
      driver_id integer NOT NULL,
      endpoint text NOT NULL,
      subscription text NOT NULL,
      device text,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS driver_push_subscriptions_endpoint_unique
      ON driver_push_subscriptions (endpoint)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS driver_onesignal_subscriptions (
      id serial PRIMARY KEY,
      driver_id integer NOT NULL,
      app_id text NOT NULL,
      subscription_id text NOT NULL,
      external_id text NOT NULL,
      opted_in boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS driver_onesignal_subscriptions_subscription_unique
      ON driver_onesignal_subscriptions (subscription_id)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS talabat_sessions (
      sid varchar NOT NULL PRIMARY KEY,
      sess json NOT NULL,
      expire timestamp(6) NOT NULL
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS talabat_sessions_expire_idx
      ON talabat_sessions (expire)
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
       ADD COLUMN IF NOT EXISTS source text DEFAULT 'UNKNOWN',
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
       ADD COLUMN IF NOT EXISTS assignment_id integer,
      ADD COLUMN IF NOT EXISTS restaurant_id integer,
       ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT NOW(),
       ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS response_at timestamptz,
       ADD COLUMN IF NOT EXISTS sent_at timestamptz,
       ADD COLUMN IF NOT EXISTS onesignal_status text DEFAULT 'PENDING',
       ADD COLUMN IF NOT EXISTS onesignal_response text,
       ADD COLUMN IF NOT EXISTS onesignal_error text
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'order_driver_attempts' AND column_name = 'id'
      ) THEN
        EXECUTE 'UPDATE order_driver_attempts SET assignment_id = id WHERE assignment_id IS NULL';
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'order_driver_attempts' AND column_name = 'timeout_at'
      ) THEN
        EXECUTE 'UPDATE order_driver_attempts SET expires_at = timeout_at WHERE timeout_at IS NOT NULL';
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'order_driver_attempts' AND column_name = 'notification_status'
      ) THEN
        EXECUTE 'UPDATE order_driver_attempts SET onesignal_status = notification_status WHERE notification_status IS NOT NULL';
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'order_driver_attempts' AND column_name = 'notification_response'
      ) THEN
        EXECUTE 'UPDATE order_driver_attempts SET onesignal_response = notification_response WHERE notification_response IS NOT NULL';
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'order_driver_attempts' AND column_name = 'notification_error'
      ) THEN
        EXECUTE 'UPDATE order_driver_attempts SET onesignal_error = notification_error WHERE notification_error IS NOT NULL';
      END IF;
    END $$;
  `);

  await pool.query(`
    UPDATE order_driver_attempts a
       SET restaurant_id = o.restaurant_id
      FROM orders o
     WHERE a.order_id = o.id
       AND a.restaurant_id IS NULL
  `);

  await pool.query(`
    ALTER TABLE order_driver_attempts
      ALTER COLUMN assignment_id SET NOT NULL,
      ALTER COLUMN restaurant_id SET NOT NULL,
      ALTER COLUMN created_at SET NOT NULL,
      ALTER COLUMN expires_at SET NOT NULL
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS order_driver_attempts_assignment_id_unique
      ON order_driver_attempts (assignment_id)
  `);

  await pool.query(`
    CREATE SEQUENCE IF NOT EXISTS order_driver_attempts_assignment_id_seq
  `);

  await pool.query(`
    SELECT setval(
      'order_driver_attempts_assignment_id_seq',
      GREATEST(COALESCE((SELECT MAX(assignment_id) FROM order_driver_attempts), 0) + 1, 1),
      false
    )
  `);

  await pool.query(`
    ALTER TABLE order_driver_attempts
      ALTER COLUMN assignment_id SET DEFAULT nextval('order_driver_attempts_assignment_id_seq')
  `);

  await pool.query(`
    UPDATE order_driver_attempts
       SET created_at = COALESCE(created_at, sent_at, NOW()),
           expires_at = COALESCE(expires_at, NOW()),
           onesignal_status = COALESCE(onesignal_status, 'PENDING')
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
       source = COALESCE(source, 'UNKNOWN'),
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
    SET expires_at = COALESCE(expires_at, NOW()),
        onesignal_status = COALESCE(onesignal_status, 'PENDING')
  `);

  // Reservation orders intentionally have no delivery coordinates. Older
  // deployments created these columns as required delivery-only fields.
  await pool.query(`
    ALTER TABLE orders
      ALTER COLUMN driver_id DROP NOT NULL,
      ALTER COLUMN latitude DROP NOT NULL,
      ALTER COLUMN longitude DROP NOT NULL,
      ALTER COLUMN maps_url DROP NOT NULL
  `);

  await pool.query(`
    ALTER TABLE orders
      ALTER COLUMN source SET DEFAULT 'UNKNOWN',
      ALTER COLUMN source SET NOT NULL
  `);

  await pool.query(`
    ALTER TABLE order_driver_attempts
      ALTER COLUMN onesignal_status SET DEFAULT 'PENDING',
      ALTER COLUMN onesignal_status SET NOT NULL
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