import { useState, useEffect } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useGetPublicRestaurant, usePlaceOrder, getGetPublicRestaurantQueryKey } from "@workspace/api-client-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useCart } from "@/hooks/use-cart";
import { ArrowRight, MapPin, CheckCircle2, AlertTriangle, Receipt, Truck, Store, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { formatCurrency } from "@/lib/currency";

// Fix leaflet marker icon
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

const checkoutSchema = z.object({
  orderType: z.enum(["DELIVERY", "RESERVATION"]),
  customerName: z.string().min(2, "الاسم مطلوب"),
  customerPhone: z.string().min(5, "رقم الهاتف مطلوب"),
  notes: z.string().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
}).superRefine((values, ctx) => {
  if (values.orderType !== "DELIVERY") return;
  if (values.latitude == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["latitude"], message: "يرجى تحديد الموقع على الخريطة" });
  }
  if (values.longitude == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["longitude"], message: "يرجى تحديد الموقع على الخريطة" });
  }
});

function LocationMarker({ position, setPosition }: { position: L.LatLng | null, setPosition: (pos: L.LatLng) => void }) {
  useMapEvents({
    click(e) {
      setPosition(e.latlng);
    },
  });
  return position === null ? null : <Marker position={position} draggable eventHandlers={{ dragend: event => setPosition(event.target.getLatLng()) }} />;
}

