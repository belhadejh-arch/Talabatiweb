import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getBaseUrl, useCreateDriver, useDeleteDriver, useListRestaurants, useUpdateDriver } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ImageUpload } from "@/components/admin/image-upload";
import { formatCurrency } from "@/lib/currency";
import { orderStatusLabel } from "@/lib/labels";
import { getAssetUrl } from "@/lib/asset-url";
import { CheckCircle2, Clipboard, IdCard, Pencil, Plus, ShieldCheck, Trash2, UserRound, X } from "lucide-react";

type DriverForm = {
  name: string;
  phone: string;
  whatsappNumber: string;
  address: string;
  birthDate: string;
  profileImageUrl: string;
  vehicleType: string;
  vehiclePlate: string;
  restaurantId: string;
};

type PlatformDriver = DriverForm & {
  id: number;
  serialNumber: string;
  restaurantName: string;
  isActive: boolean;
  status: "ACTIVE" | "INACTIVE";
  totalDeliveries: number;
  acceptedCount: number;
  rejectedCount: number;
  timeoutCount: number;
  createdAt: string;
};

type DriverAttempt = {
  id: number;
  orderId: number;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "TIMEOUT";
  sentAt: string;
  responseAt?: string | null;
  timeoutAt?: string | null;
  customerName: string;
  customerPhone: string;
  totalAmount: number;
  orderStatus: string;
  orderCreatedAt: string;
};

const empty: DriverForm = {
  name: "",
  phone: "",
  whatsappNumber: "",
  address: "",
  birthDate: "",
  profileImageUrl: "",
  vehicleType: "",
  vehiclePlate: "",
  restaurantId: "",
};

