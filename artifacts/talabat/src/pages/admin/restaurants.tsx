import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useListRestaurants, RestaurantStatus } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, MoreHorizontal, Eye, FileEdit, Store } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { restaurantStatusLabel, subscriptionPlanLabel, subscriptionStatusLabel } from "@/lib/labels";

export default function AdminRestaurants() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const limit = 10;

  const { data, isLoading } = useListRestaurants(
    { 
      search: search || undefined, 
      status: statusFilter !== "ALL" ? statusFilter : undefined,
      page,
      limit
    },
    { query: { queryKey: ['restaurants', page, statusFilter, search], placeholderData: (prev: any) => prev } }
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20';
      case 'INACTIVE': return 'bg-slate-500/10 text-slate-500 hover:bg-slate-500/20 border-slate-500/20';
      case 'SUSPENDED': return 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border-red-500/20';
      default: return 'bg-primary/10 text-primary';
    }
  };

  const getSubColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'TRIAL': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'EXPIRED': return 'bg-red-500/10 text-red-500 border-red-500/20';
      default: return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold tracking-tight">المطاعم</h2>
        <Link href="/admin/restaurants/new" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2">
          <Plus className="mr-2 h-4 w-4" />
          إضافة مطعم
        </Link>
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader className="pb-3 border-b border-border">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="البحث في المطاعم..."
                className="w-full pl-9 bg-background/50 border-border"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="flex w-full sm:w-auto gap-2 overflow-x-auto pb-2 sm:pb-0">
              {['ALL', ...Object.values(RestaurantStatus)].map(status => (
                <Button
                  key={status}
                  variant={statusFilter === status ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setStatusFilter(status);
                    setPage(1);
                  }}
                  className="whitespace-nowrap"
                >
                  {status === 'ALL' ? "الكل" : ({ ACTIVE: "نشط", INACTIVE: "غير نشط", SUSPENDED: "موقوف" }[status] || status)}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead>الاسم</TableHead>
                <TableHead>التواصل</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>الخطة</TableHead>
                <TableHead className="text-right">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    جاري التحميل...
                  </TableCell>
                </TableRow>
              ) : data?.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    لا توجد مطاعم
                  </TableCell>
                </TableRow>
              ) : (
                data?.data.map((restaurant) => (
                  <TableRow
                    key={restaurant.id}
                    className="border-border group cursor-pointer hover:bg-secondary/40"
                    onClick={() => navigate(`/admin/restaurants/${restaurant.id}`)}
                    data-testid={`row-restaurant-${restaurant.id}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-md bg-secondary flex items-center justify-center overflow-hidden shrink-0 border border-border">
                          {restaurant.logoUrl ? (
                            <img src={restaurant.logoUrl} alt={restaurant.name} className="h-full w-full object-cover" />
                          ) : (
                            <Store className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{restaurant.name}</p>
                          <p className="text-xs text-muted-foreground">/{restaurant.slug}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <p>{restaurant.phone}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">{restaurant.address}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getStatusColor(restaurant.status)}>
                        {restaurantStatusLabel(restaurant.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {restaurant.subscription ? (
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-semibold">{subscriptionPlanLabel(restaurant.subscription.plan)}</span>
                          <Badge variant="outline" className={`w-fit text-[10px] h-4 px-1 py-0 ${getSubColor(restaurant.subscription.status)}`}>
                            {subscriptionStatusLabel(restaurant.subscription.status)}
                          </Badge>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">لا توجد خطة</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/admin/restaurants/${restaurant.id}`}>
                          <Button variant="outline" size="sm" className="h-8 gap-1.5" data-testid={`button-view-restaurant-${restaurant.id}`}>
                            <Eye className="h-3.5 w-3.5" />
                            عرض التفاصيل
                          </Button>
                        </Link>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">فتح القائمة</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-popover border-border">
                            <Link href={`/admin/restaurants/${restaurant.id}`}>
                              <DropdownMenuItem className="cursor-pointer">
                                <Eye className="mr-2 h-4 w-4 text-muted-foreground" />
                                عرض التفاصيل
                              </DropdownMenuItem>
                            </Link>
                            <Link href={`/admin/restaurants/${restaurant.id}/menu`}>
                              <DropdownMenuItem className="cursor-pointer">
                                <FileEdit className="mr-2 h-4 w-4 text-muted-foreground" />
                                إدارة القائمة
                              </DropdownMenuItem>
                            </Link>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          
          {/* Pagination */}
          {data && data.total > limit && (
            <div className="flex items-center justify-end space-x-2 p-4 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                السابق
              </Button>
              <div className="text-sm font-medium">
                الصفحة {page} من {Math.ceil(data.total / limit)}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => p + 1)}
                disabled={page >= Math.ceil(data.total / limit)}
              >
                التالي
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}