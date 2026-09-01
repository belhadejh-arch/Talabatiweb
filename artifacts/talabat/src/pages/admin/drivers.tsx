import { useEffect, useState } from "react";
import { getBaseUrl, getListDriversQueryKey, getListOrdersQueryKey, useCreateDriver, useDeleteDriver, useListDrivers, useListOrders, useListRestaurants, useUpdateDriver } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/currency";
import { orderStatusLabel } from "@/lib/labels";

type DriverForm = { name: string; phone: string; telegramChatId: string; address: string; restaurantId: string; isActive: boolean };
const empty: DriverForm = { name: "", phone: "", telegramChatId: "", address: "", restaurantId: "", isActive: true };

export default function AdminDrivers() {
  const [form, setForm] = useState<DriverForm>(empty);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null);
  const [telegramStatus, setTelegramStatus] = useState<{ connected: boolean; bot?: { username: string | null; firstName: string }; error?: string } | null>(null);
  const [recentChats, setRecentChats] = useState<Array<{ chatId: string; title: string; username: string | null }>>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const { data: restaurants } = useListRestaurants({ limit: 100 });
  const restaurantId = Number(form.restaurantId);
  const { data: drivers = [] } = useListDrivers(restaurantId, { query: { queryKey: getListDriversQueryKey(restaurantId), enabled: !!restaurantId } });
  const driverOrderParams = { driverId: selectedDriverId ?? undefined, limit: 50 };
  const { data: orders } = useListOrders(driverOrderParams, { query: { queryKey: getListOrdersQueryKey(driverOrderParams), enabled: !!selectedDriverId } });
  const create = useCreateDriver();
  const update = useUpdateDriver();
  const remove = useDeleteDriver();
  const invalidate = () => window.location.reload();
  useEffect(() => {
    const base = getBaseUrl() ?? "";
    fetch(`${base}/api/telegram/status`, { credentials: "include" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((data) => data && setTelegramStatus(data))
      .catch(() => setTelegramStatus({ connected: false, error: "تعذر الاتصال بالبوت" }));
  }, []);
  const loadRecentChats = async () => {
    setLoadingChats(true);
    try {
      const base = getBaseUrl() ?? "";
      const response = await fetch(`${base}/api/telegram/recent-chats`, { credentials: "include" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "تعذر جلب المحادثات");
      setRecentChats(data?.data ?? []);
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر جلب المحادثات");
    } finally {
      setLoadingChats(false);
    }
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurantId) return;
    const telegramChatId = form.telegramChatId.trim();
    const commonData = {
      name: form.name,
      phone: form.phone,
      address: form.address || undefined,
      isActive: form.isActive,
    };
    const mutation = editingId
      ? update.mutate({ id: editingId, data: { ...commonData, telegramChatId: telegramChatId || null } }, { onSuccess: invalidate })
      : create.mutate({ id: restaurantId, data: { ...commonData, telegramChatId: telegramChatId || undefined } }, { onSuccess: invalidate });
    void mutation;
  };
  return <div className="space-y-4 sm:space-y-6">
    <h2 className="text-xl sm:text-2xl font-bold">إدارة السائقين</h2>
    <Card><CardHeader><CardTitle>{editingId ? "تعديل سائق" : "إضافة سائق"}</CardTitle></CardHeader><CardContent>
      <form onSubmit={submit} className="grid gap-3 sm:gap-4 md:grid-cols-2">
        <Input placeholder="الاسم واللقب" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
        <Input placeholder="رقم واتساب" type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required />
        <div className="space-y-1">
          <Input placeholder="Telegram Chat ID" value={form.telegramChatId} onChange={e => setForm({ ...form, telegramChatId: e.target.value })} />
          <p className="text-xs text-muted-foreground">افتح البوت وأرسل /start، ثم اجلب المحادثة الأخيرة أو الصق Chat ID يدويًا. الطلب الجديد يختار تلقائيًا سائقًا نشطًا مرتبطًا بـ Telegram أولًا.</p>
        </div>
        <Input placeholder="العنوان" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
        <select className="h-10 rounded-md border bg-background px-3" value={form.restaurantId} onChange={e => setForm({ ...form, restaurantId: e.target.value })} required>
          <option value="">اختر المطعم</option>{restaurants?.data.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} /> نشط</label>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button className="w-full sm:w-auto" type="submit" disabled={create.isPending || update.isPending}>حفظ</Button>
          <Button className="w-full sm:w-auto" type="button" variant="outline" onClick={loadRecentChats} disabled={loadingChats}>{loadingChats ? "جاري الجلب..." : "جلب محادثات Telegram"}</Button>
          {editingId && <Button className="w-full sm:w-auto" type="button" variant="outline" onClick={() => { setEditingId(null); setForm(empty); }}>إلغاء</Button>}
        </div>
        {recentChats.length > 0 && <div className="md:col-span-2 rounded-md border p-3 space-y-2">
          <p className="text-sm font-medium">اختر محادثة لربطها بالسائق:</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {recentChats.map(chat => <Button key={chat.chatId} type="button" variant="outline" className="justify-between" onClick={() => setForm({ ...form, telegramChatId: chat.chatId })}>
              <span>{chat.title}{chat.username ? ` (${chat.username})` : ""}</span><span dir="ltr">{chat.chatId}</span>
            </Button>)}
          </div>
        </div>}
        {telegramStatus && <p className="md:col-span-2 text-xs text-muted-foreground">
          Telegram Bot: {telegramStatus.connected ? <>متصل{telegramStatus.bot?.username ? <> (@{telegramStatus.bot.username}) — <a className="text-primary underline" href={`https://t.me/${telegramStatus.bot.username}`} target="_blank" rel="noreferrer">فتح البوت</a></> : ""}</> : `غير متصل${telegramStatus.error ? ` — ${telegramStatus.error}` : ""}`}
        </p>}
      </form>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>السائقون</CardTitle></CardHeader><CardContent>
       {!restaurantId ? <p className="text-muted-foreground">اختر مطعماً لعرض سائقيه.</p> : <Table><TableHeader><TableRow><TableHead>الاسم</TableHead><TableHead>رقم واتساب</TableHead><TableHead>Telegram</TableHead><TableHead>العنوان</TableHead><TableHead>الحالة</TableHead><TableHead>إجراءات</TableHead></TableRow></TableHeader><TableBody>
         {drivers.map(driver => <TableRow key={driver.id}><TableCell>{driver.name}</TableCell><TableCell>{driver.phone}</TableCell><TableCell><div className="space-y-1"><span className={driver.telegramChatId ? "text-green-600" : "text-muted-foreground"}>{driver.telegramChatId ? "متصل" : "غير متصل"}</span>{driver.telegramChatId && <span className="block text-xs text-muted-foreground" dir="ltr">{driver.telegramChatId}</span>}{telegramStatus?.bot?.username && <a className="block text-xs text-primary underline" href={`https://t.me/${telegramStatus.bot.username}?start=driver_${driver.id}`} target="_blank" rel="noreferrer">رابط الربط</a>}</div></TableCell><TableCell>{driver.address || "—"}</TableCell><TableCell>{driver.isActive ? "نشط" : "معطّل"}</TableCell><TableCell className="flex gap-2">
           <Button size="sm" variant="outline" onClick={() => { setEditingId(driver.id); setForm({ name: driver.name, phone: driver.phone, telegramChatId: driver.telegramChatId || "", address: driver.address || "", restaurantId: String(driver.restaurantId), isActive: driver.isActive }); }}>تعديل</Button>
          <Button size="sm" variant="outline" onClick={() => update.mutate({ id: driver.id, data: { isActive: !driver.isActive } }, { onSuccess: invalidate })}>{driver.isActive ? "تعطيل" : "تفعيل"}</Button>
          <Button size="sm" variant="outline" onClick={() => setSelectedDriverId(driver.id)}>طلباته</Button>
          <Button size="sm" variant="destructive" onClick={() => { if (confirm("حذف السائق نهائياً؟")) remove.mutate({ id: driver.id }, { onSuccess: invalidate }); }}>حذف</Button>
        </TableCell></TableRow>)}
      </TableBody></Table>}
    </CardContent></Card>
     {selectedDriverId && <Card><CardHeader><CardTitle>طلبات السائق</CardTitle></CardHeader><CardContent className="space-y-3"><Button variant="ghost" onClick={() => setSelectedDriverId(null)}>إغلاق</Button><Table><TableHeader><TableRow><TableHead>رقم الطلب</TableHead><TableHead>المطعم</TableHead><TableHead>العميل</TableHead><TableHead>الإجمالي</TableHead><TableHead>الحالة</TableHead><TableHead>التاريخ</TableHead></TableRow></TableHeader><TableBody>{orders?.data.map(o => <TableRow key={o.id}><TableCell>#{o.id}</TableCell><TableCell>{o.restaurantName}</TableCell><TableCell>{o.customerName}</TableCell><TableCell>{formatCurrency(o.totalAmount)}</TableCell><TableCell>{orderStatusLabel(o.status)}</TableCell><TableCell>{new Date(o.createdAt).toLocaleDateString("ar-LY")}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>}
  </div>;
}