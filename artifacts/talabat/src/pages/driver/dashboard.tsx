import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { getBaseUrl } from "@workspace/api-client-react";
import { getAssetUrl } from "@/lib/asset-url";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3,
  Check,
  ChevronLeft,
  Clock3,
  ExternalLink,
  Home,
  LogOut,
  MapPin,
  Phone,
  RefreshCw,
  UserRound,
  Truck,
  X,
} from "lucide-react";

type Driver = {
  id: number;
  serialNumber: string;
  name: string;
  phone: string;
  whatsappNumber?: string | null;
  address?: string | null;
  birthDate?: string | null;
  profileImageUrl?: string | null;
  vehicleType?: string | null;
  vehiclePlate?: string | null;
  createdAt: string;
  totalDeliveries: number;
  isActive: boolean;
  status: string;
  restaurantName: string;
  restaurantLogoUrl?: string | null;
};

type OrderItem = {
  productName: string;
  quantity: number;
  sizeName?: string | null;
  subtotal: number;
  selectedAddons: Array<{ addonName: string; price: number }>;
};

type DriverOrder = {
  id: number;
  orderType: "DELIVERY" | "RESERVATION";
  customerName: string;
  customerPhone: string;
  notes?: string | null;
  mapsUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  totalAmount: number;
  status: string;
  createdAt: string;
  canRespond: boolean;
  restaurantName?: string;
  driverResponseStatus?: string | null;
  driverAttemptSentAt?: string | null;
  driverAttemptResponseAt?: string | null;
  driverAttemptTimeoutAt?: string | null;
  items?: OrderItem[];
};

type DriverStats = {
  totalOrders: number;
  acceptedOrders: number;
  rejectedOrders: number;
  timeoutOrders: number;
};

type Section = "new" | "orders" | "stats" | "profile";

const ORDER_STATUS_LABEL: Record<string, string> = {
  NEW: "طلب جديد",
  WAITING_FOR_DRIVER: "بانتظار سائق",
  ACCEPTED: "تم القبول",
  OUT_FOR_DELIVERY: "في الطريق",
  DELIVERED: "تم التسليم",
  PREPARING: "قيد التحضير",
  READY: "جاهز",
  CANCELLED: "ملغى",
};

const RESPONSE_STATUS_LABEL: Record<string, string> = {
  ACCEPTED: "مقبول",
  REJECTED: "مرفوض",
  TIMEOUT: "منتهية المهلة",
  PENDING: "بانتظار ردك",
  REASSIGNED: "أعيد إسناده",
};

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ar-LY", { dateStyle: "medium", timeStyle: "short" });
}

function formatMoney(value: number) {
  return `${Number(value).toFixed(2)} د.ل`;
}