export default function PublicCheckout() {
  const { slug } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const { items, total, clearCart } = useCart();
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderId, setOrderId] = useState<number | null>(null);

  const { data: restaurant } = useGetPublicRestaurant(slug, { query: { queryKey: getGetPublicRestaurantQueryKey(slug), enabled: !!slug } });
  const deliveryFee = restaurant?.deliveryFee ?? 0;
  const placeOrder = usePlaceOrder();

  const form = useForm<z.infer<typeof checkoutSchema>>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      customerName: "",
      customerPhone: "",
      notes: "",
      orderType: "DELIVERY",
    }
  });

  const orderType = form.watch("orderType");
  const [mapPosition, setMapPosition] = useState<L.LatLng | null>(null);
  const [locationStatus, setLocationStatus] = useState<"idle" | "requesting" | "granted" | "denied" | "unavailable">("idle");
  const fallbackPosition: [number, number] = [32.8872, 13.1913];

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus("unavailable");
      return;
    }
    setLocationStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setMapPosition(L.latLng(coords.latitude, coords.longitude));
        setLocationStatus("granted");
      },
      () => setLocationStatus("denied"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    );
  };

  useEffect(() => {
    if (mapPosition) {
      form.setValue("latitude", mapPosition.lat);
      form.setValue("longitude", mapPosition.lng);
      form.clearErrors("latitude");
    }
  }, [mapPosition, form]);

  const selectOrderType = (nextType: "DELIVERY" | "RESERVATION") => {
    form.setValue("orderType", nextType, { shouldValidate: true });
    if (nextType === "RESERVATION") {
      setMapPosition(null);
      setLocationStatus("idle");
      form.setValue("latitude", undefined);
      form.setValue("longitude", undefined);
    }
  };

  useEffect(() => {
    if (items.length === 0 && !orderPlaced) {
      setLocation(`/${slug}`);
    }
  }, [items, orderPlaced, setLocation, slug]);

  const onSubmit = (values: z.infer<typeof checkoutSchema>) => {
    if (!slug) return;
    
    const orderItems = items.map(item => ({
      productId: item.product.id,
      quantity: item.quantity,
      selectedAddonIds: item.selectedAddonIds,
      selectedSizeId: item.selectedSizeId ?? undefined,
    }));

    const orderData = {
      ...values,
      ...(values.orderType === "DELIVERY"
        ? { latitude: values.latitude, longitude: values.longitude }
        : {}),
      items: orderItems,
    };

    placeOrder.mutate({ 
      slug, 
      data: orderData,
    }, {
      onSuccess: (res) => {
        setOrderId(res.orderId);
        setOrderPlaced(true);
        clearCart();
      },
      onError: () => {
        toast.error("حدث خطأ ما، يرجى المحاولة مرة أخرى.");
      }
    });
  };

  if (orderPlaced) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 bg-background text-center relative overflow-hidden">
        {/* Decorative background flare */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-primary/20 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="relative z-10 w-full max-w-sm flex flex-col items-center">
          <div className="h-28 w-28 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-8 mx-auto border-4 border-primary/20">
            <CheckCircle2 className="h-14 w-14" />
          </div>
          <h2 className="text-3xl font-black mb-3 text-foreground tracking-tight">تم تأكيد الطلب بنجاح!</h2>
          <p className="text-muted-foreground mb-8 text-lg px-4 leading-relaxed">
            تم استلام طلبك رقم <span className="font-bold text-foreground">#{orderId?.toString().padStart(6, '0')}</span> وهو قيد التجهيز الآن.
          </p>
          <div className="w-full bg-secondary/50 rounded-2xl p-6 mb-8 border border-border/10">
            <p className="text-sm font-medium text-muted-foreground mb-1">المطعم سيتواصل معك قريباً عبر واتساب</p>
            <p className="text-foreground font-bold">شكراً لطلبك من {restaurant?.name || 'TALABAT'}</p>
          </div>
          <Link href={`/${slug}`}>
             <Button className="w-full h-14 rounded-2xl text-lg font-bold shadow-lg shadow-primary/20 bg-primary text-primary-foreground">
               العودة إلى القائمة
             </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-44 relative">
      {/* Sleek Header */}
      <div className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-border/10">
        <div className="px-4 h-16 flex items-center gap-4">
          <Link href={`/${slug}`} className="h-10 w-10 flex items-center justify-center rounded-full bg-secondary/50 hover:bg-secondary transition-colors text-foreground">
            <ArrowRight className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-bold tracking-tight">إتمام الطلب</h1>
        </div>
      </div>

      <div className="px-4 py-6 space-y-8">
        <Form {...form}>
          <form id="checkout-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

            {/* Order type */}
            <div className="space-y-4">
              <div>
                <h2 className="font-bold text-lg text-foreground">طريقة استلام الطلب</h2>
                <p className="text-sm text-muted-foreground mt-1">اختر الطريقة المناسبة قبل إكمال بياناتك</p>
              </div>
              <div className="grid grid-cols-2 gap-3" dir="rtl">
                <button
                  type="button"
                  onClick={() => selectOrderType("DELIVERY")}
                  className={`min-h-[116px] rounded-2xl border-2 p-4 text-right transition-all ${
                    orderType === "DELIVERY"
                      ? "border-primary bg-primary/10 shadow-lg shadow-primary/10"
                      : "border-border/30 bg-card hover:border-primary/40"
                  }`}
                  aria-pressed={orderType === "DELIVERY"}
                >
                  <Truck className={`h-7 w-7 mb-3 ${orderType === "DELIVERY" ? "text-primary" : "text-muted-foreground"}`} />
                  <span className="block font-black text-base">🚚 توصيل</span>
                  <span className="block text-xs text-muted-foreground mt-1">إلى موقعك الحالي</span>
                </button>
                <button
                  type="button"
                  onClick={() => selectOrderType("RESERVATION")}
                  className={`min-h-[116px] rounded-2xl border-2 p-4 text-right transition-all ${
                    orderType === "RESERVATION"
                      ? "border-primary bg-primary/10 shadow-lg shadow-primary/10"
                      : "border-border/30 bg-card hover:border-primary/40"
                  }`}
                  aria-pressed={orderType === "RESERVATION"}
                >
                  <Store className={`h-7 w-7 mb-3 ${orderType === "RESERVATION" ? "text-primary" : "text-muted-foreground"}`} />
                  <span className="block font-black text-base">🏪 حجز</span>
                  <span className="block text-xs text-muted-foreground mt-1">استلام من المطعم</span>
                </button>
              </div>
            </div>
            
            {/* Contact Details */}
            <div className="space-y-4">
              <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                 <span className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Receipt className="h-4 w-4" /></span>
                 معلومات الاتصال
              </h3>
              <div className="bg-card rounded-3xl p-5 border border-border/10 shadow-sm space-y-5">
                <FormField
                  control={form.control}
                  name="customerName"
                  render={({ field }) => (
                    <FormItem>
                       <FormLabel className="text-muted-foreground">الاسم الكامل</FormLabel>
                      <FormControl>
                         <Input placeholder="الاسم الكامل" className="h-14 rounded-xl bg-secondary/30 border-border/20 px-4 text-base focus-visible:ring-primary/50" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="customerPhone"
                  render={({ field }) => (
                    <FormItem>
                       <FormLabel className="text-muted-foreground">رقم الهاتف</FormLabel>
                      <FormControl>
                         <Input type="tel" placeholder="09X XXX XXXX" className="h-14 rounded-xl bg-secondary/30 border-border/20 px-4 text-base focus-visible:ring-primary/50" dir="ltr" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Location — delivery only */}
            {orderType === "DELIVERY" && <div className="space-y-4">
              <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                <span className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><MapPin className="h-4 w-4" /></span>
                موقع التوصيل
              </h3>
              
              <div className={`bg-card rounded-3xl overflow-hidden border transition-all duration-300 ${form.formState.errors.latitude ? "border-destructive shadow-[0_0_0_1px_rgba(255,0,0,0.2)]" : "border-border/10 shadow-sm"}`}>
                {locationStatus !== "granted" ? (
                  <div className="p-8 text-center space-y-5 bg-secondary/20">
                    <div className="h-16 w-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-2">
                      <MapPin className="h-8 w-8" />
                    </div>
                    <h3 className="text-xl font-bold text-foreground">📍 تفعيل الموقع مطلوب</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed px-4">
                      نحتاج إلى معرفة موقعك الحالي حتى يتمكن السائق من الوصول إليك بدقة. لا يمكن تأكيد الطلب بدون تحديد الموقع.
                    </p>
                    <Button 
                      type="button" 
                      onClick={requestLocation} 
                      disabled={locationStatus === "requesting"} 
                      className="w-full h-14 rounded-xl text-base font-bold bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                      {locationStatus === "requesting" ? "جاري تحديد الموقع..." : "📍 السماح باستخدام موقعي"}
                    </Button>

                    {(locationStatus === "denied" || locationStatus === "unavailable") && (
                      <div className="flex items-start gap-3 text-sm text-destructive bg-destructive/10 rounded-xl p-4 text-right mt-4">
                        <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                        <span className="leading-relaxed font-medium">
                          {locationStatus === "unavailable"
                            ? "متصفحك لا يدعم تحديد الموقع. لا يمكن إتمام الطلب بدون موقع."
                            : "تم رفض إذن الموقع أو تعذّر تحديده. يرجى السماح بالوصول إلى الموقع من إعدادات المتصفح ثم إعادة المحاولة — لا يمكن تأكيد الطلب بدون تحديد موقعك."}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="relative">
                     <div className="h-[220px] sm:h-[250px] w-full bg-secondary/50">
                      <MapContainer center={mapPosition || fallbackPosition} zoom={15} style={{ height: '100%', width: '100%' }} key={mapPosition ? `${mapPosition.lat}-${mapPosition.lng}` : "fallback"}>
                        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution='&copy; <a href="https://carto.com/">CARTO</a>' />
                        <LocationMarker position={mapPosition} setPosition={setMapPosition} />
                      </MapContainer>
                    </div>
                    <div className="p-4 bg-secondary/10 border-t border-border/10 text-xs text-muted-foreground font-medium flex items-center justify-between">
                      <span>تم تحديد موقعك</span>
                      <span className="bg-secondary px-2 py-1 rounded-md text-foreground">اسحب الدبوس للتعديل</span>
                    </div>
                  </div>
                )}
              </div>
              {form.formState.errors.latitude && (
                <p className="text-sm font-bold text-destructive px-2">يرجى تحديد موقع التوصيل على الخريطة</p>
              )}
            </div>}

            {/* Notes */}
            {orderType === "DELIVERY" && <div className="space-y-4">
              <div className="bg-card rounded-3xl p-5 border border-border/10 shadow-sm">
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-muted-foreground">ملاحظات الطلب <span className="text-xs opacity-70">(اختياري)</span></FormLabel>
                      <FormControl>
                        <Textarea placeholder="أي طلبات خاصة؟ مثل بدون بصل، زيادة صوص..." className="resize-none min-h-[120px] rounded-xl bg-secondary/30 border-border/20 p-4 text-base focus-visible:ring-primary/50" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>}

            {/* Reservation order details */}
            {orderType === "RESERVATION" && (
              <div className="space-y-4">
                <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                  <span className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><ShoppingBag className="h-4 w-4" /></span>
                  تفاصيل الحجز
                </h3>
                <div className="bg-card rounded-3xl p-5 border border-border/10 shadow-sm space-y-3">
                  {items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-foreground">{item.product.name}</span>
                      <span className="text-muted-foreground shrink-0">× {item.quantity}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t border-border/20 pt-4 font-black">
                    <span>الإجمالي</span>
                    <span className="text-primary">{formatCurrency(total)}</span>
                  </div>
                </div>
              </div>
            )}
          </form>
        </Form>
      </div>

      {/* Sticky Order Summary Bottom Bar */}
      <div className="fixed bottom-0 inset-x-0 z-40 max-w-[480px] mx-auto">
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/95 to-transparent -top-12 bottom-0 pointer-events-none" />
        
        <div className="relative p-4 sm:p-5 pt-0 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-background/95 backdrop-blur border-t border-border/10 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.2)]">
          <div className="w-12 h-1.5 bg-border/40 rounded-full mx-auto mb-5" />
          
          <div className="space-y-3 mb-5 px-2">
            <div className="flex justify-between text-muted-foreground text-sm font-medium">
               <span>المجموع الفرعي ({items.length} منتجات)</span>
               <span>{formatCurrency(total)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground text-sm font-medium">
               <span>رسوم التوصيل</span>
               <span>{orderType === "DELIVERY" ? formatCurrency(deliveryFee) : "—"}</span>
            </div>
             <div className="flex justify-between gap-3 font-black text-lg sm:text-xl pt-3 border-t border-border/20 text-foreground">
               <span>الإجمالي</span>
                <span className="text-primary">{formatCurrency(total + (orderType === "DELIVERY" ? deliveryFee : 0))}</span>
            </div>
          </div>

          <Button 
            type="submit" 
            form="checkout-form" 
            className="w-full h-16 rounded-2xl text-lg font-bold shadow-xl shadow-primary/20 transition-transform active:scale-[0.98]"
             disabled={placeOrder.isPending || (orderType === "DELIVERY" && locationStatus !== "granted")}
          >
             {placeOrder.isPending ? "جاري الإرسال..." : orderType === "DELIVERY" ? "🚚 تأكيد التوصيل" : "🏪 تأكيد الحجز"}
          </Button>
        </div>
      </div>
    </div>
  );
}