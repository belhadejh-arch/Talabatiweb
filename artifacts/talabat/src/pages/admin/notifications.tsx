import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useListNotifications, useMarkAllNotificationsRead, useMarkNotificationRead } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, Check, Store, Info, AlertTriangle } from "lucide-react";
import { getListNotificationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

export default function AdminNotifications() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  
  const { data, isLoading } = useListNotifications({ page, limit: 20 });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const handleMarkRead = (id: number) => {
    markRead.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
      }
    });
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
      }
    });
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'ORDER': return <Store className="h-5 w-5 text-blue-500" />;
      case 'SUBSCRIPTION': return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      default: return <Info className="h-5 w-5 text-primary" />;
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Bell className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{t("admin.sidebar.notifications")}</h2>
            <p className="text-sm text-muted-foreground">Manage platform alerts</p>
          </div>
        </div>
        
        {data?.unreadCount ? (
          <Button variant="outline" onClick={handleMarkAllRead} disabled={markAllRead.isPending}>
            <Check className="mr-2 h-4 w-4" /> Mark all read
          </Button>
        ) : null}
      </div>

      <Card className="border-none shadow-sm">
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading...</div>
            ) : data?.data.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
                <Bell className="h-12 w-12 opacity-20 mb-4" />
                <p>No notifications</p>
              </div>
            ) : (
              data?.data.map((notification) => (
                <div 
                  key={notification.id} 
                  className={cn(
                    "flex gap-4 p-4 hover:bg-secondary/50 transition-colors",
                    !notification.isRead && "bg-primary/5"
                  )}
                >
                  <div className="mt-1 shrink-0">
                    {getIcon(notification.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-4">
                      <p className={cn("text-sm", !notification.isRead ? "font-semibold" : "text-muted-foreground")}>
                        {notification.message}
                      </p>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(notification.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  {!notification.isRead && (
                    <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => handleMarkRead(notification.id)}>
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
          
          {data && data.total > 20 && (
            <div className="flex items-center justify-between p-4 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
              <div className="text-sm font-medium">Page {page} of {Math.ceil(data.total / 20)}</div>
              <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(data.total / 20)}>Next</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}