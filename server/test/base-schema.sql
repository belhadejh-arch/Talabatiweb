-- Minimal pre-001 application schema for an isolated PostgreSQL integration database.
-- Never run this against an existing application database. Apply migrations/001 and
-- migrations/002 after this file.
CREATE TABLE restaurants (
  id serial PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  phone text,
  address text,
  description text,
  status text NOT NULL DEFAULT 'ACTIVE',
  logo_url text,
  cover_url text,
  delivery_fee numeric(12,3) NOT NULL DEFAULT 0,
  latitude double precision,
  longitude double precision
);

CREATE TABLE categories (
  id serial PRIMARY KEY,
  restaurant_id integer NOT NULL REFERENCES restaurants(id),
  name text NOT NULL,
  name_ar text,
  is_available boolean NOT NULL DEFAULT true
);

CREATE TABLE products (
  id serial PRIMARY KEY,
  restaurant_id integer NOT NULL REFERENCES restaurants(id),
  category_id integer REFERENCES categories(id),
  name text NOT NULL,
  name_ar text,
  description text,
  description_ar text,
  image_url text,
  price numeric(12,3) NOT NULL,
  is_available boolean NOT NULL DEFAULT true,
  stock_quantity integer,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE product_sizes (
  id serial PRIMARY KEY,
  product_id integer NOT NULL REFERENCES products(id),
  name text NOT NULL,
  name_ar text,
  price numeric(12,3) NOT NULL,
  is_available boolean NOT NULL DEFAULT true
);

CREATE TABLE subscriptions (
  id serial PRIMARY KEY,
  restaurant_id integer NOT NULL REFERENCES restaurants(id),
  plan text NOT NULL,
  status text NOT NULL,
  start_date date NOT NULL,
  expiry_date date NOT NULL
);

CREATE TABLE drivers (
  id serial PRIMARY KEY,
  restaurant_id integer NOT NULL REFERENCES restaurants(id),
  name text NOT NULL,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'ACTIVE',
  serial_number text NOT NULL UNIQUE,
  total_deliveries integer NOT NULL DEFAULT 0,
  latitude double precision,
  longitude double precision,
  location_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admins (
  id serial PRIMARY KEY,
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL
);

CREATE TABLE orders (
  id serial PRIMARY KEY,
  restaurant_id integer NOT NULL REFERENCES restaurants(id),
  driver_id integer REFERENCES drivers(id),
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  notes text,
  latitude double precision,
  longitude double precision,
  maps_url text,
  subtotal numeric(12,3) NOT NULL DEFAULT 0,
  delivery_fee numeric(12,3) NOT NULL DEFAULT 0,
  total_amount numeric(12,3) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'NEW',
  order_type text NOT NULL DEFAULT 'DELIVERY',
  source text NOT NULL DEFAULT 'LEGACY',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  id serial PRIMARY KEY,
  order_id integer NOT NULL REFERENCES orders(id),
  product_id integer REFERENCES products(id),
  product_name text NOT NULL,
  quantity integer NOT NULL,
  unit_price numeric(12,3) NOT NULL,
  subtotal numeric(12,3) NOT NULL,
  size_id integer,
  size_name text
);

CREATE TABLE order_item_addons (
  id serial PRIMARY KEY,
  order_item_id integer NOT NULL REFERENCES order_items(id),
  addon_name text NOT NULL,
  price numeric(12,3) NOT NULL DEFAULT 0
);

CREATE TABLE order_status_history (
  id serial PRIMARY KEY,
  order_id integer NOT NULL REFERENCES orders(id),
  status text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE order_driver_attempts (
  id serial PRIMARY KEY,
  assignment_id serial UNIQUE NOT NULL,
  order_id integer NOT NULL REFERENCES orders(id),
  driver_id integer NOT NULL REFERENCES drivers(id),
  restaurant_id integer NOT NULL REFERENCES restaurants(id),
  status text NOT NULL,
  sent_at timestamptz,
  timeout_at timestamptz,
  expires_at timestamptz,
  responded_at timestamptz,
  response_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);