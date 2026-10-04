import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Check, CheckCircle2, ClipboardList, Clock3, LogOut, MailCheck, PackageCheck, RefreshCw, ShieldCheck, Truck, XCircle, Receipt, ThumbsUp, ThumbsDown } from 'lucide-react';
import { Form } from '@/components/ui/form';
import { useDriverGmailStatus, useDriverOrders, useDriverStats } from '../hooks/use-driver';
import { api, ApiError, dateLabel, money, statusLabel, CURRENCY, type DriverIdentity, type DriverOrder, type Order } from '../lib/api';
import { InvoiceDialog } from './admin-ui';
import './driver.css';

type DriverSession = { token: string; driver: DriverIdentity };
type OrderTab = 'all' | 'accepted' | 'invoices' | 'rejected' | 'cancelled';
const storageKey = 'talabat-driver-session';
const arabicNumber = (number: number) => new Intl.NumberFormat('ar').format(number);
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

function attemptLabel(status: string | null | undefined) {
  return ({
    ACCEPTED: 'تم قبول الطلب',
    REJECTED: 'تم رفض الطلب',
    CANCELLED: 'أُلغي الطلب',
    TIMEOUT: 'انتهت المهلة وتحول الطلب تلقائياً',
    PENDING: 'طلب جديد بانتظار ردك',
    SENT: 'طلب جديد بانتظار ردك',
    AWAITING_EMAIL: 'بانتظار التحقق'
  } as Record<string, string>)[String(status || '').toUpperCase()] || 'حالة الطلب غير محددة';
}

function attemptTone(status: string | null | undefined) {
  return ({ ACCEPTED: 'accepted', REJECTED: 'rejected', CANCELLED: 'cancelled' } as Record<string, string>)[String(status || '').toUpperCase()] || 'pending';
}

function OrderCard({
  order,
  index,
  onInvoice,
  onRespond
}: {
  order: DriverOrder;
  index: number;
  onInvoice: (order: DriverOrder) => void;
  onRespond?: (orderId: number, decision: 'ACCEPTED' | 'REJECTED') => Promise<void>;
}) {
  const cancelled = order.status?.toUpperCase() === 'CANCELLED';
  const isAccepted = order.assignmentStatus?.toUpperCase() === 'ACCEPTED';
  const isPending = order.assignmentStatus?.toUpperCase() === 'PENDING' || order.assignmentStatus?.toUpperCase() === 'SENT';
  const [responding, setResponding] = useState(false);

  const handleAction = async (decision: 'ACCEPTED' | 'REJECTED') => {
    if (!onRespond) return;
    setResponding(true);
    try {
      await onRespond(order.id, decision);
    } finally {
      setResponding(false);
    }
  };

  return <article className="driver-order" data-testid={`card-driver-order-${order.id}-${index}`}>
    <div className="driver-order-head">
      <div><div className="driver-order-id"><ClipboardList size={18} aria-hidden="true"/><span dir="ltr">#{order.id}</span></div><time className="driver-order-time" dateTime={order.createdAt}>{dateLabel(order.createdAt)}</time></div>
      <div className="driver-order-badges">
        <span className={`driver-badge ${attemptTone(order.assignmentStatus)}`} data-testid={`status-driver-assignment-${order.id}-${index}`}>{attemptLabel(order.assignmentStatus)}</span>
        <span className={`driver-badge ${cancelled ? 'cancelled' : ''}`} data-testid={`status-driver-order-${order.id}-${index}`}>الطلب: {statusLabel(order.status)}</span>
      </div>
    </div>
    <div className="driver-order-body">
      <div className="driver-order-restaurant" data-testid={`text-driver-restaurant-${order.id}-${index}`}>{order.restaurantName || 'المطعم غير محدد'}</div>
      <div className="driver-order-summary">{order.orderType === 'RESERVATION' ? 'حجز' : 'توصيل'} · {order.itemsSummary || 'لا توجد تفاصيل أصناف متاحة'}</div>
      {order.notes && <div className="driver-order-notes"><strong>ملاحظة العميل:</strong> {order.notes}</div>}
    </div>
    <div className="driver-order-foot flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border/40">
      <div><span>العميل: {order.customerName}</span>{order.customerPhone && <> · <a href={`tel:${order.customerPhone}`} dir="ltr" data-testid={`link-driver-call-${order.id}-${index}`}>{order.customerPhone}</a></>}</div>
      <div className="flex items-center gap-3">
        <strong data-testid={`text-driver-total-${order.id}-${index}`}><span dir="ltr">{money(order.totalAmount)}</span> {CURRENCY}</strong>
        
        {isPending && onRespond && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={responding}
              onClick={() => handleAction('ACCEPTED')}
              className="btn btn-primary text-xs px-2.5 py-1 flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow-sm"
              data-testid={`button-driver-accept-${order.id}`}
            >
              <ThumbsUp size={13}/>
              <span>قبول الطلب</span>
            </button>
            <button
              type="button"
              disabled={responding}
              onClick={() => handleAction('REJECTED')}
              className="btn btn-outline text-xs px-2.5 py-1 flex items-center gap-1 border-rose-300 text-rose-600 hover:bg-rose-50 rounded-lg"
              title="رفض الطلب ليحوّله النظام تلقائياً للسائق التالي"
              data-testid={`button-driver-reject-${order.id}`}
            >
              <ThumbsDown size={13}/>
              <span>رفض الطلب</span>
            </button>
          </div>
        )}

        {isAccepted && (
          <button
            type="button"
            onClick={() => onInvoice(order)}
            className="btn btn-outline text-xs px-2.5 py-1 flex items-center gap-1.5 border-primary/40 text-primary hover:bg-primary/10 rounded-lg"
            data-testid={`button-driver-invoice-${order.id}`}
          >
            <Receipt size={13}/>
            <span>استخراج فاتورة</span>
          </button>
        )}
      </div>
    </div>
  </article>;
}

