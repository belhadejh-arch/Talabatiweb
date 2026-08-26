import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { getGetRestaurantQueryKey, getListOrdersQueryKey, OrderStatus, SubscriptionPatchPlan, useGetRestaurant, useListOrders, useUpdateOrderStatus, useUpdateRestaurant, useUpdateSubscription } from "@workspace/api-client-react";
import { ArrowLeft, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/currency";
import { orderStatusLabel, subscriptionPlanLabel, subscriptionStatusLabel } from "@/lib/labels";

export default function AdminRestaurantDetail() {
  const { id } = useParams(); const restaurantId = Number(id);
  const { data: restaurant, isLoading, refetch } = useGetRestaurant(restaurantId, { query: { queryKey: getGetRestaurantQueryKey(restaurantId), enabled: !!restaurantId } });
  const orderParams = { restaurantId, limit: 50 };
  const { data: orders } = useListOrders(orderParams, { query: { queryKey: getListOrdersQueryKey(orderParams), enabled: !!restaurantId } });
  const updateRestaurant = useUpdateRestaurant(); const updateSubscription = useUpdateSubscription(); const updateOrder = useUpdateOrderStatus();
  const [form, setForm] = useState({ name: "", phone: "", address: "", logoUrl: "", coverUrl: "", description: "", primaryColor: "", whatsappNumber: "" });
  const [extensionDays, setExtensionDays] = useState("30");
  const [plan, setPlan] = useState<SubscriptionPatchPlan>(SubscriptionPatchPlan.MONTHLY);
  useEffect(() => { if (restaurant) setForm({ name: restaurant.name, phone: restaurant.phone, address: restaurant.address, logoUrl: restaurant.logoUrl || "", coverUrl: restaurant.coverUrl || "", description: restaurant.description || "", primaryColor: restaurant.primaryColor || "", whatsappNumber: restaurant.whatsappNumber || "" }); }, [restaurant]);
  if (isLoading) return <div>جاري التحميل...</div>;
  if (!restaurant) return <div>المطعم غير موجود.</div>;
  const refresh = () => refetch();
  const subscriptionAction = (data: Parameters<typeof updateSubscription.mutate>[0]["data"]) => updateSubscription.mutate({ id: restaurantId, data }, { onSuccess: refresh });
  return <div className="mx-auto max-w-6xl space-y-6">
    <div className="flex items-center justify-between"><div className="flex items-center gap-3"><Link href="/admin/restaurants"><ArrowLeft /></Link><h2 className="text-2xl font-bold">{restaurant.name}</h2></div><Link href={`/${restaurant.slug}`} target="_blank"><Button variant="outline">عرض المتجر</Button></Link></div>
    <Card className="border-primary shadow-md"><CardHeader><CardTitle className="flex items-center gap-2"><Package /> إدارة القائمة</CardTitle></CardHeader><CardContent className="flex flex-wrap items-center justify-between gap-4"><p>أضف الأقسام والمنتجات والإضافات وعدّلها لهذا المطعم.</p><Link href={`/admin/restaurants/${restaurantId}/menu`}><Button size="lg">فتح إدارة القائمة</Button></Link></CardContent></Card>
    <Tabs defaultValue="details"><TabsList><TabsTrigger value="details">بيانات المطعم</TabsTrigger><TabsTrigger value="orders">الطلبات</TabsTrigger><TabsTrigger value="subscription">الاشتراك</TabsTrigger></TabsList>
      <TabsContent value="details"><Card><CardHeader><CardTitle>تعديل بيانات المطعم</CardTitle></CardHeader><CardContent><form className="grid gap-4 md:grid-cols-2" onSubmit={e => { e.preventDefault(); updateRestaurant.mutate({ id: restaurantId, data: { ...form, logoUrl: form.logoUrl || null, coverUrl: form.coverUrl || null, description: form.description || null, primaryColor: form.primaryColor || null, whatsappNumber: form.whatsappNumber || null } }, { onSuccess: refresh }); }}>
        {([["name","الاسم"],["phone","رقم الهاتف"],["address","العنوان"],["logoUrl","رابط الشعار"],["coverUrl","رابط الغلاف"],["primaryColor","اللون الأساسي"],["whatsappNumber","رقم واتساب"]] as const).map(([key,label]) => <label key={key} className={key === "address" ? "md:col-span-2" : ""}>{label}<Input value={form[key]} onChange={e => setForm({...form,[key]:e.target.value})} /></label>)}
        <label className="md:col-span-2">الوصف<Textarea value={form.description} onChange={e => setForm({...form,description:e.target.value})} /></label><Button type="submit" disabled={updateRestaurant.isPending}>حفظ التعديلات</Button>
      </form></CardContent></Card></TabsContent>
      <TabsContent value="orders"><Card><CardHeader><CardTitle>طلبات المطعم</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>العميل</TableHead><TableHead>الإجمالي</TableHead><TableHead>الحالة</TableHead><TableHead>السائق</TableHead><TableHead>التاريخ</TableHead></TableRow></TableHeader><TableBody>{orders?.data.map(order => <TableRow key={order.id}><TableCell>{order.customerName}</TableCell><TableCell>{formatCurrency(order.totalAmount)}</TableCell><TableCell><select value={order.status} className="border rounded p-1" onChange={e => updateOrder.mutate({ id: order.id, data: { status: e.target.value as OrderStatus } }, { onSuccess: refresh })}>{Object.values(OrderStatus).map(s => <option key={s} value={s}>{orderStatusLabel(s)}</option>)}</select></TableCell><TableCell>{order.driverName || "غير معيّن"}</TableCell><TableCell>{new Date(order.createdAt).toLocaleString("ar-LY")}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card></TabsContent>
      <TabsContent value="subscription"><Card><CardHeader><CardTitle>العضوية والاشتراك</CardTitle></CardHeader><CardContent className="space-y-5">{restaurant.subscription ? <div className="grid gap-2 md:grid-cols-3"><p>الخطة: <b>{subscriptionPlanLabel(restaurant.subscription.plan)}</b></p><p>الحالة: <b>{subscriptionStatusLabel(restaurant.subscription.status)}</b></p><p>من {new Date(restaurant.subscription.startDate).toLocaleDateString("ar-LY")} إلى {new Date(restaurant.subscription.expiryDate).toLocaleDateString("ar-LY")}</p></div> : <p>لا يوجد اشتراك.</p>}
        <div className="flex flex-wrap gap-3 items-end"><label>خطة الترقية<select className="block border rounded p-2" value={plan} onChange={e => setPlan(e.target.value as SubscriptionPatchPlan)}>{Object.values(SubscriptionPatchPlan).map(p => <option key={p}>{p}</option>)}</select></label><Button onClick={() => subscriptionAction({ plan })}>ترقية</Button><label>أيام التمديد<Input type="number" min="1" value={extensionDays} onChange={e => setExtensionDays(e.target.value)} /></label><Button variant="outline" onClick={() => subscriptionAction({ extensionDays: Number(extensionDays) })}>تمديد</Button><Button onClick={() => subscriptionAction({ renew: true, plan })}>تجديد</Button><Button variant="destructive" onClick={() => subscriptionAction({ status: "SUSPENDED" })}>إيقاف</Button><Button variant="outline" onClick={() => subscriptionAction({ status: "ACTIVE" })}>إعادة تفعيل</Button></div>
      </CardContent></Card></TabsContent>
    </Tabs>
  </div>;
}