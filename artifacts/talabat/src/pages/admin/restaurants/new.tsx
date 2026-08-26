import { useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCreateRestaurant, RestaurantInputSubscriptionPlan, getListRestaurantsQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Store } from "lucide-react";
import { Link } from "wouter";

const formSchema = z.object({
  name: z.string().min(1, { message: "Name is required" }),
  slug: z.string().min(1, { message: "Slug is required" }).regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens"),
  phone: z.string().min(5, { message: "Phone is required" }),
  address: z.string().min(5, { message: "Address is required" }),
  logoUrl: z.string().url().optional().or(z.literal("")),
  coverUrl: z.string().url().optional().or(z.literal("")),
  description: z.string().optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/i, "Must be a valid hex color").optional().or(z.literal("")),
  whatsappNumber: z.string().optional(),
  subscriptionPlan: z.nativeEnum(RestaurantInputSubscriptionPlan)
});

/** Derives a URL-safe slug from a restaurant name. Arabic/other non-Latin
 * characters are dropped since slugs must stay lowercase Latin + digits +
 * hyphens (URL-safe); falls back to a short random slug when nothing usable
 * remains, e.g. an Arabic-only name. */
function slugify(value: string): string {
  const base = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || `restaurant-${Math.random().toString(36).slice(2, 6)}`;
}

export default function AdminRestaurantNew() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createRestaurant = useCreateRestaurant();
  const slugManuallyEdited = useRef(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      slug: "",
      phone: "",
      address: "",
      logoUrl: "",
      coverUrl: "",
      description: "",
      primaryColor: "#FF6B35",
      whatsappNumber: "",
      subscriptionPlan: RestaurantInputSubscriptionPlan.TRIAL
    }
  });

  const handleNameChange = (name: string) => {
    form.setValue("name", name);
    if (!slugManuallyEdited.current) {
      form.setValue("slug", slugify(name), { shouldValidate: true });
    }
  };

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    createRestaurant.mutate({ data: {
      ...values,
      logoUrl: values.logoUrl || undefined,
      coverUrl: values.coverUrl || undefined,
      primaryColor: values.primaryColor || undefined,
      whatsappNumber: values.whatsappNumber || undefined
    } }, {
      onSuccess: (restaurant) => {
        queryClient.invalidateQueries({ queryKey: getListRestaurantsQueryKey() });
        setLocation(`/admin/restaurants/${restaurant.id}`);
      },
      onError: (err: any) => {
        const message = err?.error || err?.message || "تعذّر إنشاء المطعم. حاول مجدداً.";
        form.setError("slug", { message: typeof message === "string" && message.toLowerCase().includes("slug") ? "هذا الرابط المختصر مستخدم بالفعل، جرّب رابطاً آخر." : message });
      }
    });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/admin/restaurants" className="p-2 rounded-md hover:bg-secondary transition-colors text-muted-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h2 className="text-2xl font-bold tracking-tight">إضافة مطعم</h2>
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader className="border-b border-border bg-card/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Store className="h-6 w-6" />
            </div>
            <div>
              <CardTitle>معلومات المطعم</CardTitle>
              <CardDescription>أدخل تفاصيل المطعم الجديد.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>اسم المطعم *</FormLabel>
                      <FormControl>
                        <Input placeholder="مثال: مطعم الأصالة" {...field} onChange={(e) => handleNameChange(e.target.value)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="slug"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الرابط المختصر *</FormLabel>
                      <FormControl>
                        <div className="flex items-center">
                          <span className="flex items-center h-10 px-3 bg-muted border border-r-0 border-input rounded-l-md text-sm text-muted-foreground">talabat.app/</span>
                          <Input className="rounded-l-none" placeholder="يُنشأ تلقائياً من الاسم، ويمكن تعديله" {...field} onChange={(e) => { slugManuallyEdited.current = true; field.onChange(e); }} />
                        </div>
                      </FormControl>
                      <FormDescription>يتم إنشاؤه تلقائياً من اسم المطعم، ويمكنك تعديله يدوياً قبل الحفظ.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>رقم الهاتف *</FormLabel>
                      <FormControl>
                        <Input type="tel" placeholder="+218 ..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="whatsappNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>رقم واتساب</FormLabel>
                      <FormControl>
                        <Input type="tel" placeholder="+218 ..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>العنوان الكامل *</FormLabel>
                      <FormControl>
                        <Textarea placeholder="الشارع، الحي، المدينة" className="resize-none" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>الوصف</FormLabel>
                      <FormControl>
                        <Textarea placeholder="وصف مختصر عن المطعم" className="resize-none" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="subscriptionPlan"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2 max-w-sm">
                      <FormLabel>خطة الاشتراك الأولية *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="اختر خطة" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={RestaurantInputSubscriptionPlan.TRIAL}>تجربة مجانية لمدة 7 أيام</SelectItem>
                          <SelectItem value={RestaurantInputSubscriptionPlan.MONTHLY}>اشتراك شهري</SelectItem>
                          <SelectItem value={RestaurantInputSubscriptionPlan.YEARLY}>اشتراك سنوي</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end gap-4 border-t border-border pt-6">
                <Link href="/admin/restaurants" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2">
                  إلغاء
                </Link>
                <Button type="submit" disabled={createRestaurant.isPending}>
                  {createRestaurant.isPending ? "جاري الحفظ..." : "حفظ"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}