import { useState } from "react";
import { useListSubscriptions } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { subscriptionPlanLabel, subscriptionStatusLabel } from "@/lib/labels";

export default function AdminSubscriptions() {
  const [page, setPage] = useState(1);
  
  const { data, isLoading } = useListSubscriptions({ page, limit: 15 });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'TRIAL': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'EXPIRED': return 'bg-red-500/10 text-red-500 border-red-500/20';
      default: return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">الاشتراكات</h2>
      </div>

      <Card className="border-none shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead>رقم المطعم</TableHead>
                <TableHead>الخطة</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>تاريخ البدء</TableHead>
                <TableHead>تاريخ الانتهاء</TableHead>
                <TableHead className="text-right">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">جارٍ التحميل...</TableCell>
                </TableRow>
              ) : !data?.data?.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">لا توجد اشتراكات</TableCell>
                </TableRow>
              ) : (
                data.data.map(sub => (
                  <TableRow key={sub.id} className="border-border">
                    <TableCell className="font-medium">مطعم #{sub.restaurantId}</TableCell>
                    <TableCell className="font-semibold">{subscriptionPlanLabel(sub.plan)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getStatusColor(sub.status)}>{subscriptionStatusLabel(sub.status)}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(sub.startDate).toLocaleDateString()}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(sub.expiryDate).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm">تجديد</Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}