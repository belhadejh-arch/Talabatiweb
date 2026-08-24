import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "wouter";
import { useGetRestaurant, useUpdateRestaurantStatus, getListRestaurantsQueryKey, getGetRestaurantQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Store, Settings, Package, Truck, CreditCard, ExternalLink, Play, Pause } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AdminRestaurantDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const restaurantId = Number(id);
  const queryClient = useQueryClient();

  const { data: restaurant, isLoading } = useGetRestaurant(restaurantId, {
    query: { queryKey: getGetRestaurantQueryKey(restaurantId), enabled: !!restaurantId }
  });

  const updateStatus = useUpdateRestaurantStatus();

  const handleStatusToggle = () => {
    if (!restaurant) return;
    const newStatus = restaurant.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    updateStatus.mutate({ id: restaurantId, data: { status: newStatus as any } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetRestaurantQueryKey(restaurantId) });
        queryClient.invalidateQueries({ queryKey: getListRestaurantsQueryKey() });
      }
    });
  };

  if (isLoading) return <div>{t("common.loading")}</div>;
  if (!restaurant) return <div>Restaurant not found</div>;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href="/admin/restaurants" className="p-2 rounded-md hover:bg-secondary transition-colors text-muted-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-lg bg-secondary flex items-center justify-center overflow-hidden shrink-0 border border-border">
              {restaurant.logoUrl ? (
                <img src={restaurant.logoUrl} alt={restaurant.name} className="h-full w-full object-cover" />
              ) : (
                <Store className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">{restaurant.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={restaurant.status === 'ACTIVE' ? 'default' : 'secondary'} className={restaurant.status === 'ACTIVE' ? 'bg-emerald-500 hover:bg-emerald-600' : ''}>
                  {restaurant.status}
                </Badge>
                <span className="text-sm text-muted-foreground">/{restaurant.slug}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Link href={`/${restaurant.slug}`} target="_blank" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2">
            <ExternalLink className="mr-2 h-4 w-4" />
            View Store
          </Link>
          <Button 
            variant={restaurant.status === 'ACTIVE' ? 'destructive' : 'default'}
            onClick={handleStatusToggle}
            disabled={updateStatus.isPending || restaurant.status === 'SUSPENDED'}
          >
            {restaurant.status === 'ACTIVE' ? (
              <><Pause className="mr-2 h-4 w-4" /> Pause Store</>
            ) : (
              <><Play className="mr-2 h-4 w-4" /> Activate Store</>
            )}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="details" className="w-full">
        <TabsList className="bg-card border border-border w-full justify-start overflow-x-auto h-auto p-1">
          <TabsTrigger value="details" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-2 px-4"><Settings className="mr-2 w-4 h-4"/> Details</TabsTrigger>
          <TabsTrigger value="menu" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-2 px-4"><Package className="mr-2 w-4 h-4"/> Menu</TabsTrigger>
          <TabsTrigger value="orders" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-2 px-4"><Store className="mr-2 w-4 h-4"/> Orders</TabsTrigger>
          <TabsTrigger value="drivers" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-2 px-4"><Truck className="mr-2 w-4 h-4"/> Drivers</TabsTrigger>
          <TabsTrigger value="subscription" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-2 px-4"><CreditCard className="mr-2 w-4 h-4"/> Subscription</TabsTrigger>
        </TabsList>
        
        <div className="mt-6">
          <TabsContent value="details" className="mt-0">
            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle>Contact Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Phone Number</p>
                    <p>{restaurant.phone}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">WhatsApp</p>
                    <p>{restaurant.whatsappNumber || '-'}</p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-sm font-medium text-muted-foreground mb-1">Address</p>
                    <p>{restaurant.address}</p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-sm font-medium text-muted-foreground mb-1">Description</p>
                    <p className="text-sm">{restaurant.description || 'No description provided.'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="menu" className="mt-0">
            <Card className="border-none shadow-sm flex flex-col items-center justify-center p-12 text-center">
              <Package className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
              <CardTitle className="mb-2">Menu Management</CardTitle>
              <p className="text-muted-foreground mb-6 max-w-md">Manage categories, products, and add-ons in the dedicated menu editor.</p>
              <Link href={`/admin/restaurants/${restaurantId}/menu`} className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2">
                Open Menu Editor
              </Link>
            </Card>
          </TabsContent>
          
          <TabsContent value="orders" className="mt-0">
            {/* Orders summary table could go here */}
            <Card className="border-none shadow-sm p-6"><p className="text-muted-foreground text-center">Recent orders will appear here.</p></Card>
          </TabsContent>
          
          <TabsContent value="drivers" className="mt-0">
            <Card className="border-none shadow-sm p-6"><p className="text-muted-foreground text-center">Assigned drivers will appear here.</p></Card>
          </TabsContent>
          
          <TabsContent value="subscription" className="mt-0">
            {restaurant.subscription ? (
              <Card className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle>Current Plan: {restaurant.subscription.plan}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p><span className="font-medium text-muted-foreground">Status:</span> {restaurant.subscription.status}</p>
                    <p><span className="font-medium text-muted-foreground">Expires:</span> {new Date(restaurant.subscription.expiryDate).toLocaleDateString()}</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-none shadow-sm p-6 text-center"><p className="text-muted-foreground">No active subscription found.</p></Card>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}