import { useEffect, useState } from "react";
import { getBaseUrl, useCreateDriver, useDeleteDriver, useListRestaurants, useUpdateDriver } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { orderStatusLabel } from "@/lib/labels";
import { formatCurrency } from "@/lib/currency";

type DriverForm = { name: string; phone: string; address: string; restaurantId: string };
type PlatformDriver = {
  id: number;
  restaurantId: number;
  restaurantName: string;
  name: string;
  phone: string;
  telegramChatId?: string | null;
  address?: string | null;
  isActive: boolean;
  status: "ACTIVE" | "INACTIVE";
  acceptedCount: number;
  rejectedCount: number;
  timeoutCount: number;
};
type DriverAttempt = {
  id: number;
  orderId: number;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "TIMEOUT";
  sentAt: string;
  respondedAt?: string | null;
  timeoutAt?: string | null;
  customerName: string;
  customerPhone: string;
  totalAmount: number;
  orderStatus: string;
  orderCreatedAt: string;
};

const empty: DriverForm = { name: "", phone: "", address: "", restaurantId: "" };

export default function AdminDrivers() {
  const [form, setForm] = useState<DriverForm>(empty);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [drivers, setDrivers] = useState<PlatformDriver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<PlatformDriver | null>(null);
  const [history, setHistory] = useState<DriverAttempt[]>([]);
  const [loadingDrivers, setLoadingDrivers] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<{ connected: boolean; bot?: { username: string | null }; error?: string } | null>(null);
  const [recentChats, setRecentChats] = useState<Array<{
    chatId: string;
    title: string;
    username: string | null;
    linkedDriverId: number | null;
    linkedDriverName: string | null;
    linkedDriverCount: number;
  }>>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [activityId, setActivityId] = useState<number | null>(null);
  const { data: restaurants } = useListRestaurants({ limit: 100 });
  const create = useCreateDriver();
  const update = useUpdateDriver();
  const remove = useDeleteDriver();
  const base = getBaseUrl() ?? "";

  const loadDrivers = async () => {
    setLoadingDrivers(true);
    try {
      const response = await fetch(`${base}/api/drivers`, { credentials: "include" });
      if (!response.ok) throw new Error("تعذر تحميل قائمة السائقين");
      setDrivers(await response.json());
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر تحميل قائمة السائقين");
    } finally {
      setLoadingDrivers(false);
    }
  };

  useEffect(() => {
    void loadDrivers();
    void loadRecentChats();
    fetch(`${base}/api/telegram/status`, { credentials: "include" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((data) => data && setTelegramStatus(data))
      .catch(() => setTelegramStatus({ connected: false, error: "تعذر الاتصال بالبوت" }));
  }, [base]);

  const openHistory = async (driver: PlatformDriver) => {
    setSelectedDriver(driver);
    setLoadingHistory(true);
    try {
      const response = await fetch(`${base}/api/drivers/${driver.id}/history`, { credentials: "include" });
      if (!response.ok) throw new Error("تعذر تحميل سجل السائق");
      setHistory(await response.json());
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر تحميل سجل السائق");
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const setActivity = async (driver: PlatformDriver, active: boolean) => {
    setActivityId(driver.id);
    try {
      const response = await fetch(`${base}/api/drivers/${driver.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: active }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "تعذر تحديث نشاط السائق");
      await loadDrivers();
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر تحديث نشاط السائق");
    } finally {
      setActivityId(null);
    }
  };

  const linkTelegramChat = async (chatId: string, driverId: number) => {
    try {
      const response = await fetch(`${base}/api/drivers/${driverId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramChatId: chatId }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "تعذر ربط حساب Telegram");
      await Promise.all([loadDrivers(), loadRecentChats()]);
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر ربط حساب Telegram");
    }
  };

  const loadRecentChats = async () => {
    setLoadingChats(true);
    try {
      const response = await fetch(`${base}/api/telegram/recent-chats`, { credentials: "include" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "تعذر جلب محادثات Telegram");
      setRecentChats(data?.data ?? []);
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر جلب المحادثات");
    } finally {
      setLoadingChats(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const restaurantId = Number(form.restaurantId);
    if (!restaurantId) return;
    const commonData = {
      name: form.name,
      phone: form.phone,
      address: form.address || undefined,
    };
    if (editingId) {
      update.mutate({ id: editingId, data: commonData }, { onSuccess: () => { setEditingId(null); setForm(empty); void loadDrivers(); } });
    } else {
      create.mutate({ id: restaurantId, data: commonData }, { onSuccess: () => { setForm(empty); void loadDrivers(); } });
    }
  };

  const driverLink = (driverId: number) =>
    telegramStatus?.bot?.username ? `https://t.me/${telegramStatus.bot.username}?start=driver_${driverId}` : null;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold">إدارة السائقين</h2>
        <p className="mt-1 text-sm text-muted-foreground">افتح البوت ليظهر Chat ID هنا، ثم اربطه بالسائق وفعّل الحساب من هذه الشاشة.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>{editingId ? "تعديل سائق" : "إضافة سائق"}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3 sm:gap-4 md:grid-cols-2">
            <Input placeholder="الاسم واللقب" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
            <Input placeholder="رقم الهاتف / WhatsApp" type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required />
            <Input placeholder="العنوان" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
            <select className="h-10 rounded-md border bg-background px-3" value={form.restaurantId} onChange={e => setForm({ ...form, restaurantId: e.target.value })} required>
              <option value="">اختر المطعم</option>
              {restaurants?.data.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <div className="md:col-span-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">طريقة تفعيل السائق</p>
              <p>يفتح السائق البوت ويرسل /start، ثم يجلب المدير المحادثات، يختار السائق المناسب ويربط Chat ID، وبعدها يضغط «تفعيل» من الجدول.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button type="submit" disabled={create.isPending || update.isPending}>{editingId ? "حفظ التعديلات" : "إضافة السائق"}</Button>
              {editingId && <Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm(empty); }}>إلغاء</Button>}
            </div>
            <Button type="button" variant="outline" onClick={() => void loadRecentChats()} disabled={loadingChats}>
              {loadingChats ? "جاري الجلب..." : "جلب محادثات Telegram"}
            </Button>
            {recentChats.length > 0 && <div className="md:col-span-2 rounded-md border p-3 space-y-2">
              <p className="text-sm font-medium">حسابات Telegram التي فتحت البوت — اختر السائق لربط الحساب</p>
              <div className="space-y-2">
                {recentChats.map(chat => <div key={chat.chatId} className="grid gap-2 rounded border p-2 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center">
                  <span>{chat.title}{chat.username ? ` (${chat.username})` : ""}<br /><span dir="ltr" className="text-xs text-muted-foreground">Chat ID: {chat.chatId}</span></span>
                  <select
                    className="h-9 rounded-md border bg-background px-2"
                    defaultValue={chat.linkedDriverId ? String(chat.linkedDriverId) : ""}
                    onChange={e => { if (e.target.value) void linkTelegramChat(chat.chatId, Number(e.target.value)); }}
                  >
                    <option value="">اختر السائق</option>
                    {drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name} — {driver.restaurantName}</option>)}
                  </select>
                  <span className={chat.linkedDriverId ? "text-emerald-600" : "text-amber-600"}>{chat.linkedDriverName ? chat.linkedDriverCount > 1 ? `مربوط بأكثر من سائق — الافتراضي: ${chat.linkedDriverName}` : `مربوط: ${chat.linkedDriverName}` : "غير مربوط"}</span>
                </div>)}
              </div>
            </div>}
            {telegramStatus && <p className="md:col-span-2 text-xs text-muted-foreground">
              Telegram Bot: {telegramStatus.connected ? `متصل${telegramStatus.bot?.username ? ` (@${telegramStatus.bot.username})` : ""}` : `غير متصل${telegramStatus.error ? ` — ${telegramStatus.error}` : ""}`}
            </p>}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>كل سائقي المنصة ({drivers.length})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {loadingDrivers ? <p className="py-8 text-center text-muted-foreground">جاري التحميل...</p> : drivers.length === 0 ? <p className="py-8 text-center text-muted-foreground">لا يوجد سائقون</p> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>السائق</TableHead><TableHead>المطعم</TableHead><TableHead>الهاتف / WhatsApp</TableHead><TableHead>Telegram</TableHead><TableHead>النشاط</TableHead><TableHead>النتائج</TableHead><TableHead>إجراءات</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {drivers.map(driver => {
                  const link = driverLink(driver.id);
                  return <TableRow key={driver.id}>
                    <TableCell className="font-medium">{driver.name}</TableCell>
                    <TableCell>{driver.restaurantName}</TableCell>
                    <TableCell dir="ltr" className="text-right">{driver.phone}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <span className={driver.telegramChatId ? "text-emerald-600" : "text-muted-foreground"}>{driver.telegramChatId ? `متصل (${driver.telegramChatId})` : "غير مربوط"}</span>
                        {link && <a className="block text-xs text-primary underline" href={link} target="_blank" rel="noreferrer">رابط الربط</a>}
                      </div>
                    </TableCell>
                    <TableCell><span className={driver.status === "ACTIVE" ? "text-emerald-600" : "text-red-600"}>{driver.status === "ACTIVE" ? "🟢 ACTIVE" : "🔴 INACTIVE"}</span></TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      <span className="text-emerald-600">مقبول: {driver.acceptedCount}</span><br />
                      <span className="text-red-600">مرفوض: {driver.rejectedCount}</span><br />
                      <span className="text-amber-600">مهلة: {driver.timeoutCount}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Button size="sm" variant="outline" onClick={() => { setEditingId(driver.id); setForm({ name: driver.name, phone: driver.phone, address: driver.address || "", restaurantId: String(driver.restaurantId) }); }}>تعديل</Button>
                      <Button size="sm" variant="outline" className="mr-1" onClick={() => void openHistory(driver)}>السجل</Button>
                      <Button size="sm" className="mr-1" variant={driver.status === "ACTIVE" ? "secondary" : "default"} disabled={activityId === driver.id || (!driver.telegramChatId && driver.status === "INACTIVE")} onClick={() => void setActivity(driver, driver.status !== "ACTIVE")}>{activityId === driver.id ? "..." : driver.status === "ACTIVE" ? "إيقاف" : "تفعيل"}</Button>
                      <Button size="sm" variant="destructive" className="mr-1" disabled={remove.isPending} onClick={() => {
                        if (!confirm("حذف السائق نهائياً؟")) return;
                        remove.mutate({ id: driver.id }, {
                          onSuccess: () => {
                            setDrivers(current => current.filter(item => item.id !== driver.id));
                            if (selectedDriver?.id === driver.id) setSelectedDriver(null);
                          },
                          onError: (error) => alert(error instanceof Error ? error.message : "تعذر حذف السائق"),
                        });
                      }}>حذف</Button>
                    </TableCell>
                  </TableRow>;
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selectedDriver && <Card>
        <CardHeader><CardTitle>كل طلبات السائق {selectedDriver.name}</CardTitle></CardHeader>
        <CardContent>
          <Button variant="ghost" onClick={() => setSelectedDriver(null)}>إغلاق</Button>
          {loadingHistory ? <p className="py-8 text-center text-muted-foreground">جاري تحميل الطلبات...</p> : history.length === 0 ? <p className="py-8 text-center text-muted-foreground">لا توجد طلبات لهذا السائق</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>الطلب</TableHead><TableHead>العميل</TableHead><TableHead>الإجمالي</TableHead><TableHead>الحالة</TableHead><TableHead>وقت الإرسال</TableHead><TableHead>وقت الرد</TableHead><TableHead>المهلة</TableHead></TableRow></TableHeader>
              <TableBody>{history.map(attempt => <TableRow key={attempt.id}>
                <TableCell>#{attempt.orderId}</TableCell>
                <TableCell>{attempt.customerName}<br /><span dir="ltr" className="text-xs text-muted-foreground">{attempt.customerPhone}</span></TableCell>
                <TableCell>{formatCurrency(attempt.totalAmount)}</TableCell>
                <TableCell>{attempt.status === "ACCEPTED" ? "مقبول" : attempt.status === "REJECTED" ? "مرفوض" : attempt.status === "TIMEOUT" ? "انتهت المهلة" : attempt.status === "PENDING" ? "بانتظار الرد" : orderStatusLabel(attempt.orderStatus as never)}</TableCell>
                <TableCell>{new Date(attempt.sentAt).toLocaleString("ar-LY")}</TableCell>
                <TableCell>{attempt.respondedAt ? new Date(attempt.respondedAt).toLocaleString("ar-LY") : "—"}</TableCell>
                <TableCell>{attempt.timeoutAt ? new Date(attempt.timeoutAt).toLocaleString("ar-LY") : "—"}</TableCell>
              </TableRow>)}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>}
    </div>
  );
}