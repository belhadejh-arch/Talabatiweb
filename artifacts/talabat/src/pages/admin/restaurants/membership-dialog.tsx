import { useState } from "react";
import {
  Restaurant,
  SubscriptionPatchPlan,
  useUpdateSubscription,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { subscriptionPlanLabel, subscriptionStatusLabel } from "@/lib/labels";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle, CalendarClock, CheckCircle2, PauseCircle, RefreshCw, Repeat } from "lucide-react";

type PendingAction = {
  description: string;
  payload: Parameters<ReturnType<typeof useUpdateSubscription>["mutate"]>[0]["data"];
};

export function MembershipDialog({
  restaurant,
  onSuccess,
}: {
  restaurant: Restaurant & { subscription?: any };
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<SubscriptionPatchPlan>(
    (restaurant.subscription?.plan as SubscriptionPatchPlan) || SubscriptionPatchPlan.MONTHLY,
  );
  const [extensionDays, setExtensionDays] = useState("30");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const updateSubscription = useUpdateSubscription();

  const sub = restaurant.subscription;

  const reset = () => {
    setPending(null);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const confirmAndRun = () => {
    if (!pending) return;
    updateSubscription.mutate(
      { id: restaurant.id, data: pending.payload },
      {
        onSuccess: () => {
          toast({ title: `تم تعديل عضوية مطعم ${restaurant.name} بنجاح` });
          onSuccess();
          reset();
          setOpen(false);
        },
        onError: () => {
          toast({ title: "تعذّر تعديل العضوية، حاول مرة أخرى", variant: "destructive" });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button size="lg" onClick={() => setOpen(true)} data-testid="button-edit-membership">
        🏪 تعديل عضوية المطعم
      </Button>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>🏪 تعديل عضوية المطعم</DialogTitle>
          <DialogDescription>
            مطعم <span className="font-bold text-foreground">{restaurant.name}</span>
          </DialogDescription>
        </DialogHeader>

        {!pending ? (
          <div className="space-y-5">
            <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-1.5 text-sm">
              <p className="font-semibold text-foreground mb-1">الحالة الحالية</p>
              {sub ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">الخطة</span>
                    <span className="font-medium">{subscriptionPlanLabel(sub.plan)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">الحالة</span>
                    <Badge variant="outline">{subscriptionStatusLabel(sub.status)}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">تاريخ البدء</span>
                    <span>{new Date(sub.startDate).toLocaleDateString("ar-LY")}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">تاريخ الانتهاء</span>
                    <span>{new Date(sub.expiryDate).toLocaleDateString("ar-LY")}</span>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground">لا يوجد اشتراك مسجّل لهذا المطعم بعد.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>اختر الخطة</Label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  [SubscriptionPatchPlan.TRIAL, "تجريبي (٧ أيام)"],
                  [SubscriptionPatchPlan.MONTHLY, "شهري"],
                  [SubscriptionPatchPlan.YEARLY, "سنوي"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPlan(value)}
                    className={`rounded-md border px-2 py-2 text-sm font-medium transition-colors ${
                      plan === value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-secondary/50"
                    }`}
                    data-testid={`button-plan-${value}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="gap-2 justify-start"
                onClick={() =>
                  setPending({
                    description: `تجديد الاشتراك بخطة ${subscriptionPlanLabel(plan)} بدءاً من اليوم`,
                    payload: { renew: true, plan },
                  })
                }
                data-testid="button-action-renew"
              >
                <Repeat className="h-4 w-4" /> تجديد
              </Button>
              <Button
                variant="outline"
                className="gap-2 justify-start"
                onClick={() =>
                  setPending({
                    description: `تغيير الخطة إلى ${subscriptionPlanLabel(plan)} (تبدأ دورة فوترة جديدة من اليوم)`,
                    payload: { plan },
                  })
                }
                data-testid="button-action-change-plan"
              >
                <RefreshCw className="h-4 w-4" /> تغيير الخطة
              </Button>
              <div className="col-span-2 flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  value={extensionDays}
                  onChange={(e) => setExtensionDays(e.target.value)}
                  className="w-24"
                />
                <Button
                  variant="outline"
                  className="gap-2 flex-1 justify-start"
                  onClick={() =>
                    setPending({
                      description: `تمديد الاشتراك ${extensionDays} يوماً إضافياً`,
                      payload: { extensionDays: Number(extensionDays) },
                    })
                  }
                  data-testid="button-action-extend"
                >
                  <CalendarClock className="h-4 w-4" /> تمديد
                </Button>
              </div>
              <Button
                variant="outline"
                className="gap-2 justify-start text-emerald-600 border-emerald-600/30 hover:bg-emerald-500/10"
                onClick={() =>
                  setPending({
                    description: "تفعيل الاشتراك (السماح للمطعم باستقبال الطلبات)",
                    payload: { status: "ACTIVE" },
                  })
                }
                data-testid="button-action-activate"
              >
                <CheckCircle2 className="h-4 w-4" /> تفعيل
              </Button>
              <Button
                variant="outline"
                className="gap-2 justify-start text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() =>
                  setPending({
                    description: "إيقاف الاشتراك (سيتوقف المطعم عن استقبال الطلبات)",
                    payload: { status: "SUSPENDED" },
                  })
                }
                data-testid="button-action-deactivate"
              >
                <PauseCircle className="h-4 w-4" /> إيقاف
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
              <div className="flex items-center gap-2 text-amber-600 font-semibold">
                <AlertTriangle className="h-5 w-5" /> تأكيد التعديل
              </div>
              <p className="text-sm">
                سيتم تعديل عضوية مطعم <span className="font-bold">{restaurant.name}</span>:
              </p>
              <p className="text-sm font-medium">{pending.description}</p>
              <p className="text-xs text-muted-foreground">
                هذا الإجراء يؤثر فقط على مطعم "{restaurant.name}" ولن يغيّر عضوية أي مطعم آخر.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={reset} data-testid="button-cancel-membership-action">
                رجوع
              </Button>
              <Button
                onClick={confirmAndRun}
                disabled={updateSubscription.isPending}
                data-testid="button-confirm-membership-action"
              >
                {updateSubscription.isPending ? "جاري الحفظ..." : `تأكيد تعديل عضوية ${restaurant.name}`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
