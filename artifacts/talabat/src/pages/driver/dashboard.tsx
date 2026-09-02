import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { getBaseUrl } from "@workspace/api-client-react";
import { getAssetUrl } from "@/lib/asset-url";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, ChevronDown, ChevronUp, Clock3, ExternalLink, LogOut, MapPin, Package, Phone, RefreshCw, Truck, X } from "lucide-react";

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
  totalDeliveries: number;
  restaurantName: string;
  restaurantLogoUrl?: string | null;
};

type DriverOrder = {
  id: number;
  orderType: "DELIVERY" | "RESERVATION";
  customerName: string;
  customerPhone: string;
  notes?: string | null;
  mapsUrl?: string | null;
  totalAmount: number;
  status: string;
  createdAt: string;
  canRespond: boolean;
};

type OrderDetail = DriverOrder & {
  items: Array<{ productName: string; quantity: number; sizeName?: string | null; subtotal: number; selectedAddons: Array<{ addonName: string; price: number }> }>;
};

const STATUS_LABEL: Record<string, string> = { NEW: "طلب جديد", ACCEPTED: "تم القبول", OUT_FOR_DELIVERY: "في الطريق", DELIVERED: "تم التسليم", PREPARING: "قيد التحضير", READY: "جاهز", CANCELLED: "ملغى" };
const STATUS_CLASS: Record<string, string> = { NEW: "border-amber-400/30 bg-amber-400/10 text-amber-600", ACCEPTED: "border-blue-400/30 bg-blue-400/10 text-blue-600", OUT_FOR_DELIVERY: "border-violet-400/30 bg-violet-400/10 text-violet-600", DELIVERED: "border-emerald-400/30 bg-emerald-400/10 text-emerald-600" };

