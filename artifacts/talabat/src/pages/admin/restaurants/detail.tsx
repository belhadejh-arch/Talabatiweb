import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import {
  getGetRestaurantQueryKey,
  getListDriversQueryKey,
  getListOrdersQueryKey,
  OrderStatus,
  RestaurantStatus,
  useAssignDriver,
  useGetRestaurant,
  useListDrivers,
  useListOrders,
  useUpdateOrderStatus,
  useUpdateRestaurant,
  useUpdateRestaurantStatus,
} from "@workspace/api-client-react";
import { ArrowLeft, Copy, ExternalLink, Package, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/currency";
import { orderStatusLabel, restaurantStatusLabel, subscriptionPlanLabel, subscriptionStatusLabel } from "@/lib/labels";
import { toast } from "@/hooks/use-toast";
import { MembershipDialog } from "./membership-dialog";
import { ImageUpload } from "@/components/admin/image-upload";

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  INACTIVE: "bg-slate-500/10 text-slate-500 border-slate-500/20",
  SUSPENDED: "bg-red-500/10 text-red-500 border-red-500/20",
};

export default function AdminRestaurantDetail() {
  const { id } = useParams();
  const restaurantId = Number(id);

  const { data: restaurant, isLoading, refetch } = useGetRestaurant(restaurantId, {
    query: { queryKey: getGetRestaurantQueryKey(restaurantId), enabled: !!restaurantId },
  });
  const orderParams = { restaurantId, limit: 50 };
  const { data: orders, refetch: refetchOrders } = useListOrders(orderParams, {
    query: { queryKey: getListOrdersQueryKey(orderParams), enabled: !!restaurantId },
  });
  const { data: drivers = [] } = useListDrivers(restaurantId, {
    query: { queryKey: getListDriversQueryKey(restaurantId), enabled: !!restaurantId },
  });

  const updateRestaurant = useUpdateRestaurant();
  const updateStatus = useUpdateRestaurantStatus();
  const updateOrder = useUpdateOrderStatus();
  const assignDriver = useAssignDriver();

  const [form, setForm] = useState({
    name: "",
    phone: "",
    address: "",
    logoUrl: "",
    coverUrl: "",
    description: "",
    primaryColor: "",
    whatsappNumber: "",
    deliveryFee: "0",
  });

  useEffect(() => {
    if (restaurant) {
      setForm({
        name: restaurant.name,
        phone: restaurant.phone,
        address: restaurant.address,
        logoUrl: restaurant.logoUrl || "",
        coverUrl: restaurant.coverUrl || "",
        description: restaurant.description || "",
        primaryColor: restaurant.primaryColor || "",
        whatsappNumber: restaurant.whatsappNumber || "",
        deliveryFee: String(restaurant.deliveryFee ?? 0),
      });
    }
  }, [restaurant]);

  if (isLoading) return <div>جاري التحميل...</div>;
  if (!restaurant) return <div>المطعم غير موجود.</div>;

  const refresh = () => refetch();
  const storeUrl = `${window.location.origin}/${restaurant.slug}`;

  const copyLink = () => {
    navigator.clipboard.writeText(storeUrl);
    toast({ title: "تم نسخ الرابط" });
  };

  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: restaurant.name, url: storeUrl });
      } catch {
        /* user cancelled */
      }
    } else {
      copyLink();
    }
  };

  const changeStatus = (status: RestaurantStatus) => {
    if (status === restaurant.status) return;
    const confirmed = window.confirm(
      `سيتم تغيير حالة مطعم "${restaurant.name}" إلى "${restaurantStatusLabel(status)}". هل أنت متأكد؟`,
    );
    if (!confirmed) return;
    updateStatus.mutate(
      { id: restaurantId, data: { status } },
      {
        onSuccess: () => {
          toast({ title: `تم تحديث حالة مطعم ${restaurant.name}` });
          refresh();
        },
      },
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
      <div className="flex flex-col items-stretch md:flex-row md:items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link href="/admin/restaurants">
            <ArrowLeft />
          </Link>
          <h2 className="min-w-0 truncate text-lg sm:text-2xl font-bold">{restaurant.name}</h2>
          <Badge variant="outline" className={STATUS_COLOR[restaurant.status] ?? ""}>
            {restaurantStatusLabel(restaurant.status)}
          </Badge>
        </div>
        <div className="grid grid-cols-3 md:flex items-center gap-2">
          {Object.values(RestaurantStatus).map((status) => (
            <Button
              key={status}
              size="sm"
              variant={restaurant.status === status ? "default" : "outline"}
              onClick={() => changeStatus(status)}
              disabled={updateStatus.isPending}
              data-testid={`button-status-${status}`}
            >
              {restaurantStatusLabel(status)}
            </Button>
          ))}
        </div>
      </div>

      <Card className="border-primary shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package /> 🍔 إدارة قائمة الطعام
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">أضف الأقسام والمنتجات (مع الصور والأحجام والإضافات)، وتابع طلبات هذا المطعم من مكان واحد.</p>
          <Link href={`/admin/restaurants/${restaurantId}/menu`}>
              <Button size="lg" className="w-full sm:w-auto" data-testid="button-manage-menu">➕ إضافة قائمة الطعام</Button>
          </Link>
          <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-2">
            <p className="text-sm font-medium">رابط متجر المطعم العام (يفتح قائمة هذا المطعم فقط)</p>
            <div className="flex items-stretch gap-2 flex-wrap">
              <code className="text-sm break-all bg-background border border-border rounded-md px-3 py-2 flex-1 min-w-0 w-full sm:min-w-[200px]" data-testid="text-store-url">
                {storeUrl}
              </code>
              <Button variant="outline" className="w-full sm:w-auto" onClick={copyLink} data-testid="button-copy-link">
                <Copy className="ml-2 h-4 w-4" /> 🔗 نسخ الرابط
              </Button>
              <Button variant="outline" className="w-full sm:w-auto" onClick={shareLink} data-testid="button-share-link">
                <Share2 className="ml-2 h-4 w-4" /> 📤 مشاركة الرابط
              </Button>
              <a href={storeUrl} target="_blank" rel="noreferrer">
                <Button variant="outline" className="w-full sm:w-auto" data-testid="button-open-link">
                  <ExternalLink className="ml-2 h-4 w-4" /> 👁️ معاينة قائمة الطلبات
                </Button>
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="details">
        <TabsList className="grid w-full grid-cols-3 h-auto">
          <TabsTrigger className="px-2 py-2.5 text-xs sm:text-sm" value="details">بيانات المطعم</TabsTrigger>
          <TabsTrigger className="px-2 py-2.5 text-xs sm:text-sm" value="orders">الطلبات</TabsTrigger>
          <TabsTrigger className="px-2 py-2.5 text-xs sm:text-sm" value="subscription">العضوية</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <Card>
            <CardHeader>
              <CardTitle>تعديل بيانات المطعم</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-4 md:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  updateRestaurant.mutate(
                    {
                      id: restaurantId,
                      data: {
                        name: form.name,
                        phone: form.phone,
                        address: form.address,
                        logoUrl: form.logoUrl || null,
                        coverUrl: form.coverUrl || null,
                        description: form.description || null,
                        primaryColor: form.primaryColor || null,
                        whatsappNumber: form.whatsappNumber || null,
                        deliveryFee: Number(form.deliveryFee) || 0,
                      },
                    },
                    { onSuccess: () => { toast({ title: "تم حفظ بيانات المطعم" }); refresh(); } },
                  );
                }}
              >
                {([
                  ["name", "الاسم"],
                  ["phone", "رقم الهاتف"],
                  ["address", "العنوان"],
                  ["primaryColor", "اللون الأساسي"],
                  ["whatsappNumber", "رقم واتساب"],
                ] as const).map(([key, label]) => (
                  <label key={key} className={key === "address" ? "md:col-span-2" : ""}>
                    {label}
                    <Input
                      value={form[key]}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      data-testid={`input-${key}`}
                    />
                  </label>
                ))}
                <div>
                  <ImageUpload
                    value={form.logoUrl}
                    onChange={(value) => setForm({ ...form, logoUrl: value })}
                    folder="restaurants"
                    label="شعار المطعم"
                  />
                </div>
                <div>
                  <ImageUpload
                    value={form.coverUrl}
                    onChange={(value) => setForm({ ...form, coverUrl: value })}
                    folder="restaurants"
                    label="غلاف المطعم"
                  />
                </div>
                <label>
                  رسوم التوصيل (د.ل)
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.deliveryFee}
                    onChange={(e) => setForm({ ...form, deliveryFee: e.target.value })}
                    data-testid="input-deliveryFee"
                  />
                </label>
                <label className="md:col-span-2">
                  الوصف
                  <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </label>
                  <Button type="submit" className="w-full sm:w-auto" disabled={updateRestaurant.isPending} data-testid="button-save-restaurant">
                  حفظ التعديلات
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <CardTitle>طلبات المطعم</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>العميل</TableHead>
                    <TableHead>الإجمالي</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>السائق</TableHead>
                    <TableHead>التاريخ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders?.data.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>{order.customerName}</TableCell>
                      <TableCell>{formatCurrency(order.totalAmount)}</TableCell>
                      <TableCell>
                        <select
                          value={order.status}
                          className="border rounded p-1"
                          onChange={(e) =>
                            updateOrder.mutate(
                              { id: order.id, data: { status: e.target.value as OrderStatus } },
                              { onSuccess: refresh },
                            )
                          }
                        >
                          {Object.values(OrderStatus).map((s) => (
                            <option key={s} value={s}>
                              {orderStatusLabel(s)}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell>
                        {drivers.length > 1 ? (
                          <select
                            value={order.driverId ?? ""}
                            className="border rounded p-1"
                            onChange={(e) => {
                              const driverId = Number(e.target.value);
                              if (driverId) assignDriver.mutate({ id: order.id, data: { driverId } }, { onSuccess: () => refetchOrders() });
                            }}
                          >
                            <option value="">غير معيّن</option>
                            {drivers.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          order.driverName || "غير معيّن"
                        )}
                      </TableCell>
                      <TableCell>{new Date(order.createdAt).toLocaleString("ar-LY")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subscription">
          <Card>
            <CardHeader>
              <CardTitle>العضوية والاشتراك — {restaurant.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {restaurant.subscription ? (
                <div className="grid gap-2 md:grid-cols-3">
                  <p>
                    الخطة: <b>{subscriptionPlanLabel(restaurant.subscription.plan)}</b>
                  </p>
                  <p>
                    الحالة: <b>{subscriptionStatusLabel(restaurant.subscription.status)}</b>
                  </p>
                  <p>
                    من {new Date(restaurant.subscription.startDate).toLocaleDateString("ar-LY")} إلى{" "}
                    {new Date(restaurant.subscription.expiryDate).toLocaleDateString("ar-LY")}
                  </p>
                </div>
              ) : (
                <p>لا يوجد اشتراك.</p>
              )}
              <MembershipDialog restaurant={restaurant as any} onSuccess={refresh} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
