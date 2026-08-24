import { useState } from "react";
import { useTranslation } from "react-i18next";
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
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Users, ShoppingCart, DollarSign } from "lucide-react";

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export default function AdminAnalytics() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<any>('month');

  const { data: summary, isLoading: loadingSummary } = useGetAnalyticsSummary({ period });
  const { data: ordersData } = useGetOrdersOverTime({ period });
  const { data: revenueData } = useGetRevenueOverTime({ period });
  const { data: topRestaurants } = useGetTopRestaurants({ period, limit: 5 });
  const { data: topProducts } = useGetTopProducts({ period, limit: 5 });
  const { data: driverPerformance } = useGetDriverPerformance({ period });
  const { data: peakHours } = useGetPeakHours({ period });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Platform Analytics</h2>
          <p className="text-sm text-muted-foreground">Comprehensive performance metrics</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[180px] bg-background">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">Last 7 Days</SelectItem>
              <SelectItem value="month">Last 30 Days</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-none shadow-sm hover-elevate">
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-x-4">
              <div className="flex flex-col space-y-1">
                <span className="text-sm font-medium text-muted-foreground">Total Revenue</span>
                <span className="text-2xl font-bold">{t("common.currency")}{summary?.totalRevenue?.toLocaleString() || 0}</span>
              </div>
              <div className="p-3 bg-primary/10 rounded-xl text-primary"><DollarSign className="h-5 w-5" /></div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm hover-elevate">
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-x-4">
              <div className="flex flex-col space-y-1">
                <span className="text-sm font-medium text-muted-foreground">Total Orders</span>
                <span className="text-2xl font-bold">{summary?.totalOrders?.toLocaleString() || 0}</span>
              </div>
              <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500"><ShoppingCart className="h-5 w-5" /></div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm hover-elevate">
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-x-4">
              <div className="flex flex-col space-y-1">
                <span className="text-sm font-medium text-muted-foreground">Avg. Order Value</span>
                <span className="text-2xl font-bold">{t("common.currency")}{summary?.averageOrderValue?.toLocaleString() || 0}</span>
              </div>
              <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-500"><TrendingUp className="h-5 w-5" /></div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm hover-elevate">
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-x-4">
              <div className="flex flex-col space-y-1">
                <span className="text-sm font-medium text-muted-foreground">Active Restaurants</span>
                <span className="text-2xl font-bold">{summary?.activeRestaurants?.toLocaleString() || 0}</span>
              </div>
              <div className="p-3 bg-purple-500/10 rounded-xl text-purple-500"><Users className="h-5 w-5" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle>Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {revenueData ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueData}>
                  <defs>
                    <linearGradient id="colorRevChart" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                  <RechartsTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }} />
                  <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#colorRevChart)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <div className="h-full flex items-center justify-center text-muted-foreground">Loading...</div>}
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle>Peak Hours</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {peakHours ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={peakHours}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}:00`} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <RechartsTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
                  <Bar dataKey="orderCount" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-full flex items-center justify-center text-muted-foreground">Loading...</div>}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle>Top Performing Restaurants</CardTitle>
            <CardDescription>Based on revenue generated</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead>Restaurant</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topRestaurants?.map((rest) => (
                  <TableRow key={rest.restaurantId} className="border-border">
                    <TableCell className="font-medium">{rest.restaurantName}</TableCell>
                    <TableCell className="text-right">{rest.totalOrders}</TableCell>
                    <TableCell className="text-right text-primary font-medium">{t("common.currency")}{rest.totalRevenue.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle>Top Selling Products</CardTitle>
            <CardDescription>Across all restaurants</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead>Product</TableHead>
                  <TableHead>Restaurant</TableHead>
                  <TableHead className="text-right">Sold</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProducts?.map((prod) => (
                  <TableRow key={prod.productId} className="border-border">
                    <TableCell className="font-medium">{prod.productName}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{prod.restaurantName}</TableCell>
                    <TableCell className="text-right font-medium">{prod.totalSold}</TableCell>
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