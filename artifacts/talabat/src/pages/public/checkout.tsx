import { useState, useEffect } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useGetPublicRestaurant, usePlaceOrder, getGetPublicRestaurantQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useCart } from "@/hooks/use-cart";
import { ArrowLeft, MapPin, Receipt, CheckCircle2 } from "lucide-react";
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
  customerName: z.string().min(2, "Name is required"),
  customerPhone: z.string().min(5, "Phone number is required"),
  notes: z.string().optional(),
  latitude: z.number({ required_error: "Please select a location on the map" }),
  longitude: z.number({ required_error: "Please select a location on the map" }),
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
  const placeOrder = usePlaceOrder();

  const form = useForm<z.infer<typeof checkoutSchema>>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      customerName: "",
      customerPhone: "",
      notes: "",
    }
  });

  const [mapPosition, setMapPosition] = useState<L.LatLng | null>(null);
  const fallbackPosition: [number, number] = [32.8872, 13.1913];
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setMapPosition(L.latLng(coords.latitude, coords.longitude)),
      () => undefined,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    );
  }, []);

  useEffect(() => {
    if (mapPosition) {
      form.setValue("latitude", mapPosition.lat);
      form.setValue("longitude", mapPosition.lng);
      form.clearErrors("latitude");
    }
  }, [mapPosition, form]);

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
      selectedAddonIds: item.selectedAddonIds
    }));

    placeOrder.mutate({ 
      slug, 
      data: {
        ...values,
        items: orderItems
      } 
    }, {
      onSuccess: (res) => {
        setOrderId(res.orderId);
        setOrderPlaced(true);
        clearCart();
        toast.success("تم تأكيد الطلب بنجاح!");
      },
      onError: () => {
        toast.error("حدث خطأ ما، يرجى المحاولة مرة أخرى.");
      }
    });
  };

  if (orderPlaced) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-secondary/30">
        <Card className="w-full max-w-md border-none shadow-xl text-center p-8 hover-elevate">
          <CheckCircle2 className="h-20 w-20 text-emerald-500 mx-auto mb-6" />
           <h2 className="text-3xl font-bold mb-2">تم تأكيد الطلب بنجاح!</h2>
           <p className="text-muted-foreground mb-6">تم استلام طلبك رقم #{orderId?.toString().padStart(6, '0')} وهو قيد المراجعة.</p>
          <Link href={`/${slug}`}>
             <Button className="w-full h-12 text-base">العودة إلى القائمة</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary/30 pb-20">
      <div className="bg-background border-b sticky top-16 z-40">
        <div className="container mx-auto px-4 h-16 flex items-center gap-4">
          <Link href={`/${slug}`} className="p-2 -ml-2 rounded-md hover:bg-secondary transition-colors text-muted-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
           <h1 className="text-xl font-bold tracking-tight">إتمام الطلب</h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 flex flex-col lg:flex-row gap-8">
        <div className="flex-1 space-y-6">
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                 <Receipt className="h-5 w-5 text-primary" /> معلومات الاتصال
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form id="checkout-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="customerName"
                      render={({ field }) => (
                        <FormItem>
                           <FormLabel>الاسم الكامل</FormLabel>
                          <FormControl>
                             <Input placeholder="الاسم الكامل" className="h-12" {...field} />
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
                           <FormLabel>رقم الهاتف</FormLabel>
                          <FormControl>
                             <Input type="tel" placeholder="+218 ..." className="h-12" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="space-y-4">
                    <Label className={form.formState.errors.latitude ? "text-destructive" : ""}>
                       موقع التوصيل *
                    </Label>
                    <div className="h-[300px] w-full rounded-xl overflow-hidden border border-border">
                       <MapContainer center={mapPosition || fallbackPosition} zoom={13} style={{ height: '100%', width: '100%' }} key={mapPosition ? `${mapPosition.lat}-${mapPosition.lng}` : "fallback"}>
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        <LocationMarker position={mapPosition} setPosition={setMapPosition} />
                      </MapContainer>
                    </div>
                    {form.formState.errors.latitude && (
                      <p className="text-sm font-medium text-destructive">{form.formState.errors.latitude.message}</p>
                    )}
                  </div>

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                           <FormLabel>ملاحظات الطلب (اختياري)</FormLabel>
                        <FormControl>
                             <Textarea placeholder="أي طلبات خاصة؟" className="resize-none min-h-[100px]" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        <div className="w-full lg:w-96 shrink-0 space-y-6">
          <Card className="border-none shadow-sm sticky top-40">
            <CardHeader className="bg-muted/50 pb-4 border-b">
               <CardTitle>ملخص الطلب</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="p-4 space-y-4 max-h-[40vh] overflow-y-auto">
                {items.map((item) => (
                  <div key={item.id} className="flex justify-between gap-4 text-sm">
                    <div className="flex gap-2">
                      <span className="font-semibold">{item.quantity}x</span>
                      <div>
                        <p className="font-medium text-foreground">{item.product.name}</p>
                         {item.selectedAddonIds.length > 0 && <p className="text-xs text-muted-foreground mt-0.5">إضافات مخصصة</p>}
                      </div>
                    </div>
                     <span className="font-medium whitespace-nowrap">{formatCurrency(item.price * item.quantity)}</span>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t bg-card/50 space-y-3">
                <div className="flex justify-between text-sm">
                   <span className="text-muted-foreground">المجموع الفرعي</span>
                   <span>{formatCurrency(total)}</span>
                </div>
                <div className="flex justify-between text-sm">
                   <span className="text-muted-foreground">التوصيل</span>
                   <span>{formatCurrency(0)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg pt-2 border-t">
                   <span>الإجمالي</span>
                   <span className="text-primary">{formatCurrency(total)}</span>
                </div>
                
                <Button 
                  type="submit" 
                  form="checkout-form" 
                  className="w-full h-14 mt-4 text-base font-semibold shadow-md"
                  disabled={placeOrder.isPending}
                >
                   {placeOrder.isPending ? "جاري الإرسال..." : "تأكيد الطلب"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}