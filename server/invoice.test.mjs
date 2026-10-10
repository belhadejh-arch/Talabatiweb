import test from "node:test";
import assert from "node:assert/strict";
import { buildOrderInvoice, invoiceNumberForOrder } from "./invoice.mjs";

test("all order views share one stable invoice projection derived from the order", () => {
  const order = {
    id: 184,
    restaurant_id: 12,
    restaurant_name: "مطعم الاختبار",
    customer_name: "الاسم الكامل",
    customer_phone: "0912345678",
    order_type: "DELIVERY",
    latitude: 32.8872,
    longitude: 13.1913,
    subtotal: "18.50",
    delivery_fee: "4.00",
    total_amount: "22.50",
    status: "ASSIGNED",
    created_at: new Date("2026-10-10T10:30:00.000Z"),
    notes: "اتصل عند الوصول",
  };
  const items = [{
    product_id: 7,
    product_name: "وجبة",
    quantity: 1,
    unit_price: "18.50",
    subtotal: "18.50",
    addons: [{ addon_name: "جبن إضافي", price: "2.00" }],
  }];

  const restaurantView = buildOrderInvoice(order, { name: order.restaurant_name }, items, "PENDING");
  const driverView = buildOrderInvoice(order, { name: order.restaurant_name }, items, "PENDING");

  assert.equal(invoiceNumberForOrder(184), "INV-00000184");
  assert.deepEqual(restaurantView, driverView);
  assert.equal(restaurantView.orderNumber, 184);
  assert.equal(restaurantView.invoiceNumber, "INV-00000184");
  assert.equal(restaurantView.restaurantId, 12);
  assert.equal(restaurantView.customerName, "الاسم الكامل");
  assert.equal(restaurantView.customerPhone, "0912345678");
  assert.equal(restaurantView.deliveryLocation, "32.8872, 13.1913");
  assert.equal(
    restaurantView.mapsUrl,
    "https://www.google.com/maps/search/?api=1&query=32.8872%2C13.1913",
  );
  assert.deepEqual(restaurantView.items[0].addons, [{ addonName: "جبن إضافي", price: 2 }]);
  assert.equal(restaurantView.subtotal, 18.5);
  assert.equal(restaurantView.deliveryFee, 4);
  assert.equal(restaurantView.totalAmount, 22.5);
  assert.equal(restaurantView.status, "ASSIGNED");
  assert.equal(restaurantView.driverApprovalStatus, "PENDING");
  assert.equal(restaurantView.notes, "اتصل عند الوصول");
});

test("reservation invoices omit delivery maps and show an unassigned driver state", () => {
  const invoice = buildOrderInvoice({
    id: 9,
    restaurant_id: 2,
    customer_name: "عميل",
    customer_phone: "123",
    order_type: "RESERVATION",
    status: "NEW",
    created_at: "2026-10-10T10:30:00.000Z",
  }, { name: "المطعم" });

  assert.equal(invoice.mapsUrl, null);
  assert.equal(invoice.deliveryLocation, null);
  assert.equal(invoice.driverApprovalStatus, "NOT_ASSIGNED");
  assert.equal(invoice.invoiceNumber, "INV-00000009");
});
