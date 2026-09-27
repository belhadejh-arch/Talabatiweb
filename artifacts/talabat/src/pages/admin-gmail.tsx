import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { api } from '../lib/api';
import { type Write } from './admin-ui';

type GmailStatus = {
  configured: boolean;
  missingConfiguration?: string[];
  connected: boolean;
  email: string | null;
  connectedAt: string | null;
};

export default function AdminGmail({ token, write }: { token: string; write: Write }) {
  const status = useQuery({
    queryKey: ['admin', 'gmail'],
    queryFn: () => api.adminRequest<GmailStatus>(token, '/api/admin/gmail/status'),
    enabled: !!token,
    retry: 1,
    refetchInterval: 10_000,
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

  return <div className="admin-inline-card flex items-start justify-between gap-5 flex-wrap">
    <div className="flex items-start gap-4">
      <span className="metric-icon"><Mail size={20}/></span>
      <div>
        <h3>إرسال طلبات السائقين عبر Gmail</h3>
        <p className="subtle text-sm mt-1">يُرسل الطلب إلى بريد السائق المسجّل عبر Gmail API، من دون منفذ SMTP.</p>
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
  </div>;
}