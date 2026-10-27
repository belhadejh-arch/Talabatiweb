import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Check, LogOut, MailCheck, Receipt, RefreshCw, ShieldCheck, Truck } from 'lucide-react';
import { Form } from '@/components/ui/form';
import { useDriverGmailStatus, useDriverOrders } from '../hooks/use-driver';
import { api, ApiError, dateLabel, money, CURRENCY, type DriverIdentity, type DriverOrder, type Order } from '../lib/api';
import { InvoiceDialog } from './admin-ui';
import './driver.css';

type DriverSession = { token: string; driver: DriverIdentity };
const storageKey = 'talabat-driver-session';
const normalizeDigits = (value: string) => value.replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x6f0));

function savedSession(): DriverSession | null {
  try {
    const value = sessionStorage.getItem(storageKey);
    if (!value) return null;
    const parsed = JSON.parse(value) as DriverSession;
    return typeof parsed.token === 'string' && parsed.token.length > 0 && typeof parsed.driver?.id === 'number' && typeof parsed.driver?.name === 'string'
      ? parsed : null;
  } catch { return null; }
}

function emailStatusLabel(status: string | null | undefined) {
  return ({
    PENDING: 'البريد بانتظار الإرسال',
    SENDING: 'جارٍ إرسال البريد',
    SENT: 'تم قبول إرسال الرسالة إلى بريدك',
    FAILED: 'فشل الإرسال؛ تجري إعادة المحاولة'
  } as Record<string, string>)[String(status || '').toUpperCase()] || 'لم تُسجل حالة البريد';
}

function emailStatusTone(status: string | null | undefined) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'SENT') return 'email-sent';
  if (normalized === 'FAILED') return 'email-failed';
  return 'email-pending';
}

function OrderCard({
  order,
  index,
  onInvoice
}: {
  order: DriverOrder;
  index: number;
  onInvoice: (order: DriverOrder) => void;
}) {
  const assignmentStatus = order.assignmentStatus?.toUpperCase();
  const isAccepted = assignmentStatus === 'ACCEPTED';

  return <article className="driver-order" data-testid={`card-driver-order-${order.id}-${index}`}>
    <div className="driver-order-head">
      <div><div className="driver-order-id"><Receipt size={18} aria-hidden="true"/><span dir="ltr">{order.invoiceNumber}</span></div><time className="driver-order-time" dateTime={order.createdAt}>{dateLabel(order.createdAt)}</time></div>
      <div className="driver-order-badges">
        <span className={`driver-badge ${isAccepted ? 'accepted' : 'pending'}`} data-testid={`status-driver-assignment-${order.id}-${index}`}>{isAccepted ? 'تم القبول عبر البريد' : 'بانتظار ردك عبر البريد'}</span>
        {order.currentDriverEmailStatus && <span className={`driver-badge ${emailStatusTone(order.currentDriverEmailStatus)}`} data-testid={`status-driver-email-${order.id}-${index}`}>{emailStatusLabel(order.currentDriverEmailStatus)}</span>}
      </div>
    </div>
    <div className="driver-order-body">
      <div className="driver-order-restaurant" data-testid={`text-driver-restaurant-${order.id}-${index}`}>{order.restaurantName || 'المطعم غير محدد'}</div>
      <div className="driver-order-summary">{order.orderType === 'RESERVATION' ? 'فاتورة حجز' : 'فاتورة توصيل'} · الطلب #{order.orderNumber ?? order.id}</div>
    </div>
    <div className="driver-order-foot flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border/40">
      <div className="flex items-center gap-3">
        <strong data-testid={`text-driver-total-${order.id}-${index}`}><span dir="ltr">{money(order.totalAmount)}</span> {CURRENCY}</strong>
        <button
          type="button"
          onClick={() => onInvoice(order)}
          className="btn btn-outline text-xs px-2.5 py-1 flex items-center gap-1.5 border-primary/40 text-primary hover:bg-primary/10 rounded-lg"
          data-testid={`button-driver-invoice-${order.id}`}
        >
          <Receipt size={13}/>
          <span>عرض الفاتورة</span>
        </button>
      </div>
    </div>
  </article>;
}

