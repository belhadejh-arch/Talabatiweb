import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mail, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { type Write } from './admin-ui';

type GmailStatus = {
  configured: boolean;
  missingConfiguration?: string[];
  connected: boolean;
  email: string | null;
  connectedAt: string | null;
  diagnostics?: {
    hasPublicApiUrl: boolean;
    isHttps: boolean;
  };
};

type EmailDelivery = {
  id: number;
  orderId: number;
  assignmentId: number;
  driverId: number;
  driverEmail: string;
  status: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED';
  sentAt: string | null;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  error: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
};

const deliveryStatusLabel: Record<EmailDelivery['status'], string> = {
  PENDING: 'بانتظار الإرسال',
  SENDING: 'نتيجة الإرسال غير مؤكدة',
  SENT: 'قبل مزود البريد الإرسال',
  FAILED: 'فشل الإرسال',
};

const deliveryStatusTone: Record<EmailDelivery['status'], string> = {
  PENDING: 'bg-slate-100 text-slate-700',
  SENDING: 'bg-amber-100 text-amber-800',
  SENT: 'bg-emerald-100 text-emerald-800',
  FAILED: 'bg-rose-100 text-rose-800',
};

function deliveryDate(value: string | null) {
  if (!value) return 'غير متوفر';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'غير متوفر';
  return new Intl.DateTimeFormat('ar-LY', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function AdminGmail({ token, write }: { token: string; write: Write }) {
  const status = useQuery({
    queryKey: ['admin', 'gmail'],
    queryFn: () => api.adminRequest<GmailStatus>(token, '/api/admin/gmail/status'),
    enabled: !!token,
    retry: 1,
    refetchInterval: 10_000,
  });
  const deliveries = useQuery({
    queryKey: ['admin', 'gmail', 'deliveries'],
    queryFn: () => api.adminRequest<{ deliveries: EmailDelivery[] }>(
      token,
      '/api/admin/email-deliveries?status=ALL',
    ),
    enabled: !!token,
    retry: 1,
    refetchInterval: 15_000,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function connect() {
    const popup = window.open('', 'talabat-gmail-auth', 'width=540,height=720');
    if (popup) popup.opener = null;
    setBusy(true);
    setError('');
    try {
      const result = await write<{ authorizationUrl: string }>('/api/admin/gmail/connect', 'POST', {});
      if (popup && !popup.closed) popup.location.replace(result.authorizationUrl);
      else window.location.assign(result.authorizationUrl);
    } catch (cause) {
      popup?.close();
      setError(cause instanceof Error ? cause.message : 'تعذّر بدء ربط Gmail.');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm('هل تريد فصل حساب Gmail؟ ستعود الرسائل إلى طريقة SMTP القديمة.')) return;
    setBusy(true);
    setError('');
    try {
      await write('/api/admin/gmail/connection', 'DELETE');
      await status.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر فصل Gmail.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="space-y-4">
    <div className="admin-inline-card flex items-start justify-between gap-5 flex-wrap">
      <div className="flex items-start gap-4">
        <span className="metric-icon"><Mail size={20}/></span>
        <div>
          <h3>إرسال طلبات السائقين عبر Gmail</h3>
          <p className="subtle text-sm mt-1">يُرسل الطلب الفعلي إلى بريد السائق المسجّل عبر Gmail API. يلزم ربط حساب الإرسال المركزي هنا؛ تأكيد السائق لبريده يثبت العنوان فقط.</p>
          {status.isLoading ? <p className="subtle text-sm mt-3">جارٍ التحقق من حالة الربط...</p>
            : status.error ? <p className="text-sm mt-3" role="alert">تعذّر قراءة حالة Gmail. تحقّق من ترحيل قاعدة البيانات ثم أعد المحاولة.</p>
            : status.data?.connected
              ? <p className="text-sm mt-3" role="status">
                متصل بالحساب: <strong>{status.data.email}</strong>
                {!status.data.configured && <span className="block">إعداد Google OAuth على الخادم ناقص؛ لن يكتمل الإرسال حتى يُضبط.</span>}
              </p>
              : <p className="subtle text-sm mt-3" role="status">
                {status.data?.configured
                  ? 'Gmail غير مربوط بعد. اربط حساب الإرسال نفسه لتفعيل الإرسال عبر HTTPS.'
                  : 'إعداد إرسال Gmail على Render غير مكتمل؛ سيعرض زر الربط الإعدادات المطلوبة.'}
              </p>}
          {!!status.data?.missingConfiguration?.length && <p className="text-sm mt-2" role="alert">
            يلزم ضبط: <span dir="ltr">{status.data.missingConfiguration.join('، ')}</span>
          </p>}
          {status.data?.diagnostics && (
            <p className="subtle text-xs mt-2" data-testid="status-public-api-diagnostics">
              تشخيص الخادم: {status.data.diagnostics.hasPublicApiUrl ? 'PUBLIC_API_URL متوفر' : 'PUBLIC_API_URL غير موجود'} • {status.data.diagnostics.isHttps ? 'HTTPS صالح' : 'ليس برابط HTTPS'}
            </p>
          )}
          {error && <p className="text-sm mt-2" role="alert">{error}</p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="admin-action" onClick={() => void status.refetch()} disabled={busy}>تحديث الحالة</button>
        <button type="button" className="admin-action"
          onClick={() => void connect()} disabled={busy}>
          {status.data?.connected ? 'إعادة ربط Gmail' : 'ربط Gmail'}
        </button>
        {status.data?.connected && <button type="button" className="admin-action"
          onClick={() => void disconnect()} disabled={busy}>فصل الحساب</button>}
      </div>
    </div>

    <section className="admin-inline-card flex flex-col items-stretch gap-4" aria-labelledby="admin-email-deliveries-title">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 id="admin-email-deliveries-title">سجل إرسال الطلبات إلى السائقين</h3>
          <p className="subtle text-sm mt-1">يعرض آخر محاولات الإرسال وحالة كل رسالة. لا تُعد حالة SENT ضماناً لوصولها إلى صندوق الوارد.</p>
        </div>
        <button type="button" className="admin-action flex items-center gap-2"
          onClick={() => void deliveries.refetch()} disabled={deliveries.isFetching}>
          <RefreshCw size={15} aria-hidden="true"/>
          تحديث السجل
        </button>
      </div>

      {deliveries.isLoading ? <p className="subtle text-sm" role="status">جارٍ تحميل سجل الإرسال...</p>
        : deliveries.error ? <div className="text-sm" role="alert">
          تعذّر تحميل سجل الإرسال: {(deliveries.error as Error).message}
        </div>
        : deliveries.data?.deliveries.length ? <div className="grid gap-3">
          {deliveries.data.deliveries.slice(0, 25).map(delivery => <article
            key={delivery.id}
            className="rounded-xl border border-border/60 p-3"
            data-testid={`card-email-delivery-${delivery.id}`}
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <strong>طلب #{delivery.orderId}</strong>
                <span className="subtle text-sm mx-2">محاولة #{delivery.assignmentId}</span>
                <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${deliveryStatusTone[delivery.status]}`}>
                  {deliveryStatusLabel[delivery.status]}
                </span>
              </div>
              <time className="subtle text-xs" dateTime={delivery.updatedAt}>
                آخر تحديث: {deliveryDate(delivery.updatedAt)}
              </time>
            </div>
            <p className="text-sm mt-2">
              المستلم: <bdi dir="ltr">{delivery.driverEmail}</bdi>
              <span className="subtle mx-2">· محاولات الإرسال: {delivery.retryCount}</span>
            </p>
            {delivery.lastAttemptAt && <p className="subtle text-xs mt-1">آخر محاولة: {deliveryDate(delivery.lastAttemptAt)}</p>}
            {delivery.error && <p className="text-sm mt-2 break-words" role="alert" dir="auto">
              سبب الإرسال المسجل: {delivery.error}
            </p>}
            <p className="subtle text-xs mt-2">
              {delivery.status === 'SENDING'
                ? 'النتيجة ملتبسة؛ افحص Gmail Sent قبل أي إجراء يدوي.'
                : delivery.status === 'SENT'
                  ? 'قبل مزود البريد الرسالة؛ افحص الوارد والرسائل غير المرغوب فيها إذا لم تظهر.'
                  : delivery.status === 'FAILED'
                    ? 'راجع سبب الفشل قبل محاولة أي إجراء يدوي.'
                    : 'لم تبدأ محاولة الإرسال بعد.'}
            </p>
          </article>)}
        </div>
        : <p className="subtle text-sm" data-testid="status-email-deliveries-empty">
          لا توجد محاولات إرسال مسجلة بعد. أرسل طلبًا جديدًا من واجهة الزبون ثم حدّث السجل.
        </p>}
    </section>
  </div>;
}