export default function DriverDashboard() {
  const [, setLocation] = useLocation();
  const [driver, setDriver] = useState<Driver | null>(null);
  const [orders, setOrders] = useState<DriverOrder[]>([]);
  const [selected, setSelected] = useState<OrderDetail | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const base = getBaseUrl() ?? "";

  const request = useCallback(async (path: string, init?: RequestInit) => {
    const response = await fetch(`${base}${path}`, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
    const body = await response.json().catch(() => null);
    if (response.status === 401) { setLocation("/driver/login"); throw new Error("انتهت جلسة الدخول"); }
    if (!response.ok) throw new Error(body?.error || "تعذر تنفيذ الطلب");
    return body;
  }, [base, setLocation]);

  const load = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const [me, orderResponse] = await Promise.all([request("/api/driver-auth/me"), request("/api/driver/orders")]);
      setDriver(me);
      setOrders(orderResponse.data || []);
      setError("");
    } catch (loadError) {
      if (loadError instanceof Error && loadError.message !== "انتهت جلسة الدخول") setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => { void load(true); }, [load]);
  useEffect(() => { const timer = window.setInterval(() => void load(), 10000); return () => window.clearInterval(timer); }, [load]);

  const pending = useMemo(() => orders.filter((order) => order.status === "NEW" && order.canRespond), [orders]);
  const active = useMemo(() => orders.filter((order) => ["ACCEPTED", "OUT_FOR_DELIVERY"].includes(order.status)), [orders]);
  const history = useMemo(() => orders.filter((order) => ["DELIVERED", "CANCELLED"].includes(order.status)), [orders]);

  const openOrder = async (order: DriverOrder) => {
    try { setSelected(await request(`/api/driver/orders/${order.id}`)); } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "تعذر تحميل تفاصيل الطلب"); }
  };

  const respond = async (id: number, response: "ACCEPTED" | "REJECTED") => {
    setBusy(id);
    try { await request(`/api/driver/orders/${id}/respond`, { method: "POST", body: JSON.stringify({ response }) }); await load(); if (selected?.id === id) setSelected(null); } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "تعذر تحديث الطلب"); } finally { setBusy(null); }
  };

  const updateStatus = async (id: number, status: "OUT_FOR_DELIVERY" | "DELIVERED") => {
    setBusy(id);
    try { await request(`/api/driver/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }); await load(); if (selected?.id === id) setSelected(null); } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "تعذر تحديث حالة الطلب"); } finally { setBusy(null); }
  };

  const logout = async () => { await request("/api/driver-auth/logout", { method: "POST" }).catch(() => undefined); setLocation("/driver/login"); };

  if (loading && !driver) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-muted-foreground" dir="rtl">جاري تحميل لوحة السائق...</div>;

  return (
    <main className="min-h-screen bg-slate-50 pb-10" dir="rtl">
      <header className="border-b bg-slate-950 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary"><Truck className="h-6 w-6" /></div><div className="min-w-0"><p className="truncate text-lg font-black">مرحبًا، {driver?.name || "السائق"}</p><p className="truncate text-xs text-slate-400">{driver?.restaurantName || "لوحة السائق"} · رقم {driver?.serialNumber}</p></div></div>
          <div className="flex shrink-0 items-center gap-2"><Button size="icon" variant="ghost" className="text-slate-300 hover:bg-white/10 hover:text-white" onClick={() => void load()}><RefreshCw className="h-4 w-4" /></Button><Button size="sm" variant="ghost" className="text-slate-300 hover:bg-white/10 hover:text-white" onClick={() => void logout()}><LogOut className="ms-2 h-4 w-4" />خروج</Button></div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <section className="grid gap-3 sm:grid-cols-3"><Summary label="طلبات جديدة" value={pending.length} icon={Clock3} tone="amber" /><Summary label="طلبات نشطة" value={active.length} icon={Truck} tone="blue" /><Summary label="تم التسليم" value={driver?.totalDeliveries || 0} icon={Check} tone="emerald" /></section>
        <section className="grid gap-5 lg:grid-cols-[1fr_300px]">
          <div className="space-y-5">
            <OrderSection title="تحتاج ردك" count={pending.length} empty="لا توجد طلبات جديدة الآن">
              {pending.map((order) => <OrderCard key={order.id} order={order} busy={busy === order.id} onOpen={() => void openOrder(order)} onAccept={() => void respond(order.id, "ACCEPTED")} onReject={() => void respond(order.id, "REJECTED")} />)}
            </OrderSection>
            <OrderSection title="طلباتي النشطة" count={active.length} empty="لا توجد طلبات قيد التنفيذ">
              {active.map((order) => <OrderCard key={order.id} order={order} busy={busy === order.id} onOpen={() => void openOrder(order)} onDeliver={() => void updateStatus(order.id, order.status === "ACCEPTED" ? "OUT_FOR_DELIVERY" : "DELIVERED")} />)}
            </OrderSection>
            <OrderSection title="السجل الأخير" count={history.length} empty="لا يوجد سجل بعد">
              {history.slice(0, 8).map((order) => <OrderCard key={order.id} order={order} onOpen={() => void openOrder(order)} />)}
            </OrderSection>
          </div>
          <aside><Card className="sticky top-5"><CardHeader><CardTitle className="text-base">ملفي</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex items-center gap-3">{driver?.profileImageUrl ? <img src={getAssetUrl(driver.profileImageUrl)} alt="" className="h-14 w-14 rounded-2xl object-cover" /> : <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Truck /></div>}<div><p className="font-bold">{driver?.name}</p><p className="font-mono text-sm tracking-widest text-primary">{driver?.serialNumber}</p></div></div><div className="space-y-2 border-t pt-3 text-sm"><p><span className="text-muted-foreground">الهاتف:</span> <span dir="ltr">{driver?.phone}</span></p><p><span className="text-muted-foreground">المركبة:</span> {driver?.vehicleType || "غير محددة"} {driver?.vehiclePlate ? `· ${driver.vehiclePlate}` : ""}</p><p><span className="text-muted-foreground">المطعم:</span> {driver?.restaurantName}</p></div><div className="rounded-lg bg-emerald-50 p-3 text-xs leading-5 text-emerald-700">تظهر لك هنا الطلبات التابعة لمطعمك فقط، والجلسة محمية تلقائيًا.</div></CardContent></Card></aside>
        </section>
      </div>
      {selected && <OrderDialog order={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}

function Summary({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof Check; tone: "amber" | "blue" | "emerald" }) { const style = { amber: "bg-amber-100 text-amber-700", blue: "bg-blue-100 text-blue-700", emerald: "bg-emerald-100 text-emerald-700" }; return <Card><CardContent className="flex items-center gap-3 p-4"><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${style[tone]}`}><Icon className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-black">{value}</p></div></CardContent></Card>; }
function OrderSection({ title, count, empty, children }: { title: string; count: number; empty: string; children: React.ReactNode }) { return <Card><CardHeader className="flex flex-row items-center justify-between border-b pb-3"><CardTitle className="text-base">{title}</CardTitle><Badge variant="secondary">{count}</Badge></CardHeader><CardContent className="space-y-3 p-3">{count ? children : <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>}</CardContent></Card>; }
function OrderCard({ order, busy, onOpen, onAccept, onReject, onDeliver }: { order: DriverOrder; busy?: boolean; onOpen: () => void; onAccept?: () => void; onReject?: () => void; onDeliver?: () => void }) { return <div className="rounded-xl border bg-background p-4 transition-shadow hover:shadow-sm"><div className="flex items-start justify-between gap-3"><button className="min-w-0 text-right" onClick={onOpen}><p className="font-bold">طلب #{order.id} · {order.customerName}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(order.createdAt).toLocaleString("ar-LY")} · {order.orderType === "DELIVERY" ? "توصيل" : "حجز"}</p></button><Badge variant="outline" className={STATUS_CLASS[order.status] || ""}>{STATUS_LABEL[order.status] || order.status}</Badge></div><div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm"><span className="font-bold">{order.totalAmount.toFixed(2)} د.ل</span><span className="flex items-center gap-1 text-muted-foreground"><Phone className="h-3.5 w-3.5" />{order.customerPhone}</span>{order.mapsUrl && <a className="flex items-center gap-1 text-primary hover:underline" href={order.mapsUrl} target="_blank" rel="noreferrer"><MapPin className="h-3.5 w-3.5" />الموقع</a>}</div>{onAccept && onReject && <div className="mt-4 grid grid-cols-2 gap-2"><Button onClick={onAccept} disabled={busy}><Check className="ms-2 h-4 w-4" />قبول الطلب</Button><Button variant="outline" onClick={onReject} disabled={busy}><X className="ms-2 h-4 w-4" />رفض</Button></div>}{onDeliver && <Button className="mt-4 w-full" variant={order.status === "ACCEPTED" ? "default" : "secondary"} onClick={onDeliver} disabled={busy}>{order.status === "ACCEPTED" ? "بدأت التوصيل" : "تأكيد التسليم"}</Button>}</div>; }
function OrderDialog({ order, onClose }: { order: OrderDetail; onClose: () => void }) { return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4" onClick={onClose}><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-background p-5 sm:rounded-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><div><p className="text-lg font-black">تفاصيل الطلب #{order.id}</p><p className="text-sm text-muted-foreground">{order.customerName} · {order.customerPhone}</p></div><Button size="icon" variant="ghost" onClick={onClose}><X /></Button></div><div className="mt-5 space-y-3">{order.items.map((item, index) => <div key={`${item.productName}-${index}`} className="flex justify-between gap-3 border-b pb-2 text-sm"><span>{item.productName}{item.sizeName ? ` (${item.sizeName})` : ""} × {item.quantity}</span><b>{item.subtotal.toFixed(2)} د.ل</b></div>)}</div>{order.notes && <p className="mt-4 rounded-lg bg-muted p-3 text-sm">ملاحظات: {order.notes}</p>}{order.mapsUrl && <a href={order.mapsUrl} target="_blank" rel="noreferrer" className="mt-5 flex items-center justify-center gap-2 rounded-lg bg-primary/10 p-3 text-sm font-semibold text-primary"><ExternalLink className="h-4 w-4" />فتح موقع التوصيل</a>}<Button className="mt-4 w-full" variant="outline" onClick={onClose}><ChevronDown className="ms-2 h-4 w-4" />إغلاق</Button></div></div>; }