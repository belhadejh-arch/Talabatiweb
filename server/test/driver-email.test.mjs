import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { pool } from "../db.mjs";
import { actionToken, buildAssignmentEmail, validActionToken } from "../email.mjs";
import {
  processDispatchForOrder, previewEmailAction, reconcileEmailDelivery,
  respondToEmailAction,
} from "../dispatch.mjs";

process.env.SESSION_SECRET ||= randomBytes(48).toString("hex");

test("mail includes saved delivery and reservation details; tokens bind all IDs", () => {
  const assignment = {
    order_id: 4, assignment_id: 8, driver_id: 11, driver_email: "driver@example.test",
    created_at: new Date(),
  };
  const order = {
    id: 4, order_type: "DELIVERY", customer_name: "<Customer>",
    customer_phone: "555", latitude: 32.8872, longitude: 13.1913,
    total_amount: "30.00", notes: "<script>bad</script>", created_at: new Date(),
  };
  const base = {
    order, restaurant: { name: "مطعم الاختبار" }, assignment,
    items: [{ product_name: "طعام", quantity: 2, unit_price: "15", subtotal: "30", addons: [] }],
    baseUrl: "https://example.test",
  };
  const delivery = buildAssignmentEmail(base);
  assert.match(delivery.text, /Latitude: 32\.8872/);
  assert.match(delivery.text, /Longitude: 13\.1913/);
  assert.match(delivery.text, /Google Maps: https:\/\/www\.google\.com\/maps\?q=32\.8872%2C13\.1913/);
  assert.match(delivery.text, /×2/);
  assert.match(delivery.text, /قبول الطلب:/);
  assert.match(delivery.html, /&lt;script&gt;bad&lt;\/script&gt;/);
  assert.doesNotMatch(delivery.html, /<script>/);
  const token = actionToken(assignment);
  assert.equal(validActionToken(assignment, token), true);
  assert.equal(validActionToken({ ...assignment, driver_id: 12 }, token), false);
  const reservation = buildAssignmentEmail({
    ...base,
    order: {
      ...order, order_type: "RESERVATION", latitude: null, longitude: null,
      reservation_date: "2026-10-10", reservation_time: "19:30", party_size: 4,
    },
  });
  assert.match(reservation.text, /2026-10-10/);
  assert.match(reservation.text, /19:30/);
  assert.doesNotMatch(reservation.text, /Google Maps:/);
  assert.throws(() => buildAssignmentEmail({
    ...base, order: { ...order, latitude: null },
  }), /coordinates/);
});

