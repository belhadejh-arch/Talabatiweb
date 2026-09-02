import { useGetAnalyticsSummary, useGetOrdersOverTime, useGetRevenueOverTime, useGetTopRestaurants, getGetAnalyticsSummaryQueryKey, getGetOrdersOverTimeQueryKey, getGetRevenueOverTimeQueryKey, getGetTopRestaurantsQueryKey, useGetMe, useListAllDrivers } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Store, ShoppingBag, DollarSign, Activity, TrendingUp } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/currency";

export default function AdminDashboard() {
  const { data: user } = useGetMe();
  const { data: summary, isLoading: loadingSummary } = useGetAnalyticsSummary(undefined, { query: { queryKey: getGetAnalyticsSummaryQueryKey() } });
  const { data: ordersData } = useGetOrdersOverTime(undefined, { query: { queryKey: getGetOrdersOverTimeQueryKey() } });
  const { data: revenueData } = useGetRevenueOverTime(undefined, { query: { queryKey: getGetRevenueOverTimeQueryKey() } });
  const { data: topRestaurants } = useGetTopRestaurants(undefined, { query: { queryKey: getGetTopRestaurantsQueryKey() } });
  const { data: allDrivers } = useListAllDrivers();
  const activeDrivers = allDrivers?.filter((driver) => driver.status === "ACTIVE").length ?? 0;

  const stats = [
    {
      title: "إجمالي الإيرادات",
      value: formatCurrency(summary?.totalRevenue || 0),
      trend: "من قاعدة البيانات",
      icon: DollarSign,
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10"
    },
    {
      title: "إجمالي الطلبات",
      value: summary?.totalOrders?.toLocaleString() || 0,
      trend: "من قاعدة البيانات",
      icon: ShoppingBag,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10"
    },
    {
      title: "المطاعم النشطة",
      value: summary?.activeRestaurants?.toLocaleString() || 0,
      trend: "من قاعدة البيانات",
      icon: Store,
      color: "text-primary",
      bgColor: "bg-primary/10"
    },
    {
      title: "السائقون النشطون",
      value: activeDrivers,
      trend: "من قاعدة البيانات",
      icon: Activity,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10"
    }
  ];

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500">
      
      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <Card key={i} className="border border-border/50 shadow-sm rounded-2xl bg-card hover-elevate overflow-hidden relative">
            <div className={`absolute top-0 end-0 w-24 h-24 -mt-8 -me-8 rounded-full opacity-20 blur-2xl ${stat.bgColor}`} />
            <CardHeader className="flex flex-row items-center justify-between pb-2 z-10 relative">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`p-2.5 rounded-xl ${stat.bgColor}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent className="z-10 relative">
              {loadingSummary ? (
                <Skeleton className="h-8 w-24 rounded-lg" />
              ) : (
                <div className="flex flex-col gap-1">
                  <span className="text-3xl font-bold tracking-tight">{stat.value}</span>
                  <span className="text-xs font-medium text-emerald-500 flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    {stat.trend} عن الشهر الماضي
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border border-border/50 shadow-sm rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold">الإيرادات بمرور الوقت</CardTitle>
            <CardDescription>الإيرادات اليومية عبر جميع الفروع</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px] sm:h-[320px] pt-4">
            {revenueData ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={formatCurrency} dx={-10} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    itemStyle={{ color: 'hsl(var(--foreground))', fontWeight: 'bold' }}
                    labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: '4px' }}
                  />
                  <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full flex items-center justify-center">
                <Skeleton className="w-full h-full rounded-xl" />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border border-border/50 shadow-sm rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold">الطلبات بمرور الوقت</CardTitle>
            <CardDescription>عدد الطلبات الناجحة التي تم توصيلها</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px] sm:h-[320px] pt-4">
            {ordersData ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={ordersData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorOrd" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(190, 90%, 40%)" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="hsl(190, 90%, 40%)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} dx={-10} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    itemStyle={{ color: 'hsl(var(--foreground))', fontWeight: 'bold' }}
                    labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: '4px' }}
                  />
                  <Area type="monotone" dataKey="value" stroke="hsl(190, 90%, 40%)" strokeWidth={3} fillOpacity={1} fill="url(#colorOrd)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full flex items-center justify-center">
                <Skeleton className="w-full h-full rounded-xl" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Restaurants Table */}
      <Card className="border border-border/50 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-muted/30 border-b border-border/50">
          <CardTitle className="text-lg font-semibold">أفضل المطاعم</CardTitle>
          <CardDescription>حسب إجمالي حجم المبيعات والإيرادات</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-transparent hover:bg-transparent">
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="ps-6 font-semibold text-muted-foreground">اسم المطعم</TableHead>
                <TableHead className="text-end font-semibold text-muted-foreground">إجمالي الطلبات</TableHead>
                <TableHead className="text-end pe-6 font-semibold text-muted-foreground">الإيرادات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topRestaurants?.map((rest, idx) => (
                <TableRow key={rest.restaurantId} className="border-border/50 hover:bg-muted/30 transition-colors">
                  <TableCell className="ps-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                        {idx + 1}
                      </div>
                      <span className="font-medium text-foreground">{rest.restaurantName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-end py-4">
                    <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-600 text-sm font-medium">
                      {rest.totalOrders.toLocaleString()}
                    </div>
                  </TableCell>
                  <TableCell className="text-end pe-6 py-4 font-bold text-emerald-600">
                    {formatCurrency(rest.totalRevenue)}
                  </TableCell>
                </TableRow>
              ))}
              {!topRestaurants?.length && (
                <TableRow>
                  <TableCell colSpan={3} className="h-32 text-center text-muted-foreground">
                    No data available for the current period
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
