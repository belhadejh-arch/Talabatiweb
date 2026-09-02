import { useEffect, useState } from "react";
import { useChangeEmail, useChangePassword, useGetSettings, useUpdateSettings, getBaseUrl } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type SessionConfig = {
  apiKeyConfigured: boolean;
  apiUrlConfigured: boolean;
  apiUrl: string;
  sessionId: string | null;
};

type SessionRow = {
  sessionId: string;
  phoneNumber: string;
  status: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function providerStatus(value: unknown): string {
  const root = asRecord(value);
  const data = asRecord(root.data);
  return String(data.status ?? root.status ?? "غير معروف");
}

function findString(value: unknown, keys: string[], depth = 0): string {
  if (depth > 4) return "";
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findString(item, keys, depth + 1);
      if (found) return found;
    }
    return "";
  }
  const record = asRecord(value);
  for (const key of keys) {
    if (typeof record[key] === "string" && record[key].trim()) return record[key].trim();
  }
  for (const nested of Object.values(record)) {
    const found = findString(nested, keys, depth + 1);
    if (found) return found;
  }
  return "";
}

function parseSessionRows(value: unknown): SessionRow[] {
  const data = asRecord(value).data;
  if (!Array.isArray(data)) return [];
  return data.map(item => {
    const row = asRecord(item);
    return {
      sessionId: String(row.session_id ?? row.sessionId ?? ""),
      phoneNumber: String(row.phone_number ?? row.phoneNumber ?? "—"),
      status: String(row.status ?? "غير معروف"),
    };
  }).filter(row => row.sessionId);
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
  const [connectedPhone, setConnectedPhone] = useState("—");
  const [sessionRows, setSessionRows] = useState<SessionRow[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [sessionResult, setSessionResult] = useState<unknown>(null);
  const [sessionBusy, setSessionBusy] = useState(false);
  const base = getBaseUrl() ?? "";
  const enabled = whatsappEnabled ?? settings?.whatsappEnabled ?? false;
  const timeoutSeconds = driverTimeout ?? settings?.driverResponseTimeoutSeconds ?? 180;
  const sessionResultText = sessionResult ? JSON.stringify(sessionResult, null, 2) : "";

  const readResponse = async (path: string): Promise<unknown> => {
    const response = await fetch(`${base}${path}`, { credentials: "include" });
    const text = await response.text();
    let body: unknown = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!response.ok) throw new Error(asRecord(body).error ? String(asRecord(body).error) : "تعذر قراءة بيانات WP Sender");
    return body;
  };

  const loadSession = async () => {
    try {
      const config = await readResponse("/api/wp-sender/session") as SessionConfig;
      setSessionConfig(config);
      setSessionRows([]);
      if (!config.sessionId) {
        setSessionStatus("لم تُنشأ جلسة بعد");
        setConnectedPhone("—");
        setQrDataUrl("");
        return;
      }
      const [statusResult, detailsResult, qrResult, listResult] = await Promise.allSettled([
        readResponse("/api/wp-sender/session/status"),
        readResponse("/api/wp-sender/session/details"),
        readResponse("/api/wp-sender/session/qr?output=base64"),
        readResponse("/api/wp-sender/sessions"),
      ]);
      if (statusResult.status === "fulfilled") setSessionStatus(providerStatus(statusResult.value));
      if (detailsResult.status === "fulfilled") {
        setConnectedPhone(findString(detailsResult.value, ["phone_number", "phoneNumber", "number"]) || "—");
      }
      if (listResult.status === "fulfilled") setSessionRows(parseSessionRows(listResult.value));
      if (qrResult.status === "fulfilled") {
        const dataUrl = findString(qrResult.value, ["dataUrl", "dataURL", "qrCode", "qr"]);
        setQrDataUrl(dataUrl.startsWith("data:image/") ? dataUrl : "");
      }
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
        <p>يقرأ الخادم مفتاح WP_SENDER_API_KEY من Replit Secrets. عنوان الإنتاج مأخوذ من `servers` في توثيق WP Sender، وSession ID يُحفظ تلقائيًا في PostgreSQL بعد إنشاء الجلسة.</p>
      </div>
      <div className="grid gap-2 rounded-md border p-3 text-sm">
        <div className="flex justify-between gap-4"><span>API Key</span><strong>{sessionConfig?.apiKeyConfigured ? "مُكوّن" : "غير مُكوّن"}</strong></div>
        <div className="flex justify-between gap-4"><span>API URL</span><span dir="ltr" className="text-left">{sessionConfig?.apiUrl || "—"}</span></div>
        <div className="flex justify-between gap-4"><span>Session ID</span><strong dir="ltr">{sessionConfig?.sessionId || "لم تُنشأ جلسة"}</strong></div>
        <div className="flex justify-between gap-4"><span>حالة WhatsApp Session</span><strong>{sessionStatus}</strong></div>
        <div className="flex justify-between gap-4"><span>رقم WhatsApp المتصل</span><strong dir="ltr">{connectedPhone}</strong></div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => void loadSession()} disabled={sessionBusy}>فحص الاتصال</Button>
        <Button type="button" variant="outline" onClick={() => void sessionAction("/api/wp-sender/session/create")} disabled={sessionBusy || Boolean(sessionConfig?.sessionId)}>إنشاء جلسة</Button>
        <Button type="button" variant="outline" onClick={() => void sessionAction("/api/wp-sender/session/reconnect")} disabled={sessionBusy}>إعادة الاتصال</Button>
      </div>
      {qrDataUrl && <div className="rounded-md border p-4 text-center"><p className="mb-3 font-medium">QR Code لربط WhatsApp</p><img src={qrDataUrl} alt="WP Sender WhatsApp QR Code" className="mx-auto h-64 w-64" /></div>}
      {sessionRows.length > 0 && <div className="space-y-2"><h3 className="font-semibold">الجلسات الموجودة</h3><div className="overflow-x-auto rounded-md border"><table className="w-full text-sm"><thead><tr className="border-b text-right"><th className="p-2">Session ID</th><th className="p-2">الرقم</th><th className="p-2">الحالة</th></tr></thead><tbody>{sessionRows.map(row => <tr key={row.sessionId} className="border-b last:border-0"><td dir="ltr" className="p-2">{row.sessionId}</td><td dir="ltr" className="p-2">{row.phoneNumber}</td><td className="p-2">{row.status}</td></tr>)}</tbody></table></div></div>}
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