export default function DriverDashboard() {
  const [, setLocation] = useLocation();
  const [section, setSection] = useState<Section>("new");
  const [driver, setDriver] = useState<Driver | null>(null);
  const [orders, setOrders] = useState<DriverOrder[]>([]);
  const [history, setHistory] = useState<DriverOrder[]>([]);
  const [stats, setStats] = useState<DriverStats | null>(null);
  const [selected, setSelected] = useState<DriverOrder | null>(null);
  const [historyTab, setHistoryTab] = useState("accepted");
  const [busy, setBusy] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const openedPushOrder = useRef(false);
  const base = getBaseUrl() ?? "";

  const request = useCallback(async (path: string, init?: RequestInit) => {
    const response = await fetch(`${base}${path}`, {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    });
    const body = await response.json().catch(() => null);
    if (response.status === 401) {
      setLocation("/driver/login");
      throw new Error("انتهت جلسة الدخول");
    }
    if (!response.ok) throw new Error(body?.error || "تعذر تنفيذ الطلب");
    return body;
  }, [base, setLocation]);

  const load = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const [me, currentResponse, historyResponse, statsResponse] = await Promise.all([
        request("/api/driver-auth/me"),
        request("/api/driver/orders"),
        request("/api/driver/orders/history"),
        request("/api/driver/stats"),
      ]);
      setDriver(me);
      setOrders(currentResponse.data || []);
      setHistory(historyResponse.data || []);
      setStats(statsResponse);
      setError("");
    } catch (loadError) {
      if (loadError instanceof Error && loadError.message !== "انتهت جلسة الدخول") setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => { void load(true); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => void load(), 10000);
    return () => window.clearInterval(timer);
  }, [load]);
  useEffect(() => {
    const orderId = Number(new URLSearchParams(window.location.search).get("order"));
    if (!driver || loading || openedPushOrder.current || !Number.isInteger(orderId) || orderId <= 0) return;
    openedPushOrder.current = true;
    void request(`/api/driver/orders/${orderId}`).then(setSelected).catch(() => undefined);
  }, [driver, loading, request]);

  const pending = useMemo(() => orders.filter((order) => order.status === "NEW" && order.canRespond), [orders]);
  const active = useMemo(() => orders.filter((order) => ["ACCEPTED", "OUT_FOR_DELIVERY"].includes(order.status)), [orders]);
  const acceptedHistory = useMemo(() => history.filter((order) => order.driverResponseStatus === "ACCEPTED"), [history]);
  const rejectedHistory = useMemo(() => history.filter((order) => order.driverResponseStatus === "REJECTED"), [history]);
  const timeoutHistory = useMemo(() => history.filter((order) => order.driverResponseStatus === "TIMEOUT"), [history]);
  const historyByTab = { accepted: acceptedHistory, rejected: rejectedHistory, timeout: timeoutHistory };

  const openOrder = async (order: DriverOrder) => {
    try { setSelected(await request(`/api/driver/orders/${order.id}`)); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "تعذر تحميل تفاصيل الطلب"); }
  };

  const respond = async (id: number, response: "ACCEPTED" | "REJECTED") => {
    setBusy(id);
    try {
      await request(`/api/driver/orders/${id}/respond`, { method: "POST", body: JSON.stringify({ response }) });
      await load();
      setSection(response === "ACCEPTED" ? "orders" : "new");
      if (selected?.id === id) setSelected(null);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "تعذر تحديث الطلب");
    } finally { setBusy(null); }
  };

  const updateStatus = async (id: number, status: "OUT_FOR_DELIVERY" | "DELIVERED") => {
    setBusy(id);
    try {
      await request(`/api/driver/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      await load();
      if (selected?.id === id) setSelected(null);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "تعذر تحديث حالة الطلب");
    } finally { setBusy(null); }
  };

  const logout = async () => {
    await request("/api/driver-auth/logout", { method: "POST" }).catch(() => undefined);
    setLocation("/driver/login");
  };

  if (loading && !driver) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-muted-foreground" dir="rtl">جاري تحميل لوحة السائق...</div>;
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-24" dir="rtl">
      <header className="border-b bg-slate-950 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar driver={driver} size="large" />
            <div className="min-w-0">
              <p className="truncate text-lg font-black">مرحبًا، {driver?.name || "السائق"}</p>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="truncate">{driver?.restaurantName || "لوحة السائق"} · رقم {driver?.serialNumber}</span>
                {driver?.status === "ACTIVE" && <span className="shrink-0 rounded-full bg-emerald-400/15 px-2 py-0.5 text-emerald-300">نشط</span>}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button size="icon" variant="ghost" aria-label="تحديث" className="text-slate-300 hover:bg-white/10 hover:text-white" onClick={() => void load()}><RefreshCw className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" className="text-slate-300 hover:bg-white/10 hover:text-white" onClick={() => void logout()}><LogOut className="ms-2 h-4 w-4" />خروج</Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 sm:px-6 sm:py-6">
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Summary label="طلبات جديدة" value={pending.length} icon={Clock3} tone="amber" />
          <Summary label="طلباتي النشطة" value={active.length} icon={Truck} tone="blue" />
          <Summary label="المقبولة" value={stats?.acceptedOrders || 0} icon={Check} tone="emerald" />
          <Summary label="منتهية المهلة" value={stats?.timeoutOrders || 0} icon={Clock3} tone="slate" />
        </section>

        <div className="flex gap-2 overflow-x-auto rounded-2xl border bg-white p-2 shadow-sm">
          <NavButton active={section === "new"} icon={BellIcon} label={`طلبات جديدة${pending.length ? ` (${pending.length})` : ""}`} onClick={() => setSection("new")} urgent={pending.length > 0} />
          <NavButton active={section === "orders"} icon={Truck} label="طلباتي" onClick={() => setSection("orders")} />
          <NavButton active={section === "stats"} icon={BarChart3} label="إحصائياتي" onClick={() => setSection("stats")} />
          <NavButton active={section === "profile"} icon={UserRound} label="ملفي" onClick={() => setSection("profile")} />
        </div>

        {section === "new" && (
          <div className="space-y-5">
            <SectionHeading eyebrow="أولوية قصوى" title="طلبات جديدة" description="استجب قبل انتهاء المهلة حتى ينتقل الطلب تلقائيًا للسائق التالي." />
            <OrderSection count={pending.length} empty="لا توجد طلبات جديدة الآن">
              {pending.map((order) => <OrderCard key={order.id} order={order} busy={busy === order.id} onOpen={() => void openOrder(order)} onAccept={() => void respond(order.id, "ACCEPTED")} onReject={() => void respond(order.id, "REJECTED")} urgent />)}
            </OrderSection>
            <OrderSection title="طلباتي النشطة" count={active.length} empty="لا توجد طلبات قيد التنفيذ">
              {active.map((order) => <OrderCard key={order.id} order={order} busy={busy === order.id} onOpen={() => void openOrder(order)} onDeliver={() => void updateStatus(order.id, order.status === "ACCEPTED" ? "OUT_FOR_DELIVERY" : "DELIVERED")} />)}
            </OrderSection>
          </div>
        )}

        {section === "orders" && (
          <div className="space-y-5">
            <SectionHeading eyebrow="السجل محفوظ" title="طلباتي" description="كل طلب ظهر لك محفوظ هنا مع حالة ردك عليه." />
            <Tabs value={historyTab} onValueChange={setHistoryTab} dir="rtl">
              <TabsList className="grid h-auto w-full grid-cols-3 bg-white p-1 shadow-sm">
                <TabsTrigger value="accepted" className="gap-1 py-2.5">المقبولة <Badge variant="secondary">{acceptedHistory.length}</Badge></TabsTrigger>
                <TabsTrigger value="rejected" className="gap-1 py-2.5">المرفوضة <Badge variant="secondary">{rejectedHistory.length}</Badge></TabsTrigger>
                <TabsTrigger value="timeout" className="gap-1 py-2.5">المنتهية <Badge variant="secondary">{timeoutHistory.length}</Badge></TabsTrigger>
              </TabsList>
              {(["accepted", "rejected", "timeout"] as const).map((tab) => (
                <TabsContent key={tab} value={tab}>
                  <OrderSection count={historyByTab[tab].length} empty={tab === "accepted" ? "لا توجد طلبات مقبولة بعد" : tab === "rejected" ? "لا توجد طلبات مرفوضة بعد" : "لا توجد طلبات انتهت مهلة الرد عليها"}>
                    {historyByTab[tab].map((order) => <OrderCard key={`${order.id}-${order.driverAttemptSentAt}`} order={order} onOpen={() => void openOrder(order)} history />)}
                  </OrderSection>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        )}

        {section === "stats" && <StatsPanel stats={stats} />}
        {section === "profile" && <ProfilePanel driver={driver} />}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 px-2 py-2 shadow-[0_-8px_24px_rgba(15,23,42,.08)] backdrop-blur sm:hidden">
        <div className="mx-auto grid max-w-md grid-cols-4">
          <NavButton active={section === "new"} icon={Home} label="الجديدة" onClick={() => setSection("new")} urgent={pending.length > 0} compact />
          <NavButton active={section === "orders"} icon={Truck} label="طلباتي" onClick={() => setSection("orders")} compact />
          <NavButton active={section === "stats"} icon={BarChart3} label="إحصائياتي" onClick={() => setSection("stats")} compact />
          <NavButton active={section === "profile"} icon={UserRound} label="ملفي" onClick={() => setSection("profile")} compact />
        </div>
      </nav>
      {selected && <OrderDialog order={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}

function BellIcon({ className }: { className?: string }) {
  return <span className={className}>🔔</span>;
}

function Avatar({ driver, size = "normal" }: { driver: Driver | null; size?: "normal" | "large" }) {
  const className = size === "large" ? "h-11 w-11 rounded-2xl" : "h-16 w-16 rounded-2xl";
  return driver?.profileImageUrl
    ? <img src={getAssetUrl(driver.profileImageUrl)} alt="" className={`${className} shrink-0 object-cover ring-2 ring-white/10`} />
    : <div className={`flex ${className} shrink-0 items-center justify-center bg-primary text-primary-foreground`}><Truck className={size === "large" ? "h-6 w-6" : "h-8 w-8"} /></div>;
}

function NavButton({ active, icon: Icon, label, onClick, urgent, compact }: { active: boolean; icon: typeof Truck | typeof BellIcon | typeof Home; label: string; onClick: () => void; urgent?: boolean; compact?: boolean }) {
  return <button onClick={onClick} className={`relative flex min-w-max items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition-colors ${compact ? "min-w-0 flex-col gap-0.5 px-2 text-[11px]" : "flex-1"} ${active ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"} ${urgent && !active ? "text-amber-700" : ""}`}><Icon className={compact ? "h-4 w-4" : "h-4 w-4"} />{label}{urgent && <span className="absolute end-2 top-1 h-2 w-2 rounded-full bg-red-500" />}</button>;
}

function Summary({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof Check; tone: "amber" | "blue" | "emerald" | "slate" }) {
  const style = { amber: "bg-amber-100 text-amber-700", blue: "bg-blue-100 text-blue-700", emerald: "bg-emerald-100 text-emerald-700", slate: "bg-slate-100 text-slate-700" };
  return <Card><CardContent className="flex items-center gap-2.5 p-3 sm:p-4"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style[tone]}`}><Icon className="h-4 w-4" /></div><div className="min-w-0"><p className="truncate text-[11px] text-muted-foreground sm:text-xs">{label}</p><p className="text-xl font-black sm:text-2xl">{value}</p></div></CardContent></Card>;
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div><p className="mb-1 text-xs font-black uppercase tracking-widest text-primary">{eyebrow}</p><h1 className="text-2xl font-black tracking-tight">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>;
}

function OrderSection({ title, count, empty, children }: { title?: string; count: number; empty: string; children: ReactNode }) {
  return <Card className="overflow-hidden"><CardHeader className="flex flex-row items-center justify-between border-b bg-white pb-3"><CardTitle className="text-base">{title || "الطلبات"} </CardTitle><Badge variant="secondary">{count}</Badge></CardHeader><CardContent className="space-y-3 bg-white p-3">{count ? children : <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>}</CardContent></Card>;
}

function OrderCard({ order, busy, onOpen, onAccept, onReject, onDeliver, urgent, history }: { order: DriverOrder; busy?: boolean; onOpen: () => void; onAccept?: () => void; onReject?: () => void; onDeliver?: () => void; urgent?: boolean; history?: boolean }) {
  const responseLabel = order.driverResponseStatus ? RESPONSE_STATUS_LABEL[order.driverResponseStatus] || order.driverResponseStatus : null;
  return <div className={`rounded-2xl border bg-background p-4 transition-shadow hover:shadow-sm ${urgent ? "border-amber-300 bg-amber-50/30 shadow-md shadow-amber-100" : ""}`}>
    <div className="flex items-start justify-between gap-3">
      <button className="min-w-0 text-right" onClick={onOpen}><p className="font-black">طلب #{order.id} · {order.customerName}</p><p className="mt-1 text-xs text-muted-foreground">{order.restaurantName || "المطعم التابع"} · {formatDate(order.createdAt)}</p></button>
      <Badge variant="outline" className={urgent ? "border-amber-400 bg-amber-100 text-amber-800" : ""}>{history ? responseLabel : ORDER_STATUS_LABEL[order.status] || order.status}</Badge>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm"><span className="font-black">{formatMoney(order.totalAmount)}</span><span className="text-muted-foreground">{order.orderType === "DELIVERY" ? "توصيل" : "حجز"}</span><span className="flex items-center gap-1 text-muted-foreground"><Phone className="h-3.5 w-3.5" /><span dir="ltr">{order.customerPhone}</span></span>{order.orderType === "DELIVERY" && order.mapsUrl && <a className="flex items-center gap-1 font-bold text-primary hover:underline" href={order.mapsUrl} target="_blank" rel="noreferrer"><MapPin className="h-3.5 w-3.5" />الموقع</a>}</div>
    {order.items && order.items.length > 0 && <div className="mt-3 space-y-1 rounded-xl bg-muted/50 p-3 text-sm">{order.items.slice(0, 3).map((item, index) => <div key={`${item.productName}-${index}`} className="flex justify-between gap-3"><span>{item.productName}{item.sizeName ? ` (${item.sizeName})` : ""} × {item.quantity}</span><b>{formatMoney(item.subtotal)}</b></div>)}{order.items.length > 3 && <p className="pt-1 text-xs text-muted-foreground">+ {order.items.length - 3} أصناف أخرى</p>}</div>}
    {onAccept && onReject && <div className="mt-4 grid grid-cols-2 gap-2"><Button className="h-12 text-base font-black" onClick={onAccept} disabled={busy}><Check className="ms-2 h-4 w-4" />قبول الطلب</Button><Button className="h-12 text-base font-bold" variant="outline" onClick={onReject} disabled={busy}><X className="ms-2 h-4 w-4" />رفض</Button></div>}
    {onDeliver && <Button className="mt-4 h-11 w-full font-bold" variant={order.status === "ACCEPTED" ? "default" : "secondary"} onClick={onDeliver} disabled={busy}>{order.status === "ACCEPTED" ? "بدأت التوصيل" : "تأكيد التسليم"}</Button>}
  </div>;
}

function StatsPanel({ stats }: { stats: DriverStats | null }) {
  const values = [
    { label: "إجمالي الطلبات", value: stats?.totalOrders || 0, icon: "📦", tone: "bg-slate-100" },
    { label: "الطلبات المقبولة", value: stats?.acceptedOrders || 0, icon: "✅", tone: "bg-emerald-50" },
    { label: "الطلبات المرفوضة", value: stats?.rejectedOrders || 0, icon: "❌", tone: "bg-red-50" },
    { label: "الملغية / المنتهية المهلة", value: stats?.timeoutOrders || 0, icon: "⏱", tone: "bg-amber-50" },
  ];
  return <div className="space-y-5"><SectionHeading eyebrow="من قاعدة البيانات" title="إحصائياتي" description="الأرقام محسوبة من سجل محاولات الطلبات في PostgreSQL، ولا يدخل الرفض اليدوي ضمن المنتهية المهلة." /><div className="grid gap-3 sm:grid-cols-2">{values.map((item) => <Card key={item.label}><CardContent className="flex items-center gap-4 p-5"><div className={`flex h-14 w-14 items-center justify-center rounded-2xl text-2xl ${item.tone}`}>{item.icon}</div><div><p className="text-sm text-muted-foreground">{item.label}</p><p className="mt-1 text-3xl font-black">{item.value}</p></div></CardContent></Card>)}</div></div>;
}

function ProfilePanel({ driver }: { driver: Driver | null }) {
  const fields = [
    ["الاسم الكامل", driver?.name],
    ["رقم الهاتف", driver?.phone, true],
    ["WhatsApp — معلومة فقط", driver?.whatsappNumber || "غير مسجل", true],
    ["العنوان", driver?.address || "غير مسجل"],
    ["المطعم", driver?.restaurantName],
    ["الرقم التسلسلي", driver?.serialNumber, true],
    ["تاريخ إنشاء الحساب", formatDate(driver?.createdAt)],
    ["حالة الحساب", driver?.status === "ACTIVE" ? "نشط" : "غير نشط"],
  ] as const;
  return <div className="space-y-5"><SectionHeading eyebrow="حسابي" title="ملفي الشخصي" description="هذه البيانات يديرها المشرف ولا يمكن تعديل البيانات الحساسة من لوحة السائق." /><Card><CardContent className="p-5"><div className="flex flex-col items-center gap-3 border-b pb-5 sm:flex-row"><Avatar driver={driver} /><div className="text-center sm:text-right"><h2 className="text-xl font-black">{driver?.name}</h2><p className="mt-1 text-sm text-muted-foreground">{driver?.restaurantName}</p></div></div><div className="grid gap-0 sm:grid-cols-2">{fields.map(([label, value, ltr]) => <div key={label} className="border-b py-3 last:border-0 sm:odd:pe-5 sm:even:ps-5"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 font-bold ${ltr ? "text-left" : ""}`} dir={ltr ? "ltr" : undefined}>{value || "—"}</p></div>)}</div><div className="mt-5 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-muted-foreground"><UserRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" />لتعديل هذه البيانات، تواصل مع إدارة المطعم. لا يعتمد الدخول أو الصلاحيات على الرقم التسلسلي وحده بعد إنشاء الجلسة.</div></CardContent></Card></div>;
}

