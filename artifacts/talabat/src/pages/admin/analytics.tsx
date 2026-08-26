import { useState } from "react";
import { 
  useGetAnalyticsSummary, 
  useGetOrdersOverTime, 
  useGetRevenueOverTime, 
  useGetTopRestaurants,
  useGetTopProducts,
  useGetDriverPerformance,
  useGetPeakHours
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, Users, ShoppingCart, DollarSign } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/currency";

export default function AdminAnalytics() {
  const [period, setPeriod] = useState<any>('month');

  const { data: summary, isLoading: loadingSummary } = useGetAnalyticsSummary({ period });
  const { data: ordersData } = useGetOrdersOverTime({ period });
  const { data: revenueData } = useGetRevenueOverTime({ period });
  const { data: topRestaurants } = useGetTopRestaurants({ period, limit: 5 });
  const { data: topProducts } = useGetTopProducts({ period, limit: 5 });
  const { data: peakHours } = useGetPeakHours({ period });

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500">
      
      {/* Header & Filter */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-4 sm:p-6 rounded-2xl border border-border/50 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">تحليلات المنصة</h2>
          <p className="text-sm text-muted-foreground mt-1">تعمّق في مؤشرات الأداء</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">الفترة الزمنية:</span>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-full sm:w-[180px] bg-background border-border/50 rounded-xl h-11">
              <SelectValue placeholder="اختر الفترة" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-border/50">
              <SelectItem value="today" className="rounded-lg">اليوم</SelectItem>
              <SelectItem value="week" className="rounded-lg">آخر 7 أيام</SelectItem>
              <SelectItem value="month" className="rounded-lg">آخر 30 يومًا</SelectItem>
              <SelectItem value="year" className="rounded-lg">هذه السنة</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border border-border/50 shadow-sm rounded-2xl hover-elevate">
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-x-4">
              <div className="flex flex-col space-y-2">
                <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">إجمالي الإيرادات</span>
                {loadingSummary ? <Skeleton className="h-8 w-24 rounded-lg" /> : (
                  <span className="text-2xl font-bold tracking-tight">{formatCurrency(summary?.totalRevenue || 0)}</span>
                )}
              </div>
              <div className="p-3.5 bg-primary/10 rounded-2xl text-primary"><DollarSign className="h-6 w-6" /></div>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-border/50 shadow-sm rounded-2xl hover-elevate">
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-x-4">
              <div className="flex flex-col space-y-2">
                <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">إجمالي الطلبات</span>
                {loadingSummary ? <Skeleton className="h-8 w-20 rounded-lg" /> : (
                  <span className="text-2xl font-bold tracking-tight">{summary?.totalOrders?.toLocaleString() || 0}</span>
                )}
              </div>
              <div className="p-3.5 bg-blue-500/10 rounded-2xl text-blue-500"><ShoppingCart className="h-6 w-6" /></div>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-border/50 shadow-sm rounded-2xl hover-elevate">
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-x-4">
              <div className="flex flex-col space-y-2">
                <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">متوسط قيمة الطلب</span>
                {loadingSummary ? <Skeleton className="h-8 w-20 rounded-lg" /> : (
                  <span className="text-2xl font-bold tracking-tight">{formatCurrency(summary?.averageOrderValue || 0)}</span>
                )}
              </div>
              <div className="p-3.5 bg-emerald-500/10 rounded-2xl text-emerald-500"><TrendingUp className="h-6 w-6" /></div>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-border/50 shadow-sm rounded-2xl hover-elevate">
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-x-4">
              <div className="flex flex-col space-y-2">
                <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">المطاعم النشطة</span>
                {loadingSummary ? <Skeleton className="h-8 w-16 rounded-lg" /> : (
                  <span className="text-2xl font-bold tracking-tight">{summary?.activeRestaurants?.toLocaleString() || 0}</span>
                )}
              </div>
              <div className="p-3.5 bg-purple-500/10 rounded-2xl text-purple-500"><Users className="h-6 w-6" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border border-border/50 shadow-sm rounded-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold">اتجاه الإيرادات</CardTitle>
            <CardDescription>الأداء المالي خلال الفترة المحددة</CardDescription>
          </CardHeader>
          <CardContent className="h-[340px]">
            {revenueData ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevChart" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={formatCurrency} dx={-10} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '12px' }} 
                    itemStyle={{ color: 'hsl(var(--foreground))', fontWeight: 'bold' }}
                  />
                  <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorRevChart)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <div className="h-full flex items-center justify-center"><Skeleton className="w-full h-full rounded-xl" /></div>}
          </CardContent>
        </Card>

        <Card className="border border-border/50 shadow-sm rounded-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold">ساعات الذروة</CardTitle>
            <CardDescription>توزيع حجم الطلبات حسب وقت اليوم</CardDescription>
          </CardHeader>
          <CardContent className="h-[340px]">
            {peakHours ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={peakHours} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}:00`} dy={10} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} dx={-10} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '12px' }} 
                    cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} 
                  />
                  <Bar dataKey="orderCount" fill="hsl(190, 90%, 40%)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-full flex items-center justify-center"><Skeleton className="w-full h-full rounded-xl" /></div>}
          </CardContent>
        </Card>
      </div>

      {/* Top Lists */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border border-border/50 shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className="bg-muted/30 border-b border-border/50">
            <CardTitle className="text-lg font-semibold">أفضل المطاعم أداءً</CardTitle>
            <CardDescription>حسب الإيرادات المحققة</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-transparent">
                <TableRow className="border-border/50">
                  <TableHead className="ps-6 font-semibold">المطعم</TableHead>
                  <TableHead className="text-end font-semibold">الطلبات</TableHead>
                  <TableHead className="text-end pe-6 font-semibold">الإيرادات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topRestaurants?.map((rest) => (
                  <TableRow key={rest.restaurantId} className="border-border/50 hover:bg-muted/30 transition-colors">
                    <TableCell className="ps-6 font-medium text-foreground py-4">{rest.restaurantName}</TableCell>
                    <TableCell className="text-end py-4">
                      <span className="inline-flex px-2.5 py-1 bg-secondary text-secondary-foreground rounded-full text-xs font-semibold">
                        {rest.totalOrders}
                      </span>
                    </TableCell>
                    <TableCell className="text-end pe-6 py-4 text-emerald-600 font-bold">{formatCurrency(rest.totalRevenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border border-border/50 shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className="bg-muted/30 border-b border-border/50">
            <CardTitle className="text-lg font-semibold">الأكثر مبيعًا من المنتجات</CardTitle>
            <CardDescription>عبر جميع المطاعم</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-transparent">
                <TableRow className="border-border/50">
                  <TableHead className="ps-6 font-semibold">المنتج</TableHead>
                  <TableHead className="font-semibold">المطعم</TableHead>
                  <TableHead className="text-end pe-6 font-semibold">الكمية المباعة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProducts?.map((prod) => (
                  <TableRow key={prod.productId} className="border-border/50 hover:bg-muted/30 transition-colors">
                    <TableCell className="ps-6 font-medium text-foreground py-4">{prod.productName}</TableCell>
                    <TableCell className="text-muted-foreground text-sm py-4">{prod.restaurantName}</TableCell>
                    <TableCell className="text-end pe-6 py-4">
                      <span className="inline-flex px-2.5 py-1 bg-primary/10 text-primary rounded-full text-xs font-semibold">
                        {prod.totalSold}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