function LoadingCards() {
  return <div className="driver-list" role="status" aria-label="جارٍ تحميل الفواتير">{[0, 1, 2].map(item => <div className="driver-loading" key={item}><div className="driver-skeleton" style={{ width: '32%' }}/><div className="driver-skeleton" style={{ width: '75%' }}/><div className="driver-skeleton" style={{ width: '58%' }}/></div>)}</div>;
}

export default function Driver() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<DriverSession | null>(savedSession);
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<DriverOrder | null>(null);
  const form = useForm<{ serialNumber: string }>({ defaultValues: { serialNumber: '' } });
  const token = session?.token || null;
  const ordersQuery = useDriverOrders(token);
  const gmailQuery = useDriverGmailStatus(token);

  function logout() {
    sessionStorage.removeItem(storageKey);
    setSession(null);
    setConnectError('');
    form.reset();
    void queryClient.cancelQueries({ queryKey: ['driver'] }).then(() => queryClient.removeQueries({ queryKey: ['driver'] }));
  }

  useEffect(() => {
    const errors = [ordersQuery.error, gmailQuery.error];
    if (token && errors.some(error => error instanceof ApiError && error.status === 401)) logout();
  }, [ordersQuery.error, gmailQuery.error, token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!token) return;
    const sendLocation = () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = Number(pos.coords.latitude.toFixed(6));
            const lng = Number(pos.coords.longitude.toFixed(6));
            api.driverUpdateLocation(token, lat, lng).catch(() => {});
          },
          () => {},
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      }
    };
    sendLocation();
    const interval = setInterval(sendLocation, 60000);
    return () => clearInterval(interval);
  }, [token]);

  async function login(values: { serialNumber: string }) {
    setLoggingIn(true);
    setLoginError('');
    try {
      const result = await api.driverLogin(normalizeDigits(values.serialNumber.trim()));
      if (!result.token || !result.driver) throw new Error('تعذّر التحقق من بيانات السائق.');
      const next = { token: result.token, driver: result.driver };
      sessionStorage.setItem(storageKey, JSON.stringify(next));
      setSession(next);
      form.reset();
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = Number(pos.coords.latitude.toFixed(6));
            const lng = Number(pos.coords.longitude.toFixed(6));
            api.driverUpdateLocation(result.token, lat, lng).catch(() => {});
          },
          () => {},
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      }
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'تعذّر تسجيل الدخول. حاول مرة أخرى.');
    } finally { setLoggingIn(false); }
  }

  async function connectGmail() {
    if (!token) return;
    const popup = window.open('', 'talabat-driver-gmail-auth', 'width=540,height=720');
    if (popup) popup.opener = null;
    setConnecting(true);
    setConnectError('');
    try {
      const { authorizationUrl } = await api.driverGmailConnect(token);
      const url = new URL(authorizationUrl, window.location.origin);
      if (url.origin !== 'https://accounts.google.com') throw new Error('رابط التحقق غير صالح.');
      if (popup && !popup.closed) popup.location.replace(url.href);
      else window.location.assign(url.href);
    } catch (error) {
      popup?.close();
      if (error instanceof ApiError && error.status === 401) { logout(); return; }
      setConnectError(error instanceof Error ? error.message : 'تعذّر بدء التحقق. أعد المحاولة.');
      setConnecting(false);
    }
  }

  if (!session) return <div className="driver-page driver-login" dir="rtl">
    <div className="driver-login-art">
      <div className="driver-brand"><span className="driver-brand-mark">T</span><span>طلبات</span><span className="driver-brand-divider"/><span className="driver-brand-caption">مساحة السائق</span></div>
      <div><div className="driver-kicker"><Truck size={17}/> لكل رحلة حسابها</div><h1>طلباتك.<br/><em>على مسارك.</em></h1></div>
      <p>TALABAT / DRIVER WORKSPACE</p>
    </div>
    <main className="driver-login-form-area"><div className="driver-login-card">
      <div className="driver-login-icon"><ShieldCheck size={25}/></div>
      <h2>أهلاً بك في المساحة.</h2>
      <p>أدخل رقمك التسلسلي المكوّن من ٦ أرقام لعرض فواتيرك.</p>
      <Form {...form}><form onSubmit={form.handleSubmit(login)}>
        <label htmlFor="driver-serial">الرقم التسلسلي للسائق</label>
        <input id="driver-serial" dir="ltr" autoComplete="off" inputMode="numeric" maxLength={6} placeholder="000000" aria-invalid={!!loginError} data-testid="input-driver-serial" {...form.register('serialNumber', { required: true, validate: value => /^\d{6}$/.test(normalizeDigits(value)) })}/>
        {form.formState.errors.serialNumber && <div className="driver-error" role="alert" style={{ marginTop: 12, padding: 12 }}>أدخل ٦ أرقام بالضبط.</div>}
        {loginError && <div className="driver-error" role="alert" style={{ marginTop: 12, padding: 12 }} data-testid="status-driver-login-error">{loginError}</div>}
        <button type="submit" disabled={loggingIn} data-testid="button-driver-login">{loggingIn ? 'جارٍ التحقق...' : <>الدخول إلى طلباتي <ArrowLeft size={17}/></>}</button>
      </form></Form>
      <div className="driver-login-note">هذه المساحة مخصّصة للسائقين فقط. ليس لديك رقم تسلسلي؟ تواصل مع مسؤول المطعم.<br/><Link href="/" data-testid="link-driver-home">العودة إلى طلبات</Link></div>
    </div></main>
  </div>;

  const invoiceOrders = ordersQuery.data?.orders || [];
  const gmail = gmailQuery.data;
  const gmailVerified = !!gmail?.connected;

  return <div className="driver-page" dir="rtl">
    <header className="driver-top">
      <div className="driver-shell driver-nav">
        <div className="driver-brand"><span className="driver-brand-mark">T</span><span>طلبات</span><span className="driver-brand-divider"/><span className="driver-brand-caption">مساحة السائق</span></div>
        <div className="driver-nav-actions">
          <button type="button" className="driver-header-button" title="تحديث الفواتير" aria-label="تحديث الفواتير" disabled={ordersQuery.isFetching || gmailQuery.isFetching} onClick={() => { void Promise.all([ordersQuery.refetch(), gmailQuery.refetch()]); }} data-testid="button-driver-refresh"><RefreshCw size={16}/><span>تحديث</span></button>
          <button type="button" className="driver-header-button" title="تسجيل الخروج" aria-label="تسجيل الخروج" onClick={logout} data-testid="button-driver-logout"><LogOut size={16}/><span>خروج</span></button>
        </div>
      </div>
      <div className="driver-shell driver-intro">
        <div className="driver-kicker"><Truck size={17}/> لوحة السائق / طلباتي وفواتيري</div>
        <h1>مسارك يبدأ من هنا.</h1>
        <p>تعرض هذه المساحة الفواتير فقط. تفاصيل الطلب وروابط القبول والرفض تصلك عبر البريد الإلكتروني المسجّل.</p>
        <div className="driver-identity"><div className="driver-avatar" aria-hidden="true">{session.driver.name.trim().charAt(0) || 'س'}</div><div><strong data-testid="text-driver-name">{session.driver.name}</strong><span data-testid="text-driver-email">{gmail?.registeredEmail ?? session.driver.email}</span></div></div>
      </div>
    </header>
    <main className="driver-shell driver-main">
      <div className="driver-content-grid">
        <section aria-labelledby="driver-orders-title">
          <div className="driver-section-heading"><div><h2 id="driver-orders-title">فواتير الطلبات المسندة إليك</h2><p>تظهر الفاتورة فور إسناد طلب حقيقي إليك. القبول والرفض عبر البريد فقط.</p></div>{ordersQuery.dataUpdatedAt > 0 && <span className="driver-updated" data-testid="text-driver-updated">آخر تحديث {new Intl.DateTimeFormat('ar', { hour: 'numeric', minute: '2-digit' }).format(ordersQuery.dataUpdatedAt)}</span>}</div>
          <div id="driver-order-list" role="tabpanel" aria-live="polite">
              {ordersQuery.isLoading ? <LoadingCards/> : ordersQuery.error ? <div className="driver-error" role="alert" data-testid="status-driver-orders-error">تعذّر تحميل الفواتير: {(ordersQuery.error as Error).message}<br/><button type="button" className="driver-retry" onClick={() => void ordersQuery.refetch()} data-testid="button-driver-orders-retry"><RefreshCw size={15}/> إعادة المحاولة</button></div> : invoiceOrders.length ? <div className="driver-list">{invoiceOrders.map((order, index) => <OrderCard key={`${order.id}-${order.assignmentStatus}-${index}`} order={order} index={index} onInvoice={o => setSelectedInvoice(o)}/>)}</div> : <div className="driver-empty" data-testid="status-driver-orders-empty"><Receipt size={30}/><h3>لا توجد فواتير بعد</h3><p>ستظهر هنا الطلبات الحقيقية المسندة إليك. تفاصيل الطلب وروابط القبول والرفض تصلك عبر البريد.</p></div>}
          </div>
        </section>
        <aside className="driver-side" aria-label="إعدادات السائق ومعلومات الحالات">
          <section className="driver-panel" aria-labelledby="driver-gmail-title">
            <div className="driver-panel-icon"><MailCheck size={22}/></div>
            <h2 id="driver-gmail-title">البريد المسجّل لاستلام الطلبات</h2>
            <p>تُرسل تفاصيل الطلب إلى هذا العنوان. توثيق Gmail من هذه الصفحة اختياري ويثبت ملكية البريد فقط؛ الإرسال الفعلي يعتمد على حساب Gmail المركزي في إعدادات المشرف.</p>
            <div className="driver-gmail-address"><span>البريد المسجّل</span><strong dir="ltr" data-testid="text-driver-registered-email">{gmail?.registeredEmail || session.driver.email}</strong></div>
            {gmailQuery.isLoading ? <div className="driver-skeleton" role="status" aria-label="جارٍ فحص حالة البريد" style={{ height: 38, width: '100%', marginTop: 16 }}/> : gmailQuery.error ? <div className="driver-error" role="alert" style={{ marginTop: 14, padding: 12 }} data-testid="status-driver-gmail-error">تعذّر فحص حالة Gmail: {(gmailQuery.error as Error).message}<br/><button type="button" className="driver-retry" onClick={() => void gmailQuery.refetch()} data-testid="button-driver-gmail-retry">إعادة المحاولة</button></div> : gmailVerified ? <div className="driver-inline-status" data-testid="status-driver-gmail-connected"><Check size={17}/> تم تأكيد ملكية بريدك <span dir="ltr">{gmail.email}</span></div> : <>
              {!gmail?.configured && <p data-testid="status-driver-gmail-unconfigured">إعداد Google على الخادم غير مكتمل. اطلب من الإدارة ضبط: <span dir="ltr">{gmail?.missingConfiguration?.join('، ') || 'إعدادات OAuth في Render'}</span></p>}
              {!gmail?.connected && <button type="button" className="driver-connect" disabled={connecting} onClick={() => void connectGmail()} data-testid="button-driver-gmail-connect"><MailCheck size={17}/>{connecting ? 'جارٍ فتح التحقق...' : 'توثيق ملكية البريد (اختياري)'}</button>}
            </>}
            {connectError && <div className="driver-error" role="alert" style={{ marginTop: 12, padding: 12 }} data-testid="status-driver-gmail-connect-error">{connectError}</div>}
            <div className="driver-caveat"><strong>مهم:</strong> مساحة السائق تعرض الفاتورة فقط فور إسناد الطلب. تفاصيل الطلب وموقع التوصيل وروابط القبول أو الرفض تصل إلى بريدك المسجّل؛ راجع حالة الإرسال إذا لم تصلك الرسالة.</div>
          </section>
          <section className="driver-panel" aria-labelledby="driver-guide-title">
            <div className="driver-mini-title">طريقة الرد</div><h2 id="driver-guide-title">القبول والرفض عبر البريد</h2>
            <p>افتح رسالة الطلب في بريدك، راجع التفاصيل والموقع، ثم استخدم زر القبول أو الرفض داخل الرسالة. لا توجد أزرار قرار داخل لوحة السائق.</p>
          </section>
        </aside>
      </div>
    </main>

    <InvoiceDialog
      open={!!selectedInvoice}
      onClose={() => setSelectedInvoice(null)}
      order={selectedInvoice as unknown as Order}
      audience="driver"
    />
  </div>;
}