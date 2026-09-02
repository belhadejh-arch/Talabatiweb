import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { getBaseUrl } from "@workspace/api-client-react";
import { Bell, BellOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type DriverNotification = {
  id: number;
  type: string;
  message: string;
  orderId?: number | null;
  relatedId?: number | null;
  isRead: boolean;
  createdAt: string;
};

type PushRegistration = ServiceWorkerRegistration & {
  pushManager: PushManager;
};

function decodeVapidKey(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const bytes = Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
  return bytes.buffer.slice(0) as ArrayBuffer;
}

export default function DriverNotifications({ enabled }: { enabled: boolean }) {
  const [, setLocation] = useLocation();
  const base = getBaseUrl() ?? "";
  const [latest, setLatest] = useState<DriverNotification | null>(null);
  const [pushPrompt, setPushPrompt] = useState(false);
  const [pushWarning, setPushWarning] = useState("");
  const knownIds = useRef<Set<number>>(new Set());
  const initialized = useRef(false);

  const request = useCallback(async (path: string, init?: RequestInit) => {
    const response = await fetch(`${base}${path}`, {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error || "تعذر تحميل الإشعارات");
    return body;
  }, [base]);

  const loadNotifications = useCallback(async () => {
    try {
      const response = await request("/api/driver/notifications");
      const notifications: DriverNotification[] = response.data || [];
      if (initialized.current) {
        const incoming = notifications.find((notification) => !notification.isRead && !knownIds.current.has(notification.id));
        if (incoming) setLatest(incoming);
      }
      knownIds.current = new Set(notifications.map((notification) => notification.id));
      initialized.current = true;
    } catch {
      // The driver dashboard owns the auth redirect. A logged-out tab can safely stop polling.
    }
  }, [request]);

  const saveSubscription = useCallback(async (registration: PushRegistration, publicKey: string) => {
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(publicKey),
      });
    }
    await request("/api/driver/push/subscription", {
      method: "POST",
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        device: navigator.userAgent.slice(0, 255),
      }),
    });
    setPushPrompt(false);
    setPushWarning("");
  }, [request]);

  const enablePush = useCallback(async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushWarning("هذا المتصفح لا يدعم إشعارات Push.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushPrompt(false);
        setPushWarning("⚠️ إشعارات الطلبات غير مفعلة — فعّل الإشعارات حتى لا تفوتك الطلبات الجديدة.");
        return;
      }
      const response = await request("/api/driver/push/vapid-public-key");
      if (!response.publicKey) {
        setPushPrompt(false);
        setPushWarning("⚠️ إشعارات الطلبات غير مهيأة على الخادم حاليًا.");
        return;
      }
      const registration = await navigator.serviceWorker.ready as PushRegistration;
      await saveSubscription(registration, response.publicKey);
    } catch {
      setPushPrompt(false);
      setPushWarning("⚠️ تعذر تفعيل إشعارات الطلبات. يمكنك متابعة استخدام المنصة.");
    }
  }, [request, saveSubscription]);

  useEffect(() => {
    if (!enabled) return;
    void loadNotifications();
    const timer = window.setInterval(() => void loadNotifications(), 10000);
    const onPushMessage = (event: MessageEvent<{ type?: string; payload?: { title?: string; body?: string; orderId?: number } }>) => {
      if (event.data?.type !== "NEW_DRIVER_ORDER" || !event.data.payload) return;
      setLatest({
        id: 0,
        type: "NEW_DRIVER_ORDER",
        message: event.data.payload.body || "لديك طلب جديد",
        orderId: event.data.payload.orderId ?? null,
        relatedId: event.data.payload.orderId ?? null,
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    };
    navigator.serviceWorker?.addEventListener("message", onPushMessage);
    return () => {
      window.clearInterval(timer);
      navigator.serviceWorker?.removeEventListener("message", onPushMessage);
    };
  }, [enabled, loadNotifications]);

  useEffect(() => {
    if (!enabled) return;
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushWarning("⚠️ إشعارات الطلبات غير مفعلة — هذا المتصفح لا يدعم Web Push.");
      return;
    }
    const setup = async () => {
      try {
        const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}driver-sw.js`, {
          scope: import.meta.env.BASE_URL,
        }) as PushRegistration;
        const response = await request("/api/driver/push/vapid-public-key");
        if (!response.publicKey) {
          setPushWarning("⚠️ إشعارات الطلبات غير مهيأة على الخادم حاليًا.");
          return;
        }
        if (Notification.permission === "denied") {
          setPushWarning("⚠️ إشعارات الطلبات غير مفعلة — فعّل الإشعارات من إعدادات المتصفح حتى لا تفوتك الطلبات الجديدة.");
        } else if (Notification.permission === "granted") {
          await saveSubscription(registration, response.publicKey);
        } else {
          setPushPrompt(true);
        }
      } catch {
        setPushWarning("⚠️ تعذر تجهيز إشعارات الطلبات. يمكنك متابعة استخدام المنصة.");
      }
    };
    void setup();
  }, [enabled, request, saveSubscription]);

  if (!enabled) return null;

  const openNotification = async () => {
    if (!latest) return;
    if (latest.id > 0) {
      await request(`/api/driver/notifications/${latest.id}/read`, { method: "PATCH" }).catch(() => undefined);
    }
    const orderId = latest.orderId ?? latest.relatedId;
    setLatest(null);
    if (orderId) setLocation(`/driver/dashboard?order=${orderId}`);
  };

  return <>
    {pushPrompt && <div className="mx-auto mt-4 flex max-w-6xl items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm" dir="rtl">
      <div className="flex items-start gap-3"><Bell className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="font-bold">🔔 تفعيل إشعارات الطلبات</p><p className="mt-1 text-muted-foreground">اسمح بالإشعارات حتى تصلك الطلبات الجديدة فورًا حتى عندما لا تكون داخل المنصة.</p></div></div>
      <Button className="shrink-0" onClick={() => void enablePush()}>السماح بالإشعارات</Button>
    </div>}
    {pushWarning && !pushPrompt && <div className="mx-auto mt-4 flex max-w-6xl items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" dir="rtl"><BellOff className="h-4 w-4 shrink-0" />{pushWarning}<button className="ms-auto" aria-label="إغلاق التنبيه" onClick={() => setPushWarning("")}><X className="h-4 w-4" /></button></div>}
    {latest && <div className="fixed inset-x-3 top-4 z-[60] mx-auto max-w-md rounded-2xl border-2 border-red-400 bg-white p-4 text-right shadow-2xl" dir="rtl" role="alert">
      <button className="absolute left-3 top-3 text-muted-foreground" aria-label="إغلاق الإشعار" onClick={() => setLatest(null)}><X className="h-4 w-4" /></button>
      <p className="font-black text-red-700">🔔 طلب جديد من مطعم</p>
      <p className="mt-1 font-bold">{latest.message}</p>
      <Button className="mt-3 w-full" onClick={() => void openNotification()}>اضغط لعرض الطلب</Button>
    </div>}
  </>;
}