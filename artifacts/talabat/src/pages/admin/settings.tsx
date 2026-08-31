import { useState } from "react";
import { useChangeEmail, useChangePassword, useGetSettings, useUpdateSettings } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function AdminSettings() {
  const { data: settings } = useGetSettings();
  const updateSettings = useUpdateSettings(); const changeEmail = useChangeEmail(); const changePassword = useChangePassword();
  const [email, setEmail] = useState(""); const [emailPassword, setEmailPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState(""); const [newPassword, setNewPassword] = useState("");
  const [phoneId, setPhoneId] = useState("");
  const [whatsappEnabled, setWhatsappEnabled] = useState<boolean | null>(null);
  const enabled = whatsappEnabled ?? settings?.whatsappEnabled ?? false;
  return <div className="w-full max-w-2xl space-y-4 sm:space-y-6"><h2 className="text-xl sm:text-2xl font-bold">الإعدادات</h2>
    <Card><CardHeader><CardTitle>الحساب</CardTitle></CardHeader><CardContent className="space-y-6">
       <form className="space-y-3" onSubmit={e => { e.preventDefault(); changeEmail.mutate({ data: { currentPassword: emailPassword, newEmail: email } }); }}><h3 className="font-semibold">تغيير البريد الإلكتروني</h3><Input type="email" placeholder="البريد الإلكتروني الجديد" value={email} onChange={e => setEmail(e.target.value)} required /><Input type="password" placeholder="كلمة المرور الحالية" value={emailPassword} onChange={e => setEmailPassword(e.target.value)} required /><Button className="w-full sm:w-auto" type="submit" disabled={changeEmail.isPending}>تغيير البريد الإلكتروني</Button></form>
       <form className="space-y-3 border-t pt-5" onSubmit={e => { e.preventDefault(); changePassword.mutate({ data: { currentPassword, newPassword } }); }}><h3 className="font-semibold">تغيير كلمة المرور</h3><Input type="password" placeholder="كلمة المرور الحالية" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required /><Input type="password" placeholder="كلمة المرور الجديدة" value={newPassword} onChange={e => setNewPassword(e.target.value)} required /><Button className="w-full sm:w-auto" type="submit" disabled={changePassword.isPending}>تغيير كلمة المرور</Button></form>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>تكامل واتساب والمنصة</CardTitle></CardHeader><CardContent className="space-y-4">
      <label className="block">معرّف رقم واتساب (Phone Number ID من Meta)<Input defaultValue={settings?.whatsappPhoneId || ""} onChange={e => setPhoneId(e.target.value)} /></label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={enabled} onChange={e => setWhatsappEnabled(e.target.checked)} /> تفعيل إرسال رسائل واتساب التلقائية للسائقين عند وصول طلب جديد</label>
      <p className="text-xs text-muted-foreground">يجب تفعيل هذا الخيار وضبط معرّف رقم واتساب حتى يصل السائقون برسالة تلقائية عند كل طلب جديد.</p>
      <label className="block">العملة الافتراضية<Input value="دينار ليبي (LYD)" disabled /></label>
       <Button className="w-full sm:w-auto" onClick={() => updateSettings.mutate({ data: { whatsappPhoneId: phoneId || settings?.whatsappPhoneId, whatsappEnabled: enabled } })} disabled={updateSettings.isPending}>حفظ الإعدادات</Button>
    </CardContent></Card>
  </div>;
}