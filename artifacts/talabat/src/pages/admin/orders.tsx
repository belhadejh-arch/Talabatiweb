import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useListOrders, OrderStatus } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function AdminOrders() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const limit = 15;

  const { data, isLoading } = useListOrders(
    { 
      search: search || undefined, 
      status: statusFilter !== "ALL" ? statusFilter : undefined,
      page,
      limit
    },
    { query: { queryKey: ['orders', page, statusFilter, search], placeholderData: (prev: any) => prev } }
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'NEW': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'ACCEPTED': return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20';
      case 'PREPARING': return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      case 'READY': return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      case 'OUT_FOR_DELIVERY': return 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20';
      case 'DELIVERED': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'CANCELLED': return 'bg-red-500/10 text-red-500 border-red-500/20';
      default: return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">{t("admin.orders.title")}</h2>
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader className="pb-3 border-b border-border">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder={t("admin.orders.search")}
                className="w-full pl-9 bg-background/50 border-border"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="flex w-full sm:w-auto gap-2 overflow-x-auto pb-2 sm:pb-0 hide-scrollbar">
              {['ALL', ...Object.values(OrderStatus)].map(status => (
                <Button
                  key={status}
                  variant={statusFilter === status ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setStatusFilter(status);
                    setPage(1);
                  }}
                  className="whitespace-nowrap text-xs h-8"
                >
                  {status.replace(/_/g, ' ')}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead>{t("admin.orders.id")}</TableHead>
                <TableHead>{t("admin.orders.restaurant")}</TableHead>
                <TableHead>{t("admin.orders.customer")}</TableHead>
                <TableHead>{t("admin.orders.amount")}</TableHead>
                <TableHead>{t("admin.orders.status")}</TableHead>
                <TableHead>{t("admin.orders.date")}</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    {t("common.loading")}
                  </TableCell>
                </TableRow>
              ) : data?.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No orders found
                  </TableCell>
                </TableRow>
              ) : (
                data?.data.map((order) => (
                  <TableRow key={order.id} className="border-border hover:bg-secondary/50">
                    <TableCell className="font-mono font-medium">#{order.id.toString().padStart(6, '0')}</TableCell>
                    <TableCell className="font-medium">{order.restaurantName}</TableCell>
                    <TableCell>
                      <div>
                        <p>{order.customerName}</p>
                        <p className="text-xs text-muted-foreground">{order.customerPhone}</p>
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold">{t("common.currency")}{order.totalAmount.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getStatusColor(order.status)}>
                        {order.status.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(order.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          
          {data && data.total > limit && (
            <div className="flex items-center justify-end space-x-2 p-4 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
              <div className="text-sm font-medium">Page {page} of {Math.ceil(data.total / limit)}</div>
              <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(data.total / limit)}>Next</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}