function OrderDialog({ order, onClose }: { order: DriverOrder; onClose: () => void }) {
  const hasLocation = order.orderType === "DELIVERY" && (order.latitude != null || order.longitude != null || !!order.mapsUrl);
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4" onClick={onClose}><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-background p-5 sm:rounded-2xl" onClick={(event) => event.stopPropagation()}>
    <div className="flex items-start justify-between gap-3"><div><p className="text-lg font-black">تفاصيل الطلب #{order.id}</p><p className="mt-1 text-sm text-muted-foreground">{order.restaurantName} · {order.orderType === "DELIVERY" ? "توصيل" : "حجز"}</p><p className="mt-1 text-xs text-muted-foreground">{order.customerName} · {formatDate(order.createdAt)}</p></div><Button size="icon" variant="ghost" onClick={onClose}><X /></Button></div>
    <div className="mt-5 space-y-3">{(order.items || []).map((item, index) => <div key={`${item.productName}-${index}`} className="flex justify-between gap-3 border-b pb-2 text-sm"><span>{item.productName}{item.sizeName ? ` (${item.sizeName})` : ""} × {item.quantity}</span><b>{formatMoney(item.subtotal)}</b></div>)}</div>
    <div className="mt-4 flex justify-between rounded-xl bg-primary/5 p-3 font-black"><span>الإجمالي</span><span>{formatMoney(order.totalAmount)}</span></div>
    <div className="mt-4 grid grid-cols-2 gap-2 text-sm"><Info label="العميل" value={order.customerName} /><Info label="الهاتف" value={order.customerPhone} ltr /></div>
    {order.driverResponseStatus && <div className="mt-4 rounded-xl border bg-muted/40 p-3 text-sm"><p className="font-bold">حالة السائق تجاه الطلب</p><p className="mt-1 text-primary">{RESPONSE_STATUS_LABEL[order.driverResponseStatus] || order.driverResponseStatus}</p>{order.driverAttemptSentAt && <p className="mt-1 text-xs text-muted-foreground">وصل إليك: {formatDate(order.driverAttemptSentAt)}</p>}</div>}
    {order.notes && <p className="mt-4 rounded-xl bg-muted p-3 text-sm">ملاحظات العميل: {order.notes}</p>}
    {hasLocation && <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm"><p className="font-bold text-primary">موقع العميل</p>{order.latitude != null && <p className="mt-2" dir="ltr">Latitude: {order.latitude}</p>}{order.longitude != null && <p dir="ltr">Longitude: {order.longitude}</p>}{order.mapsUrl && <a href={order.mapsUrl} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-primary p-3 font-semibold text-primary-foreground"><ExternalLink className="h-4 w-4" />فتح الموقع في Google Maps</a>}</div>}
    <Button className="mt-4 w-full" variant="outline" onClick={onClose}><ChevronLeft className="ms-2 h-4 w-4" />إغلاق</Button>
  </div></div>;
}

function Info({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return <div className="rounded-lg bg-muted/40 p-2"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-bold" dir={ltr ? "ltr" : undefined}>{value}</p></div>;
}