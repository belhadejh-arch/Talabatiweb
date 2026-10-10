export function invoiceNumberForOrder(orderId) {
  const id = Number(orderId);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new Error("A persisted order ID is required for its invoice number");
  }
  return `INV-${String(id).padStart(8, "0")}`;
}

function numericOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function asIsoString(value) {
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value ?? "") : date.toISOString();
}

function mapInvoiceItem(item) {
  const quantity = Number(item.quantity || 0);
  const unitPrice = Number(item.unitPrice ?? item.unit_price ?? 0);
  const addons = (Array.isArray(item.addons) ? item.addons : []).map((addon) => ({
    addonName: String(addon.addonName ?? addon.addon_name ?? "إضافة"),
    price: Number(addon.price || 0),
  }));
  return {
    productId: item.productId == null && item.product_id == null
      ? null
      : Number(item.productId ?? item.product_id),
    productName: String(item.productName ?? item.product_name ?? "منتج"),
    quantity,
    unitPrice,
    subtotal: Number(item.subtotal ?? unitPrice * quantity),
    selectedSize: item.selectedSize ?? item.size_name ?? null,
    addons,
  };
}

/**
 * The order row and its existing line-item rows are the canonical invoice
 * record. Admin, restaurant, driver and email views all use this projection;
 * the deterministic invoice number is derived from the order's primary key.
 */
export function buildOrderInvoice(order, restaurant, items = [], assignmentStatus = order.assignment_status) {
  const id = Number(order.id);
  const orderType = order.order_type || "DELIVERY";
  const latitude = numericOrNull(order.latitude);
  const longitude = numericOrNull(order.longitude);
  const mapsUrl = orderType === "DELIVERY" && latitude != null && longitude != null
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`
    : null;
  const mappedItems = items.map(mapInvoiceItem);
  const approvalStatus = assignmentStatus || (order.driver_id == null ? "NOT_ASSIGNED" : "ACCEPTED");

  return {
    id,
    orderNumber: id,
    invoiceNumber: invoiceNumberForOrder(id),
    restaurantId: Number(order.restaurant_id),
    restaurantName: restaurant?.name || order.restaurant_name || "",
    customerName: order.customer_name || "",
    customerPhone: order.customer_phone || "",
    orderType,
    latitude,
    longitude,
    deliveryLocation: mapsUrl ? `${latitude}, ${longitude}` : null,
    mapsUrl,
    reservationDate: order.reservation_date instanceof Date
      ? order.reservation_date.toISOString().slice(0, 10)
      : order.reservation_date || null,
    reservationTime: order.reservation_time?.slice(0, 5) || null,
    partySize: order.party_size == null ? null : Number(order.party_size),
    notes: order.notes || null,
    items: mappedItems,
    itemsSummary: mappedItems.map((item) =>
      `${item.quantity} × ${item.productName}${item.selectedSize ? ` (${item.selectedSize})` : ""}${
        item.addons.length ? ` + ${item.addons.map((addon) => addon.addonName).join("، ")}` : ""
      }`
    ).join("، "),
    subtotal: Number(order.subtotal || 0),
    deliveryFee: Number(order.delivery_fee || 0),
    totalAmount: Number(order.total_amount || 0),
    status: order.status || "NEW",
    assignmentStatus: assignmentStatus || null,
    driverApprovalStatus: approvalStatus,
    driverId: order.assignment_driver_id == null
      ? (order.driver_id == null ? null : Number(order.driver_id))
      : Number(order.assignment_driver_id),
    isArchived: Boolean(order.is_archived),
    createdAt: asIsoString(order.created_at),
  };
}
