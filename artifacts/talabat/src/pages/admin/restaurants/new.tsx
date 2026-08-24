import { useTranslation } from "react-i18next";
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

export default function AdminRestaurantNew() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createRestaurant = useCreateRestaurant();

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
      }
    });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/admin/restaurants" className="p-2 rounded-md hover:bg-secondary transition-colors text-muted-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h2 className="text-2xl font-bold tracking-tight">{t("admin.restaurants.add")}</h2>
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader className="border-b border-border bg-card/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Store className="h-6 w-6" />
            </div>
            <div>
              <CardTitle>Restaurant Information</CardTitle>
              <CardDescription>Enter the details for the new restaurant.</CardDescription>
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
                      <FormLabel>Restaurant Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Al Baik" {...field} />
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
                      <FormLabel>URL Slug *</FormLabel>
                      <FormControl>
                        <div className="flex items-center">
                          <span className="flex items-center h-10 px-3 bg-muted border border-r-0 border-input rounded-l-md text-sm text-muted-foreground">talabat.app/</span>
                          <Input className="rounded-l-none" placeholder="al-baik" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number *</FormLabel>
                      <FormControl>
                        <Input type="tel" placeholder="+966 50 000 0000" {...field} />
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
                      <FormLabel>WhatsApp Number</FormLabel>
                      <FormControl>
                        <Input type="tel" placeholder="+966 50 000 0000" {...field} />
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
                      <FormLabel>Full Address *</FormLabel>
                      <FormControl>
                        <Textarea placeholder="123 Main St, City, Country" className="resize-none" {...field} />
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
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Brief description of the restaurant" className="resize-none" {...field} />
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
                      <FormLabel>Initial Subscription Plan *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a plan" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={RestaurantInputSubscriptionPlan.TRIAL}>14-Day Trial</SelectItem>
                          <SelectItem value={RestaurantInputSubscriptionPlan.MONTHLY}>Monthly Pro</SelectItem>
                          <SelectItem value={RestaurantInputSubscriptionPlan.YEARLY}>Yearly Pro</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end gap-4 border-t border-border pt-6">
                <Link href="/admin/restaurants" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2">
                  {t("common.cancel")}
                </Link>
                <Button type="submit" disabled={createRestaurant.isPending}>
                  {createRestaurant.isPending ? t("common.loading") : t("common.save")}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}