test("PostgreSQL dispatch: one driver, reject, accept, timeout, retry and no replay", async () => {
  const ids = { restaurants: [], categories: [], products: [], drivers: [], orders: [] };
  const mails = [];
  async function createRestaurant() {
    const slug = `email-test-${randomUUID()}`;
    const restaurant = (await pool.query(
      `INSERT INTO restaurants (name,slug,phone,address,status,delivery_fee)
       VALUES ('Email test', $1, '000', 'Test address', 'ACTIVE', 0) RETURNING id`,
      [slug],
    )).rows[0];
    ids.restaurants.push(restaurant.id);
    await pool.query(
      `INSERT INTO subscriptions
         (restaurant_id,plan,status,start_date,expiry_date)
       VALUES ($1,'TEST','ACTIVE',CURRENT_DATE-1,CURRENT_DATE+10)`,
      [restaurant.id],
    );
    const category = (await pool.query(
      `INSERT INTO categories (restaurant_id,name) VALUES ($1,'Test') RETURNING id`,
      [restaurant.id],
    )).rows[0];
    ids.categories.push(category.id);
    const product = (await pool.query(
      `INSERT INTO products (restaurant_id,category_id,name,price)
       VALUES ($1,$2,'Test food',12.50) RETURNING id`,
      [restaurant.id, category.id],
    )).rows[0];
    ids.products.push(product.id);
    return { restaurantId: restaurant.id, productId: product.id };
  }
  async function createDriver(restaurantId, active, email) {
    let driver;
    for (let i = 0; i < 10; i++) {
      try {
        driver = (await pool.query(
          `INSERT INTO drivers
             (restaurant_id,name,phone,email,is_active,status,serial_number)
           VALUES ($1,'Email test driver','000',$2,$3,$4,$5) RETURNING id`,
          [restaurantId, email, active, active ? "ACTIVE" : "INACTIVE",
            String(randomInt(100000, 1_000_000))],
        )).rows[0];
        break;
      } catch (error) {
        if (error.code !== "23505") throw error;
      }
    }
    if (!driver) throw new Error("Could not allocate a test serial");
    ids.drivers.push(driver.id);
    return driver.id;
  }
  async function createOrder(restaurantId, productId, type) {
    const reservation = type === "RESERVATION";
    const order = (await pool.query(
      `INSERT INTO orders
         (restaurant_id,customer_name,customer_phone,order_type,latitude,longitude,
          notes,subtotal,delivery_fee,total_amount,status,source,client_request_id,
          reservation_date,reservation_time,party_size)
       VALUES ($1,'Test customer','000',$2,$3,$4,'Test note',12.50,0,12.50,'NEW',
               'ANDROID_CUSTOMER',$5,$6,$7,$8) RETURNING id`,
      [restaurantId, type, reservation ? null : 32.8872, reservation ? null : 13.1913,
        randomUUID(), reservation ? "2026-10-10" : null,
        reservation ? "19:30" : null, reservation ? 4 : null],
    )).rows[0];
    ids.orders.push(order.id);
    await pool.query(
      `INSERT INTO order_items (order_id,product_id,product_name,quantity,unit_price,subtotal)
       VALUES ($1,$2,'Test food',1,12.50,12.50)`,
      [order.id, productId],
    );
    await pool.query(
      "INSERT INTO order_email_dispatch_jobs (order_id) VALUES ($1)",
      [order.id],
    );
    return order.id;
  }
  const fakeMail = async (payload) => {
    mails.push(payload);
    assert.match(buildAssignmentEmail({ ...payload, baseUrl: "https://example.test" }).text,
      /Test customer/);
  };
  async function attempts(orderId) {
    return (await pool.query(
      `SELECT a.*, e.id AS delivery_id, e.status AS email_status,
              e.retry_count,e.smtp_started_at FROM order_driver_attempts a
       JOIN order_email_deliveries e ON e.assignment_id=a.assignment_id
       WHERE a.order_id=$1 ORDER BY a.id`,
      [orderId],
    )).rows;
  }
  try {
    const rest = await createRestaurant();
    const otherRest = await createRestaurant();
    await createDriver(rest.restaurantId, false, "inactive@example.test");
    await createDriver(otherRest.restaurantId, true, "wrong@example.test");
    const first = await createDriver(rest.restaurantId, true, "first@example.test");
    const second = await createDriver(rest.restaurantId, true, "second@example.test");
    const orderId = await createOrder(rest.restaurantId, rest.productId, "DELIVERY");
    await processDispatchForOrder(orderId, fakeMail);
    let rows = await attempts(orderId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].driver_id, first);
    assert.equal(rows[0].email_status, "SENT");
    assert.deepEqual(mails.map((mail) => mail.assignment.driver_email), ["first@example.test"]);
    const input = {
      orderId, assignmentId: rows[0].assignment_id, driverId: first,
      token: actionToken(rows[0]), decision: "REJECTED",
    };
    assert.equal((await previewEmailAction(input)).ok, true);
    assert.equal((await respondToEmailAction(input, () => {})).ok, true);
    assert.equal((await previewEmailAction(input)).ok, false);
    await processDispatchForOrder(orderId, fakeMail);
    rows = await attempts(orderId);
    assert.equal(rows[0].status, "REJECTED");
    assert.equal(rows[1].driver_id, second);
    assert.deepEqual(mails.map((mail) => mail.assignment.driver_email),
      ["first@example.test", "second@example.test"]);
    const accept = {
      orderId, assignmentId: rows[1].assignment_id, driverId: second,
      token: actionToken(rows[1]), decision: "ACCEPTED",
    };
    assert.equal((await respondToEmailAction(accept, () => {})).ok, true);
    assert.equal((await respondToEmailAction(accept, () => {})).ok, false);
    await processDispatchForOrder(orderId, fakeMail);
    assert.equal(mails.length, 2);
    const saved = (await pool.query(
      "SELECT status,driver_id FROM orders WHERE id=$1", [orderId],
    )).rows[0];
    assert.equal(saved.status, "ACCEPTED");
    assert.equal(saved.driver_id, second);

    const reservationId = await createOrder(rest.restaurantId, rest.productId, "RESERVATION");
    await processDispatchForOrder(reservationId, fakeMail);
    assert.match(buildAssignmentEmail({ ...mails.at(-1), baseUrl: "https://example.test" }).text,
      /19:30/);
    rows = await attempts(reservationId);
    await pool.query(
      `UPDATE order_driver_attempts SET timeout_at=now()-interval '1 second'
       WHERE assignment_id=$1`,
      [rows[0].assignment_id],
    );
    await pool.query(
      "UPDATE order_email_dispatch_jobs SET next_check_at=now() WHERE order_id=$1",
      [reservationId],
    );
    await processDispatchForOrder(reservationId, fakeMail);
    rows = await attempts(reservationId);
    assert.equal(rows[0].status, "TIMEOUT");
    assert.equal(rows[1].driver_id, second);
    assert.equal(mails.at(-1).assignment.driver_email, "second@example.test");

    const failedId = await createOrder(rest.restaurantId, rest.productId, "DELIVERY");
    await processDispatchForOrder(failedId, async () => {
      const error = new Error("Simulated SMTP authentication failure");
      error.code = "EAUTH";
      error.command = "AUTH";
      throw error;
    });
    rows = await attempts(failedId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].email_status, "FAILED");
    assert.equal(rows[0].retry_count, 1);
    await pool.query(
      `UPDATE order_email_deliveries SET next_retry_at=now()-interval '1 second'
       WHERE assignment_id=$1`,
      [rows[0].assignment_id],
    );
    await pool.query(
      "UPDATE order_email_dispatch_jobs SET next_check_at=now() WHERE order_id=$1",
      [failedId],
    );
    await processDispatchForOrder(failedId, fakeMail);
    const afterRetry = await attempts(failedId);
    assert.equal(afterRetry.length, 1);
    assert.equal(afterRetry[0].assignment_id, rows[0].assignment_id);
    assert.equal(afterRetry[0].email_status, "SENT");
    const concurrent = {
      orderId: failedId, assignmentId: afterRetry[0].assignment_id,
      driverId: first, token: actionToken(afterRetry[0]), decision: "ACCEPTED",
    };
    const responses = await Promise.all([
      respondToEmailAction(concurrent, () => {}),
      respondToEmailAction(concurrent, () => {}),
    ]);
    assert.deepEqual(responses.map((value) => value.ok).sort(), [false, true]);
    await processDispatchForOrder(failedId, fakeMail);
    assert.equal((await attempts(failedId)).length, 1);

    const ambiguousId = await createOrder(rest.restaurantId, rest.productId, "DELIVERY");
    await processDispatchForOrder(ambiguousId, async () => {
      const error = new Error("Simulated uncertain SMTP DATA result");
      error.code = "ETIMEDOUT";
      error.command = "DATA";
      throw error;
    });
    rows = await attempts(ambiguousId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].email_status, "SENDING");
    assert.ok(rows[0].smtp_started_at);
    await pool.query(
      `UPDATE order_email_deliveries SET last_attempt_at=now()-interval '3 minutes'
       WHERE id=$1`,
      [rows[0].delivery_id],
    );
    const reconciliation = await reconcileEmailDelivery(
      { id: rows[0].delivery_id, result: "NOT_SENT" }, () => {},
    );
    assert.equal(reconciliation.ok, true);
    await processDispatchForOrder(ambiguousId, fakeMail);
    const afterReconciliation = await attempts(ambiguousId);
    assert.equal(afterReconciliation.length, 1);
    assert.equal(afterReconciliation[0].email_status, "SENT");
    assert.equal(afterReconciliation[0].assignment_id, rows[0].assignment_id);

    const interruptedId = await createOrder(rest.restaurantId, rest.productId, "DELIVERY");
    await processDispatchForOrder(interruptedId, async () => {
      const error = new Error("Simulated failure before SMTP");
      error.smtpNotStarted = true;
      throw error;
    });
    rows = await attempts(interruptedId);
    await pool.query(
      `UPDATE order_email_deliveries SET status='SENDING',smtp_started_at=NULL,
              last_attempt_at=now()-interval '3 minutes',next_retry_at=NULL
       WHERE id=$1`,
      [rows[0].delivery_id],
    );
    await pool.query(
      "UPDATE order_email_dispatch_jobs SET next_check_at=now() WHERE order_id=$1",
      [interruptedId],
    );
    await processDispatchForOrder(interruptedId, fakeMail);
    const recovered = await attempts(interruptedId);
    assert.equal(recovered.length, 1);
    assert.equal(recovered[0].email_status, "SENT");

    const expiryId = await createOrder(rest.restaurantId, rest.productId, "DELIVERY");
    await processDispatchForOrder(expiryId, fakeMail);
    const expiryAttempt = (await attempts(expiryId))[0];
    assert.equal(expiryAttempt.status, "PENDING");
    await pool.query(
      "UPDATE subscriptions SET expiry_date=CURRENT_DATE-1 WHERE restaurant_id=$1",
      [rest.restaurantId],
    );
    await pool.query(
      "UPDATE order_email_dispatch_jobs SET next_check_at=now() WHERE order_id=$1",
      [expiryId],
    );
    await processDispatchForOrder(expiryId, fakeMail);
    assert.equal((await attempts(expiryId))[0].status, "CANCELLED");
    const expiredOrder = (await pool.query(
      "SELECT status,cancelled_at FROM orders WHERE id=$1", [expiryId],
    )).rows[0];
    assert.equal(expiredOrder.status, "CANCELLED");
    assert.ok(expiredOrder.cancelled_at);
    assert.equal((await previewEmailAction({
      orderId: expiryId, assignmentId: expiryAttempt.assignment_id,
      driverId: first, token: actionToken(expiryAttempt), decision: "ACCEPTED",
    })).ok, false);
  } finally {
    // Only remove records created by this test. Pre-existing user data is untouched.
    await pool.query("DELETE FROM order_email_deliveries WHERE order_id=ANY($1::integer[])", [ids.orders]);
    await pool.query("DELETE FROM order_driver_attempts WHERE order_id=ANY($1::integer[])", [ids.orders]);
    await pool.query("DELETE FROM order_email_dispatch_jobs WHERE order_id=ANY($1::integer[])", [ids.orders]);
    await pool.query("DELETE FROM order_status_history WHERE order_id=ANY($1::integer[])", [ids.orders]);
    await pool.query("DELETE FROM order_items WHERE order_id=ANY($1::integer[])", [ids.orders]);
    await pool.query("DELETE FROM orders WHERE id=ANY($1::integer[])", [ids.orders]);
    await pool.query("DELETE FROM drivers WHERE id=ANY($1::integer[])", [ids.drivers]);
    await pool.query("DELETE FROM products WHERE id=ANY($1::integer[])", [ids.products]);
    await pool.query("DELETE FROM categories WHERE id=ANY($1::integer[])", [ids.categories]);
    await pool.query("DELETE FROM subscriptions WHERE restaurant_id=ANY($1::integer[])", [ids.restaurants]);
    await pool.query("DELETE FROM restaurants WHERE id=ANY($1::integer[])", [ids.restaurants]);
  }
});