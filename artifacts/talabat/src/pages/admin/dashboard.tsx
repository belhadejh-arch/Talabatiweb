import { useTranslation } from "react-i18next";
import { useGetAnalyticsSummary, useGetOrdersOverTime, useGetRevenueOverTime, useGetTopRestaurants, getGetAnalyticsSummaryQueryKey, getGetOrdersOverTimeQueryKey, getGetRevenueOverTimeQueryKey, getGetTopRestaurantsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Store, ShoppingBag, DollarSign, Activity } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function AdminDashboard() {
  const { t } = useTranslation();
  
  const { data: summary, isLoading: loadingSummary } = useGetAnalyticsSummary(undefined, { query: { queryKey: getGetAnalyticsSummaryQueryKey() } });
  const { data: ordersData } = useGetOrdersOverTime(undefined, { query: { queryKey: getGetOrdersOverTimeQueryKey() } });
  const { data: revenueData } = useGetRevenueOverTime(undefined, { query: { queryKey: getGetRevenueOverTimeQueryKey() } });
  const { data: topRestaurants } = useGetTopRestaurants(undefined, { query: { queryKey: getGetTopRestaurantsQueryKey() } });

  const stats = [
    {
      title: t("admin.dashboard.totalRevenue"),
      value: `${t("common.currency")} ${summary?.totalRevenue?.toLocaleString() || 0}`,
      icon: DollarSign,
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10"
    },
    {
      title: t("admin.dashboard.totalOrders"),
      value: summary?.totalOrders?.toLocaleString() || 0,
      icon: ShoppingBag,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10"
    },
    {
      title: t("admin.dashboard.activeRestaurants"),
      value: summary?.activeRestaurants?.toLocaleString() || 0,
      icon: Store,
      color: "text-primary",
      bgColor: "bg-primary/10"
    },
    {
      title: t("admin.dashboard.activeDrivers"),
      value: summary?.activeRestaurants ? Math.floor(summary.activeRestaurants * 2.5) : 0, // Mock for now if no driver stat
      icon: Activity,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10"
    }
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <Card key={i} className="border-none shadow-sm bg-card hover-elevate">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loadingSummary ? "..." : stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">{t("admin.dashboard.revenueOverTime")}</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {revenueData ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueData}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#colorRev)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground">{t("common.loading")}</div>
            )}
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">{t("admin.dashboard.ordersOverTime")}</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {ordersData ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={ordersData}>
                  <defs>
                    <linearGradient id="colorOrd" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorOrd)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground">{t("common.loading")}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">{t("admin.dashboard.topRestaurants")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead>{t("admin.restaurants.name")}</TableHead>
                <TableHead className="text-right">{t("admin.dashboard.totalOrders")}</TableHead>
                <TableHead className="text-right">{t("admin.dashboard.totalRevenue")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topRestaurants?.map((rest) => (
                <TableRow key={rest.restaurantId} className="border-border">
                  <TableCell className="font-medium">{rest.restaurantName}</TableCell>
                  <TableCell className="text-right">{rest.totalOrders}</TableCell>
                  <TableCell className="text-right">{t("common.currency")} {rest.totalRevenue.toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {!topRestaurants?.length && (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                    No data available
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}