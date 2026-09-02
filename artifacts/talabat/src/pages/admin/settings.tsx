import { useState } from "react";
import { useChangeEmail, useChangePassword, useGetSettings, useUpdateSettings } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function AdminSettings() {
  const { data: settings } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const changeEmail = useChangeEmail();
  const changePassword = useChangePassword();
  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [driverTimeout, setDriverTimeout] = useState<number | null>(null);
  const timeoutSeconds = driverTimeout ?? settings?.driverResponseTimeoutSeconds ?? 180;

  return (
    <div className="w-full max-w-3xl space-y-4 sm:space-y-6">
      <div>
        <h2 className="text-xl font-bold sm:text-2xl">الإعدادات</h2>
        <p className="mt-1 text-sm text-muted-foreground">إدارة حساب المشرف وسلوك التعيين الداخلي للسائقين.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>حساب المشرف</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <form className="space-y-3" onSubmit={(event) => {
            event.preventDefault();
            changeEmail.mutate({ data: { currentPassword: emailPassword, newEmail: email } });
          }}>
            <h3 className="font-semibold">تغيير البريد الإلكتروني</h3>
            <Input type="email" placeholder="البريد الإلكتروني الجديد" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <Input type="password" placeholder="كلمة المرور الحالية" value={emailPassword} onChange={(event) => setEmailPassword(event.target.value)} required />
            <Button type="submit" disabled={changeEmail.isPending}>تغيير البريد الإلكتروني</Button>
          </form>

          <form className="space-y-3 border-t pt-5" onSubmit={(event) => {
            event.preventDefault();
            changePassword.mutate({ data: { currentPassword, newPassword } });
          }}>
            <h3 className="font-semibold">تغيير كلمة المرور</h3>
            <Input type="password" placeholder="كلمة المرور الحالية" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
            <Input type="password" placeholder="كلمة المرور الجديدة" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
            <Button type="submit" disabled={changePassword.isPending}>تحديث كلمة المرور</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>التعيين الداخلي للسائقين</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
            <p className="font-semibold text-foreground">نظام داخلي بالكامل</p>
            <p className="mt-1 text-muted-foreground">تظهر الطلبات للسائقين داخل لوحة السائق فقط. لا يتم إرسال أي طلب عبر خدمات مراسلة خارجية.</p>
          </div>
          <label className="block space-y-2 font-medium">
            مدة انتظار رد السائق (بالدقائق)
            <Input
              type="number"
              min="1"
              max="1440"
              step="1"
              value={Math.max(1, Math.round(timeoutSeconds / 60))}
              onChange={(event) => setDriverTimeout(Math.max(60, Number(event.target.value || 1) * 60))}
            />
          </label>
          <p className="text-xs text-muted-foreground">بعد انتهاء المدة ينتقل الطلب تلقائيًا إلى سائق نشط آخر من نفس المطعم.</p>
          <Button
            onClick={() => updateSettings.mutate({ data: { driverResponseTimeoutSeconds: timeoutSeconds } })}
            disabled={updateSettings.isPending}
          >
            حفظ الإعدادات
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}