export default function AdminDrivers() {
  const [form, setForm] = useState<DriverForm>(empty);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [drivers, setDrivers] = useState<PlatformDriver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<PlatformDriver | null>(null);
  const [history, setHistory] = useState<DriverAttempt[]>([]);
  const [loadingDrivers, setLoadingDrivers] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [activityId, setActivityId] = useState<number | null>(null);
  const { data: restaurants } = useListRestaurants({ limit: 100 });
  const create = useCreateDriver();
  const update = useUpdateDriver();
  const remove = useDeleteDriver();
  const base = getBaseUrl() ?? "";

  const activeCount = useMemo(() => drivers.filter((driver) => driver.status === "ACTIVE").length, [drivers]);
  const deliveryCount = useMemo(() => drivers.reduce((sum, driver) => sum + driver.totalDeliveries, 0), [drivers]);

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

  useEffect(() => { void loadDrivers(); }, [base]);

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

  const updateField = (key: keyof DriverForm, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.phone.trim() || (!editingId && !form.restaurantId)) return;
    const data = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      whatsappNumber: form.whatsappNumber.trim() || undefined,
      address: form.address.trim() || undefined,
      birthDate: form.birthDate || undefined,
      profileImageUrl: form.profileImageUrl || undefined,
      vehicleType: form.vehicleType.trim() || undefined,
      vehiclePlate: form.vehiclePlate.trim() || undefined,
    };
    if (editingId) {
      update.mutate({ id: editingId, data }, {
        onSuccess: () => { setEditingId(null); setForm(empty); void loadDrivers(); },
        onError: (error) => alert(error instanceof Error ? error.message : "تعذر حفظ بيانات السائق"),
      });
    } else {
      create.mutate({ id: Number(form.restaurantId), data }, {
        onSuccess: () => { setForm(empty); void loadDrivers(); },
        onError: (error) => alert(error instanceof Error ? error.message : "تعذر إنشاء حساب السائق"),
      });
    }
  };

  const beginEdit = (driver: PlatformDriver) => {
    setEditingId(driver.id);
    setForm({
      name: driver.name,
      phone: driver.phone,
      whatsappNumber: driver.whatsappNumber || "",
      address: driver.address || "",
      birthDate: driver.birthDate || "",
      profileImageUrl: driver.profileImageUrl || "",
      vehicleType: driver.vehicleType || "",
      vehiclePlate: driver.vehiclePlate || "",
      restaurantId: String(driver.restaurantId),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-primary"><TruckMark /><span className="text-xs font-bold uppercase tracking-[0.2em]">مركز السائقين</span></div>
          <h2 className="text-2xl font-black tracking-tight sm:text-3xl">إدارة حسابات السائقين</h2>
          <p className="mt-1 text-sm text-muted-foreground">أنشئ حسابًا داخليًا لكل سائق وشارك معه رقمه التسلسلي المكوّن من 6 أرقام.</p>
        </div>
        <Button onClick={() => { setEditingId(null); setForm(empty); }} variant="outline"><Plus className="ms-2 h-4 w-4" /> حساب جديد</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard icon={UserRound} label="إجمالي السائقين" value={drivers.length} tone="blue" />
        <StatCard icon={ShieldCheck} label="حسابات نشطة" value={activeCount} tone="emerald" />
        <StatCard icon={CheckCircle2} label="طلبات مسلّمة" value={deliveryCount} tone="amber" />
      </div>

      <Card className="overflow-hidden border-primary/15 shadow-sm">
        <CardHeader className="border-b bg-gradient-to-l from-primary/10 via-background to-background">
          <CardTitle className="flex items-center gap-2 text-lg"><IdCard className="h-5 w-5 text-primary" />{editingId ? "تعديل بيانات السائق" : "إنشاء حساب سائق"}</CardTitle>
          <p className="text-sm text-muted-foreground">يولّد النظام الرقم التسلسلي تلقائيًا بعد الحفظ. لا يحتاج السائق إلى بريد إلكتروني أو كلمة مرور.</p>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
            <Field label="الاسم الكامل *"><Input value={form.name} onChange={(event) => updateField("name", event.target.value)} placeholder="مثال: محمد علي" required /></Field>
            <Field label="رقم الهاتف *"><Input dir="ltr" type="tel" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} placeholder="+218 ..." required /></Field>
            <Field label="WhatsApp — معلومة شخصية فقط"><Input dir="ltr" type="tel" value={form.whatsappNumber} onChange={(event) => updateField("whatsappNumber", event.target.value)} placeholder="+218 ..." /></Field>
            <Field label="المطعم التابع له *">
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60" value={form.restaurantId} onChange={(event) => updateField("restaurantId", event.target.value)} required disabled={!!editingId}>
                <option value="">اختر المطعم</option>
                {restaurants?.data.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}
              </select>
            </Field>
            <Field label="تاريخ الميلاد"><Input type="date" value={form.birthDate} onChange={(event) => updateField("birthDate", event.target.value)} /></Field>
            <Field label="نوع المركبة"><Input value={form.vehicleType} onChange={(event) => updateField("vehicleType", event.target.value)} placeholder="سيارة، دراجة..." /></Field>
            <Field label="رقم اللوحة"><Input value={form.vehiclePlate} onChange={(event) => updateField("vehiclePlate", event.target.value)} /></Field>
            <Field label="العنوان" className="md:col-span-2"><Input value={form.address} onChange={(event) => updateField("address", event.target.value)} placeholder="العنوان الكامل للسائق" /></Field>
            <div className="md:col-span-2"><ImageUpload value={form.profileImageUrl} onChange={(value) => updateField("profileImageUrl", value)} folder="drivers" label="الصورة الشخصية" /></div>
            <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row md:col-span-2">
              <Button type="submit" disabled={create.isPending || update.isPending}>{editingId ? "حفظ التعديلات" : "إنشاء الحساب وتوليد الرقم"}</Button>
              {editingId && <Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm(empty); }}><X className="ms-2 h-4 w-4" /> إلغاء</Button>}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>حسابات السائقين ({drivers.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loadingDrivers ? <p className="py-12 text-center text-muted-foreground">جاري التحميل...</p> : drivers.length === 0 ? <p className="py-12 text-center text-muted-foreground">لا يوجد سائقون بعد</p> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>السائق</TableHead><TableHead>الرقم التسلسلي</TableHead><TableHead>المطعم</TableHead><TableHead>الهاتف</TableHead><TableHead>الحالة</TableHead><TableHead>التسليمات</TableHead><TableHead>إجراءات</TableHead>
                </TableRow></TableHeader>
                <TableBody>{drivers.map((driver) => (
                  <TableRow key={driver.id}>
                    <TableCell><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary">{driver.profileImageUrl ? <img src={getAssetUrl(driver.profileImageUrl)} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-4 w-4" />}</div><div><p className="font-semibold">{driver.name}</p><p className="text-xs text-muted-foreground">{driver.vehicleType || "مركبة غير محددة"}</p></div></div></TableCell>
                    <TableCell><button className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-1.5 font-mono text-base font-bold tracking-[0.2em] text-primary" title="نسخ الرقم" onClick={() => navigator.clipboard.writeText(driver.serialNumber)}>{driver.serialNumber}<Clipboard className="h-3.5 w-3.5" /></button></TableCell>
                    <TableCell>{driver.restaurantName}</TableCell>
                    <TableCell dir="ltr" className="text-right">{driver.phone}</TableCell>
                    <TableCell><Badge variant="outline" className={driver.status === "ACTIVE" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" : "border-slate-500/30 bg-slate-500/10 text-slate-600"}>{driver.status === "ACTIVE" ? "نشط" : "غير نشط"}</Badge></TableCell>
                    <TableCell>{driver.totalDeliveries}</TableCell>
                    <TableCell className="whitespace-nowrap"><Button size="sm" variant="ghost" onClick={() => beginEdit(driver)}><Pencil className="ms-1 h-4 w-4" />تعديل</Button><Button size="sm" variant="ghost" onClick={() => void openHistory(driver)}>السجل</Button><Button size="sm" variant="ghost" onClick={() => void setActivity(driver, driver.status !== "ACTIVE")} disabled={activityId === driver.id}>{activityId === driver.id ? "..." : driver.status === "ACTIVE" ? "إيقاف" : "تفعيل"}</Button><Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={remove.isPending} onClick={() => { if (!confirm("حذف حساب السائق نهائيًا؟")) return; remove.mutate({ id: driver.id }, { onSuccess: () => setDrivers((current) => current.filter((item) => item.id !== driver.id)), onError: (error) => alert(error instanceof Error ? error.message : "تعذر حذف السائق") }); }}><Trash2 className="h-4 w-4" /></Button></TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedDriver && <Card>
        <CardHeader className="flex flex-row items-center justify-between"><CardTitle>سجل طلبات {selectedDriver.name}</CardTitle><Button size="sm" variant="ghost" onClick={() => setSelectedDriver(null)}><X className="h-4 w-4" /></Button></CardHeader>
        <CardContent className="p-0">
          {loadingHistory ? <p className="py-8 text-center text-muted-foreground">جاري التحميل...</p> : history.length === 0 ? <p className="py-8 text-center text-muted-foreground">لا توجد طلبات لهذا السائق</p> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>الطلب</TableHead><TableHead>العميل</TableHead><TableHead>الإجمالي</TableHead><TableHead>الحالة</TableHead><TableHead>تاريخ التعيين</TableHead></TableRow></TableHeader><TableBody>{history.map((attempt) => <TableRow key={attempt.id}><TableCell>#{attempt.orderId}</TableCell><TableCell>{attempt.customerName}<br /><span dir="ltr" className="text-xs text-muted-foreground">{attempt.customerPhone}</span></TableCell><TableCell>{formatCurrency(attempt.totalAmount)}</TableCell><TableCell>{attempt.status === "ACCEPTED" ? "مقبول" : attempt.status === "REJECTED" ? "مرفوض" : attempt.status === "TIMEOUT" ? "انتهت المهلة" : attempt.status === "PENDING" ? "بانتظار الرد" : orderStatusLabel(attempt.orderStatus as never)}</TableCell><TableCell>{new Date(attempt.sentAt).toLocaleString("ar-LY")}</TableCell></TableRow>)}</TableBody></Table></div>}
        </CardContent>
      </Card>}
    </div>
  );
}

function TruckMark() {
  return <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-sm text-primary-foreground">🚚</span>;
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`block space-y-1.5 text-sm font-medium ${className}`}>{label}{children}</label>;
}

function StatCard({ icon: Icon, label, value, tone }: { icon: typeof UserRound; label: string; value: number; tone: "blue" | "emerald" | "amber" }) {
  const colors = { blue: "bg-blue-500/10 text-blue-600", emerald: "bg-emerald-500/10 text-emerald-600", amber: "bg-amber-500/10 text-amber-600" };
  return <Card><CardContent className="flex items-center gap-3 p-4"><div className={`flex h-11 w-11 items-center justify-center rounded-xl ${colors[tone]}`}><Icon className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-black">{value}</p></div></CardContent></Card>;
}