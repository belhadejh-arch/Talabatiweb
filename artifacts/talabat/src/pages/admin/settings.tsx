import { useEffect, useState } from "react";
import { useChangeEmail, useChangePassword, useGetSettings, useUpdateSettings, getBaseUrl } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type SessionConfig = {
  apiKeyConfigured: boolean;
  apiUrlConfigured: boolean;
  sessionIdConfigured: boolean;
  apiUrl: string;
};

function providerStatus(value: unknown): string {
  if (!value || typeof value !== "object") return "غير معروف";
  const root = value as Record<string, unknown>;
  const data = root.data && typeof root.data === "object" ? root.data as Record<string, unknown> : {};
  return String(data.status ?? root.status ?? "غير معروف");
}

export default function AdminSettings() {
  const { data: settings } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const changeEmail = useChangeEmail();
  const changePassword = useChangePassword();
  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [whatsappEnabled, setWhatsappEnabled] = useState<boolean | null>(null);
  const [driverTimeout, setDriverTimeout] = useState<number | null>(null);
  const [sessionConfig, setSessionConfig] = useState<SessionConfig | null>(null);
  const [sessionStatus, setSessionStatus] = useState("غير معروف");
  const [sessionResult, setSessionResult] = useState<unknown>(null);
  const [sessionBusy, setSessionBusy] = useState(false);
  const base = getBaseUrl() ?? "";
  const enabled = whatsappEnabled ?? settings?.whatsappEnabled ?? false;
  const timeoutSeconds = driverTimeout ?? settings?.driverResponseTimeoutSeconds ?? 180;
  const sessionResultText = sessionResult ? JSON.stringify(sessionResult, null, 2) : "";

  const loadSession = async () => {
    try {
      const configResponse = await fetch(`${base}/api/wp-sender/session`, { credentials: "include" });
      if (!configResponse.ok) throw new Error("تعذر قراءة إعدادات WP Sender");
      setSessionConfig(await configResponse.json());
      const statusResponse = await fetch(`${base}/api/wp-sender/session/status`, { credentials: "include" });
      const statusBody = await statusResponse.json().catch(() => null);
      setSessionStatus(statusResponse.ok ? providerStatus(statusBody) : statusBody?.error || "غير متصل");
    } catch (error) {
      setSessionStatus(error instanceof Error ? error.message : "تعذر فحص الجلسة");
    }
  };

  useEffect(() => {
    void loadSession();
  }, [base]);

  const sessionAction = async (path: string, method = "POST") => {
    setSessionBusy(true);
    try {
      const response = await fetch(`${base}${path}`, { method, credentials: "include" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "تعذر تنفيذ العملية");
      setSessionResult(body);
      await loadSession();
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر تنفيذ العملية");
    } finally {
      setSessionBusy(false);
    }
  };

  return <div className="w-full max-w-2xl space-y-4 sm:space-y-6"><h2 className="text-xl sm:text-2xl font-bold">الإعدادات</h2>
    <Card><CardHeader><CardTitle>الحساب</CardTitle></CardHeader><CardContent className="space-y-6">
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); changeEmail.mutate({ data: { currentPassword: emailPassword, newEmail: email } }); }}><h3 className="font-semibold">تغيير البريد الإلكتروني</h3><Input type="email" placeholder="البريد الإلكتروني الجديد" value={email} onChange={e => setEmail(e.target.value)} required /><Input type="password" placeholder="كلمة المرور الحالية" value={emailPassword} onChange={e => setEmailPassword(e.target.value)} required /><Button className="w-full sm:w-auto" type="submit" disabled={changeEmail.isPending}>تغيير البريد الإلكتروني</Button></form>
      <form className="space-y-3 border-t pt-5" onSubmit={e => { e.preventDefault(); changePassword.mutate({ data: { currentPassword, newPassword } }); }}><h3 className="font-semibold">تغيير كلمة المرور</h3><Input type="password" placeholder="كلمة المرور الحالية" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required /><Input type="password" placeholder="كلمة المرور الجديدة" value={newPassword} onChange={e => setNewPassword(e.target.value)} required /><Button className="w-full sm:w-auto" type="submit" disabled={changePassword.isPending}>تغيير كلمة المرور</Button></form>
    </CardContent></Card>

    <Card><CardHeader><CardTitle>WP Sender وWhatsApp</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">إعدادات الخادم</p>
        <p>يقرأ الخادم هذه القيم من Replit Secrets فقط: WP_SENDER_API_KEY وWP_SENDER_API_URL وWP_SENDER_SESSION_ID. لا تظهر قيمة المفتاح في الواجهة أو في GitHub.</p>
      </div>
      <div className="grid gap-2 rounded-md border p-3 text-sm">
        <div className="flex justify-between gap-4"><span>API Key</span><strong>{sessionConfig?.apiKeyConfigured ? "مُكوّن" : "غير مُكوّن"}</strong></div>
        <div className="flex justify-between gap-4"><span>API URL</span><span dir="ltr" className="text-left">{sessionConfig?.apiUrl || "—"}</span></div>
        <div className="flex justify-between gap-4"><span>Session ID</span><strong>{sessionConfig?.sessionIdConfigured ? "مُكوّن" : "غير مُكوّن"}</strong></div>
        <div className="flex justify-between gap-4"><span>حالة WhatsApp Session</span><strong>{sessionStatus}</strong></div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => void loadSession()} disabled={sessionBusy}>فحص الاتصال</Button>
        <Button type="button" variant="outline" onClick={() => void sessionAction("/api/wp-sender/session/create")} disabled={sessionBusy}>إنشاء Session</Button>
        <Button type="button" variant="outline" onClick={() => void sessionAction("/api/wp-sender/session/reconnect")} disabled={sessionBusy}>إعادة الاتصال</Button>
      </div>
      {sessionResultText && <pre dir="ltr" className="max-h-48 overflow-auto rounded bg-muted p-3 text-xs">{sessionResultText}</pre>}
      <label className="flex items-center gap-2"><input type="checkbox" checked={enabled} onChange={e => setWhatsappEnabled(e.target.checked)} /> تفعيل إرسال الطلبات تلقائيًا إلى السائقين</label>
      <p className="text-xs text-muted-foreground">عند التفعيل، يرسل النظام الطلب إلى سائق ACTIVE واحد فقط من نفس المطعم باستخدام رقم WhatsApp المسجل.</p>
      <label className="block">العملة الافتراضية<Input value="دينار ليبي (LYD)" disabled /></label>
      <div className="border-t pt-5 space-y-2">
        <label className="block font-medium">مدة انتظار السائق (بالدقائق)
          <Input type="number" min="1" max="1440" step="1" value={Math.max(1, Math.round(timeoutSeconds / 60))} onChange={e => setDriverTimeout(Math.max(60, Number(e.target.value || 1) * 60))} />
        </label>
        <p className="text-xs text-muted-foreground">بعد انتهاء المدة ينتقل الطلب تلقائيًا إلى سائق ACTIVE آخر من نفس المطعم.</p>
      </div>
      <Button className="w-full sm:w-auto" onClick={() => updateSettings.mutate({ data: { whatsappEnabled: enabled, driverResponseTimeoutSeconds: timeoutSeconds } })} disabled={updateSettings.isPending}>حفظ الإعدادات</Button>
    </CardContent></Card>
  </div>;
}