function LoadingCards() {
  return <div className="driver-list" role="status" aria-label="جارٍ تحميل الطلبات">{[0, 1, 2].map(item => <div className="driver-loading" key={item}><div className="driver-skeleton" style={{ width: '32%' }}/><div className="driver-skeleton" style={{ width: '75%' }}/><div className="driver-skeleton" style={{ width: '58%' }}/></div>)}</div>;
}

export default function Driver() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<DriverSession | null>(savedSession);
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState('');
  const [tab, setTab] = useState<OrderTab>('all');
  const [selectedInvoice, setSelectedInvoice] = useState<DriverOrder | null>(null);
  const form = useForm<{ serialNumber: string }>({ defaultValues: { serialNumber: '' } });
  const token = session?.token || null;
  const ordersQuery = useDriverOrders(token);
  const statsQuery = useDriverStats(token);
  const gmailQuery = useDriverGmailStatus(token);

  function logout() {
    sessionStorage.removeItem(storageKey);
    setSession(null);
    setTab('all');
    setConnectError('');
    form.reset();
    void queryClient.cancelQueries({ queryKey: ['driver'] }).then(() => queryClient.removeQueries({ queryKey: ['driver'] }));
  }

  useEffect(() => {
    const errors = [ordersQuery.error, statsQuery.error, gmailQuery.error];
    if (token && errors.some(error => error instanceof ApiError && error.status === 401)) logout();
  }, [ordersQuery.error, statsQuery.error, gmailQuery.error, token]); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function respondOrder(orderId: number, decision: 'ACCEPTED' | 'REJECTED') {
    if (!token) return;
    try {
      await api.driverRespondOrder(token, orderId, decision);
      await Promise.all([ordersQuery.refetch(), statsQuery.refetch()]);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'تعذّر إرسال الرد.');
    }
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
      <p>أدخل رقمك التسلسلي المكوّن من ٦ أرقام لعرض طلباتك وفواتيرك ومتابعة حالاتها.</p>
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

  const orders = ordersQuery.data?.orders || [];
  const acceptedOrders = orders.filter(order => order.assignmentStatus?.toUpperCase() === 'ACCEPTED');
  const rejectedOrders = orders.filter(order => order.assignmentStatus?.toUpperCase() === 'REJECTED');
  const cancelledOrders = orders.filter(order => order.status?.toUpperCase() === 'CANCELLED' || order.assignmentStatus?.toUpperCase() === 'CANCELLED');

  const filtered = orders.filter(order => {
    if (tab === 'all') return true;
    if (tab === 'accepted') return order.assignmentStatus?.toUpperCase() === 'ACCEPTED';
    if (tab === 'invoices') return order.assignmentStatus?.toUpperCase() === 'ACCEPTED';
    if (tab === 'rejected') return order.assignmentStatus?.toUpperCase() === 'REJECTED';
    if (tab === 'cancelled') return order.status?.toUpperCase() === 'CANCELLED' || order.assignmentStatus?.toUpperCase() === 'CANCELLED';
    return true;
  });

  const counts = {
    all: orders.length,
    accepted: acceptedOrders.length,
    invoices: acceptedOrders.length,
    rejected: rejectedOrders.length,
    cancelled: cancelledOrders.length
  };

  const tabs: { key: OrderTab; label: string }[] = [
    { key: 'all', label: 'جميع الطلبات' },
    { key: 'accepted', label: 'الطلبات المقبولة' },
    { key: 'invoices', label: 'قسم الفواتير' },
    { key: 'rejected', label: 'الطلبات المعتذر عنها' },
    { key: 'cancelled', label: 'الملغاة' }
  ];

  const gmail = gmailQuery.data;
  const gmailVerified = !!gmail?.connected;

  return <div className="driver-page" dir="rtl">
    <header className="driver-top">
      <div className="driver-shell driver-nav">
        <div className="driver-brand"><span className="driver-brand-mark">T</span><span>طلبات</span><span className="driver-brand-divider"/><span className="driver-brand-caption">مساحة السائق</span></div>
        <div className="driver-nav-actions">
          <button type="button" className="driver-header-button" title="تحديث البيانات" aria-label="تحديث البيانات" disabled={ordersQuery.isFetching || statsQuery.isFetching || gmailQuery.isFetching} onClick={() => { void Promise.all([ordersQuery.refetch(), statsQuery.refetch(), gmailQuery.refetch()]); }} data-testid="button-driver-refresh"><RefreshCw size={16}/><span>تحديث</span></button>
          <button type="button" className="driver-header-button" title="تسجيل الخروج" aria-label="تسجيل الخروج" onClick={logout} data-testid="button-driver-logout"><LogOut size={16}/><span>خروج</span></button>
        </div>
      </div>
      <div className="driver-shell driver-intro">
        <div className="driver-kicker"><Truck size={17}/> لوحة السائق / طلباتي وفواتيري</div>
        <h1>مسارك يبدأ من هنا.</h1>
        <p>الطلبات الخاصة بك وإمكانية استخراج الفواتير في مكان واحد. تُحدّث البيانات تلقائياً كل ٣٠ ثانية.</p>
        <div className="driver-identity"><div className="driver-avatar" aria-hidden="true">{session.driver.name.trim().charAt(0) || 'س'}</div><div><strong data-testid="text-driver-name">{session.driver.name}</strong><span data-testid="text-driver-email">{gmail?.registeredEmail ?? session.driver.email}</span></div></div>
      </div>
    </header>
    <main className="driver-shell driver-main">
      <div className="driver-metrics" aria-label="ملخص نشاطك">
        <div className="driver-metric featured"><div className="driver-metric-label"><ClipboardList size={16}/> إجمالي الطلبات</div><strong data-testid="text-driver-total-count">{statsQuery.data ? arabicNumber(statsQuery.data.summary.totalOrders) : statsQuery.isLoading ? '—' : '—'}</strong><small>طلبات وردت إليك</small></div>
        <div className="driver-metric"><div className="driver-metric-label"><CheckCircle2 size={16}/> طلبات مقبولة</div><strong data-testid="text-driver-accepted-count">{statsQuery.data ? arabicNumber(statsQuery.data.summary.accepted) : '—'}</strong><small>طلبات تم قبولها للتوصيل</small></div>
        <div className="driver-metric"><div className="driver-metric-label"><Receipt size={16}/> فواتير جاهزة</div><strong data-testid="text-driver-invoices-count">{statsQuery.data ? arabicNumber(statsQuery.data.summary.accepted) : '—'}</strong><small>فواتير طلبات متاحة للطباعة</small></div>
        <div className="driver-metric"><div className="driver-metric-label"><PackageCheck size={16}/> طلبات ملغاة</div><strong data-testid="text-driver-cancelled-count">{statsQuery.data ? arabicNumber(statsQuery.data.summary.cancelled) : '—'}</strong><small>طلبات أُلغيت من النظام</small></div>
      </div>
      {statsQuery.error && <div className="driver-error" role="alert" style={{ marginTop: 14 }} data-testid="status-driver-stats-error">تعذّر تحميل الإحصاءات: {(statsQuery.error as Error).message}<br/><button type="button" className="driver-retry" onClick={() => void statsQuery.refetch()} data-testid="button-driver-stats-retry">إعادة المحاولة</button></div>}
      <div className="driver-content-grid">
        <section aria-labelledby="driver-orders-title">
          <div className="driver-section-heading"><div><h2 id="driver-orders-title">{tab === 'invoices' ? 'قسم فواتير الطلبات المقبولة' : 'سجل الطلبات'}</h2><p>{tab === 'invoices' ? 'يمكنك استخراج وطباعة فاتورة أي طلب تم قبوله بالدينار الليبي.' : 'يعرض قائمة الطلبات الموجهة لحسابك فقط.'}</p></div>{ordersQuery.dataUpdatedAt > 0 && <span className="driver-updated" data-testid="text-driver-updated">آخر تحديث {new Intl.DateTimeFormat('ar', { hour: 'numeric', minute: '2-digit' }).format(ordersQuery.dataUpdatedAt)}</span>}</div>
          <div className="driver-tabs" role="tablist" aria-label="تصفية الطلبات">{tabs.map(item => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} aria-controls="driver-order-list" className="driver-tab" onClick={() => setTab(item.key)} data-testid={`button-driver-tab-${item.key}`}>{item.label} <span>{arabicNumber(counts[item.key])}</span></button>)}</div>
          <div id="driver-order-list" role="tabpanel" aria-live="polite">
            {ordersQuery.isLoading ? <LoadingCards/> : ordersQuery.error ? <div className="driver-error" role="alert" data-testid="status-driver-orders-error">تعذّر تحميل طلباتك: {(ordersQuery.error as Error).message}<br/><button type="button" className="driver-retry" onClick={() => void ordersQuery.refetch()} data-testid="button-driver-orders-retry"><RefreshCw size={15}/> إعادة المحاولة</button></div> : filtered.length ? <div className="driver-list">{filtered.map((order, index) => <OrderCard key={`${order.id}-${order.assignmentStatus}-${index}`} order={order} index={index} onInvoice={o => setSelectedInvoice(o)} onRespond={respondOrder}/>)}</div> : <div className="driver-empty" data-testid="status-driver-orders-empty"><ClipboardList size={30}/><h3>{tab === 'invoices' ? 'لا توجد فواتير بعد' : tab === 'all' ? 'لا توجد طلبات في سجلك بعد' : 'لا توجد طلبات في هذا القسم'}</h3><p>{tab === 'invoices' ? 'تظهر الفواتير فور قبولك لأي طلب توصيل جديد.' : tab === 'all' ? 'ستظهر هنا طلبات التوصيل الخاصة بك عند وصولها.' : 'جرّب قسمًا آخر، أو حدّث البيانات للتحقق من الجديد.'}</p></div>}
          </div>
        </section>
        <aside className="driver-side" aria-label="إعدادات السائق ومعلومات الحالات">
          <section className="driver-panel" aria-labelledby="driver-gmail-title">
            <div className="driver-panel-icon"><MailCheck size={22}/></div>
            <h2 id="driver-gmail-title">تأكيد بريد Gmail</h2>
            <p>تحقّق من ملكيتك للبريد المسجّل في حساب السائق لتلقي إشعارات الطلبات.</p>
            <div className="driver-gmail-address"><span>البريد المسجّل</span><strong dir="ltr" data-testid="text-driver-registered-email">{gmail?.registeredEmail || session.driver.email}</strong></div>
            {gmailQuery.isLoading ? <div className="driver-skeleton" role="status" aria-label="جارٍ فحص حالة البريد" style={{ height: 38, width: '100%', marginTop: 16 }}/> : gmailQuery.error ? <div className="driver-error" role="alert" style={{ marginTop: 14, padding: 12 }} data-testid="status-driver-gmail-error">تعذّر فحص حالة Gmail: {(gmailQuery.error as Error).message}<br/><button type="button" className="driver-retry" onClick={() => void gmailQuery.refetch()} data-testid="button-driver-gmail-retry">إعادة المحاولة</button></div> : gmailVerified ? <div className="driver-inline-status" data-testid="status-driver-gmail-connected"><Check size={17}/> تم تأكيد ملكية بريدك <span dir="ltr">{gmail.email}</span></div> : <>
              {!gmail?.configured && <p data-testid="status-driver-gmail-unconfigured">إعداد Google على الخادم غير مكتمل. اطلب من الإدارة ضبط: <span dir="ltr">{gmail?.missingConfiguration?.join('، ') || 'إعدادات OAuth في Render'}</span></p>}
              {!gmail?.connected && <button type="button" className="driver-connect" disabled={connecting} onClick={() => void connectGmail()} data-testid="button-driver-gmail-connect"><MailCheck size={17}/>{connecting ? 'جارٍ فتح التحقق...' : 'ربط بريد Gmail الخاص بي'}</button>}
            </>}
            {connectError && <div className="driver-error" role="alert" style={{ marginTop: 12, padding: 12 }} data-testid="status-driver-gmail-connect-error">{connectError}</div>}
            <div className="driver-caveat"><strong>تنبيه الإسناد:</strong> عند تأخرك في قبول أو رفض الطلب خلال المهلة المحددة، يُحول الطلب تلقائياً إلى السائق النشط التالي.</div>
          </section>
          <section className="driver-panel" aria-labelledby="driver-guide-title">
            <div className="driver-mini-title">إرشادات السائق</div><h2 id="driver-guide-title">حالات الطلب والتوصيل</h2>
            <div className="driver-legend" style={{ marginTop: 17 }}>
              <div className="driver-legend-row"><CheckCircle2 size={16} color="#278251"/><span><strong>قبول الطلب:</strong> يمكنك استخراج الفاتورة والبدء في التوصيل.</span></div>
              <div className="driver-legend-row"><Clock3 size={16} color="#a86e32"/><span><strong>مهلة الطلب:</strong> إذا تأخر الرد يُنقل الطلب فوراً للسائق التالي.</span></div>
              <div className="driver-legend-row"><Receipt size={16} color="#4f46e5"/><span><strong>قسم الفواتير:</strong> يمكنك طباعة فاتورة رسمية لكل طلب مقبول.</span></div>
            </div>
          </section>
        </aside>
      </div>
    </main>

    <InvoiceDialog
      open={!!selectedInvoice}
      onClose={() => setSelectedInvoice(null)}
      order={selectedInvoice as unknown as Order}
    />
  </div>;
}