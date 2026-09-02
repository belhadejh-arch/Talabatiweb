const DRIVER_SCOPE = self.registration ? self.registration.scope : "/";

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "لديك طلب جديد" };
  }

  const title = payload.title || "🚨 طلب جديد";
  const options = {
    body: payload.body || "لديك طلب جديد من مطعمك",
    icon: `${DRIVER_SCOPE}favicon.svg`,
    badge: `${DRIVER_SCOPE}favicon.svg`,
    tag: payload.orderId ? `driver-order-${payload.orderId}` : "driver-order",
    renotify: true,
    data: { orderId: payload.orderId, url: payload.url },
  };
  event.waitUntil(self.registration.showNotification(title, options));
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      client.postMessage({ type: "NEW_DRIVER_ORDER", payload });
    }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = data.url || `${DRIVER_SCOPE}driver/dashboard${data.orderId ? `?order=${data.orderId}` : ""}`;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        await client.navigate(target);
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});