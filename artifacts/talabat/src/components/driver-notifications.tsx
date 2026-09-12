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

type DriverOrderEvent = {
  type?: string;
  notificationId?: number | null;
  orderId?: number;
  message?: string;
};

type OneSignalInstance = {
  login: (externalId: string) => Promise<void>;
  Notifications: {
    requestPermission: () => Promise<boolean>;
  };
  User: {
    PushSubscription: {
      optIn: () => Promise<void>;
    };
  };
};

declare global {
  interface Window {
    OneSignalDeferred?: Array<(oneSignal: OneSignalInstance) => void | Promise<void>>;
  }
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
      const incoming = notifications.find((notification) => !notification.isRead && !knownIds.current.has(notification.id));
      if (incoming) setLatest(incoming);
      knownIds.current = new Set(notifications.map((notification) => notification.id));
      initialized.current = true;
    } catch {
      // The driver dashboard owns the auth redirect. A logged-out tab can safely stop polling.
    }
  }, [request]);

  const enablePush = useCallback(async () => {
    if (!("Notification" in window)) {
      setPushWarning("هذا المتصفح لا يدعم إشعارات Push.");
      return;
    }
    try {
      const permission = await new Promise<boolean>((resolve, reject) => {
        if (!window.OneSignalDeferred) {
          reject(new Error("OneSignal is not loaded"));
          return;
        }
        window.OneSignalDeferred.push(async (OneSignal) => {
          try {
            resolve(await OneSignal.Notifications.requestPermission());
            await OneSignal.User.PushSubscription.optIn();
          } catch (error) {
            reject(error);
          }
        });
      });
      if (permission) {
        setPushPrompt(false);
        setPushWarning("");
      } else {
        setPushPrompt(false);
        setPushWarning("⚠️ إشعارات الطلبات غير مفعلة — فعّل الإشعارات حتى لا تفوتك الطلبات الجديدة.");
      }
    } catch {
      setPushPrompt(false);
      setPushWarning("⚠️ تعذر تحميل OneSignal. يمكنك متابعة استخدام المنصة ثم المحاولة مرة أخرى.");
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void loadNotifications();
    const timer = window.setInterval(() => void loadNotifications(), 30000);
    const eventSource = new EventSource(`${base}/api/driver/events`, { withCredentials: true });
    eventSource.onopen = () => { void loadNotifications(); };
    eventSource.onmessage = (event) => {
      let data: DriverOrderEvent;
      try {
        data = JSON.parse(event.data) as DriverOrderEvent;
      } catch {
        return;
      }
      if (data.type !== "NEW_DRIVER_ORDER" || !data.orderId) return;
      setLatest({
        id: data.notificationId ?? 0,
        type: "NEW_DRIVER_ORDER",
        message: data.message || "لديك طلب جديد",
        orderId: data.orderId,
        relatedId: data.orderId,
        isRead: false,
        createdAt: new Date().toISOString(),
      });
      window.dispatchEvent(new CustomEvent("driver-order-received", { detail: { orderId: data.orderId } }));
      void loadNotifications();
    };
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
      eventSource.close();
      navigator.serviceWorker?.removeEventListener("message", onPushMessage);
    };
  }, [base, enabled, loadNotifications]);

  useEffect(() => {
    if (!enabled) return;
    const setup = async () => {
      try {
        const driver = await request("/api/driver-auth/me");
        if (!window.OneSignalDeferred) {
          setPushWarning("⚠️ تعذر تحميل OneSignal. تحقق من اتصال الإنترنت ثم أعد تحميل الصفحة.");
          return;
        }
        window.OneSignalDeferred.push(async (OneSignal) => {
          await OneSignal.login(String(driver.id));
          if (Notification.permission === "denied") {
            setPushWarning("⚠️ إشعارات الطلبات غير مفعلة — فعّل الإشعارات من إعدادات المتصفح.");
          } else if (Notification.permission === "granted") {
            await OneSignal.User.PushSubscription.optIn();
          } else {
            setPushPrompt(true);
          }
        });
      } catch {
        // The dashboard owns the auth redirect and error state.
      }
    };
    void setup();
  }, [enabled, request]);

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