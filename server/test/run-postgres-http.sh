#!/usr/bin/env bash
# Runs the HTTP integration test against a disposable local cluster only.
set -euo pipefail
cd "$(dirname "$0")/../.."

for executable in initdb pg_ctl createdb psql node; do
  command -v "$executable" >/dev/null || { echo "Missing $executable" >&2; exit 1; }
done

workdir="$(mktemp -d /tmp/talabat-pg-test.XXXXXX)"
stop_cluster() {
  if [[ -f "$workdir/data/postmaster.pid" ]]; then
    pg_ctl -D "$workdir/data" -m immediate stop >/dev/null 2>&1 || true
  fi
  rm -rf -- "$workdir"
}
trap stop_cluster EXIT

initdb -D "$workdir/data" -A trust -U "$(id -un)" --no-instructions >"$workdir/init.log"
pg_ctl -D "$workdir/data" -l "$workdir/postgres.log" \
  -o "-k $workdir -c listen_addresses=''" start >/dev/null
createdb -h "$workdir" -U "$(id -un)" talabat_test
database_url="postgresql://$(id -un)@localhost/talabat_test?host=$(node -p 'encodeURIComponent(process.argv[1])' "$workdir")"
psql -X -h "$workdir" -U "$(id -un)" -d talabat_test -v ON_ERROR_STOP=1 \
  -f server/test/base-schema.sql >/dev/null

# A pre-migration order with its original item and timeline must survive all
# administration operations, and must never acquire a dispatch job.
psql -X -h "$workdir" -U "$(id -un)" -d talabat_test -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
INSERT INTO restaurants (id,name,slug,status) VALUES (900001,'Historical fixture','historical-fixture','INACTIVE');
INSERT INTO categories (id,restaurant_id,name) VALUES (900001,900001,'Historical category');
INSERT INTO products (id,restaurant_id,category_id,name,price)
VALUES (900001,900001,900001,'Historical dish',14.000);
INSERT INTO orders (id,restaurant_id,customer_name,customer_phone,status,source,total_amount)
VALUES (900001,900001,'Historical customer','000-legacy','COMPLETED','LEGACY',14.000);
INSERT INTO order_items (order_id,product_id,product_name,quantity,unit_price,subtotal)
VALUES (900001,900001,'Historical dish',1,14.000,14.000);
INSERT INTO order_status_history (order_id,status,note)
VALUES (900001,'COMPLETED','Pre-migration timeline');
SQL

# Explicitly target the temporary socket; never pass the workspace DATABASE_URL.
env -u EXTERNAL_DATABASE_URL DATABASE_URL="$database_url" node server/migrate.mjs
env -u EXTERNAL_DATABASE_URL TEST_DATABASE_URL="$database_url" DATABASE_URL="$database_url" DISPATCH_WORKER_ENABLED=true \
  node --test --test-concurrency=1 server/*.test.mjs server/test/*.test.mjs