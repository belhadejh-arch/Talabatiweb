import { useState } from "react";
import { getListDriversQueryKey, getListOrdersQueryKey, useCreateDriver, useDeleteDriver, useListDrivers, useListOrders, useListRestaurants, useUpdateDriver } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/currency";
import { orderStatusLabel } from "@/lib/labels";

type DriverForm = { name: string; phone: string; address: string; restaurantId: string; isActive: boolean };
const empty: DriverForm = { name: "", phone: "", address: "", restaurantId: "", isActive: true };

export default function AdminDrivers() {
  const [form, setForm] = useState<DriverForm>(empty);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null);
  const { data: restaurants } = useListRestaurants({ limit: 100 });
  const restaurantId = Number(form.restaurantId);
  const { data: drivers = [] } = useListDrivers(restaurantId, { query: { queryKey: getListDriversQueryKey(restaurantId), enabled: !!restaurantId } });
  const driverOrderParams = { driverId: selectedDriverId ?? undefined, limit: 50 };
  const { data: orders } = useListOrders(driverOrderParams, { query: { queryKey: getListOrdersQueryKey(driverOrderParams), enabled: !!selectedDriverId } });
  const create = useCreateDriver();
  const update = useUpdateDriver();
  const remove = useDeleteDriver();
  const invalidate = () => window.location.reload();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurantId) return;
    const data = { name: form.name, phone: form.phone, address: form.address || undefined, isActive: form.isActive };
    const mutation = editingId ? update.mutate({ id: editingId, data }, { onSuccess: invalidate }) : create.mutate({ id: restaurantId, data }, { onSuccess: invalidate });
    void mutation;
  };
  return <div className="space-y-4 sm:space-y-6">
    <h2 className="text-xl sm:text-2xl font-bold">إدارة السائقين</h2>
    <Card><CardHeader><CardTitle>{editingId ? "تعديل سائق" : "إضافة سائق"}</CardTitle></CardHeader><CardContent>
      <form onSubmit={submit} className="grid gap-3 sm:gap-4 md:grid-cols-2">
        <Input placeholder="الاسم" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
        <Input placeholder="رقم واتساب" type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required />
        <Input placeholder="العنوان" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
        <select className="h-10 rounded-md border bg-background px-3" value={form.restaurantId} onChange={e => setForm({ ...form, restaurantId: e.target.value })} required>
          <option value="">اختر المطعم</option>{restaurants?.data.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} /> نشط</label>
        <div className="flex flex-col sm:flex-row gap-2"><Button className="w-full sm:w-auto" type="submit" disabled={create.isPending || update.isPending}>حفظ</Button>{editingId && <Button className="w-full sm:w-auto" type="button" variant="outline" onClick={() => { setEditingId(null); setForm(empty); }}>إلغاء</Button>}</div>
      </form>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>السائقون</CardTitle></CardHeader><CardContent>
      {!restaurantId ? <p className="text-muted-foreground">اختر مطعماً لعرض سائقيه.</p> : <Table><TableHeader><TableRow><TableHead>الاسم</TableHead><TableHead>رقم واتساب</TableHead><TableHead>العنوان</TableHead><TableHead>الحالة</TableHead><TableHead>إجراءات</TableHead></TableRow></TableHeader><TableBody>
        {drivers.map(driver => <TableRow key={driver.id}><TableCell>{driver.name}</TableCell><TableCell>{driver.phone}</TableCell><TableCell>{driver.address || "—"}</TableCell><TableCell>{driver.isActive ? "نشط" : "معطّل"}</TableCell><TableCell className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { setEditingId(driver.id); setForm({ name: driver.name, phone: driver.phone, address: driver.address || "", restaurantId: String(driver.restaurantId), isActive: driver.isActive }); }}>تعديل</Button>
          <Button size="sm" variant="outline" onClick={() => update.mutate({ id: driver.id, data: { isActive: !driver.isActive } }, { onSuccess: invalidate })}>{driver.isActive ? "تعطيل" : "تفعيل"}</Button>
          <Button size="sm" variant="outline" onClick={() => setSelectedDriverId(driver.id)}>طلباته</Button>
          <Button size="sm" variant="destructive" onClick={() => { if (confirm("حذف السائق نهائياً؟")) remove.mutate({ id: driver.id }, { onSuccess: invalidate }); }}>حذف</Button>
        </TableCell></TableRow>)}
      </TableBody></Table>}
    </CardContent></Card>
     {selectedDriverId && <Card><CardHeader><CardTitle>طلبات السائق</CardTitle></CardHeader><CardContent className="space-y-3"><Button variant="ghost" onClick={() => setSelectedDriverId(null)}>إغلاق</Button><Table><TableHeader><TableRow><TableHead>رقم الطلب</TableHead><TableHead>المطعم</TableHead><TableHead>العميل</TableHead><TableHead>الإجمالي</TableHead><TableHead>الحالة</TableHead><TableHead>التاريخ</TableHead></TableRow></TableHeader><TableBody>{orders?.data.map(o => <TableRow key={o.id}><TableCell>#{o.id}</TableCell><TableCell>{o.restaurantName}</TableCell><TableCell>{o.customerName}</TableCell><TableCell>{formatCurrency(o.totalAmount)}</TableCell><TableCell>{orderStatusLabel(o.status)}</TableCell><TableCell>{new Date(o.createdAt).toLocaleDateString("ar-LY")}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>}
  </div>;
}