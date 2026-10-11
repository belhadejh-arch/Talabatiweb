import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { CalendarDays, ClipboardList, LogOut, RefreshCw, Receipt, Search, Store, X } from 'lucide-react';
import { driverApprovalLabel, InvoiceDialog } from './admin-ui';
import { api, ApiError, CURRENCY, dateLabel, money, statusLabel, type Order, type RestaurantIdentity } from '../lib/api';
import './restaurant-portal.css';

type RestaurantSession = { token: string; restaurant: RestaurantIdentity };
type ViewFilter = 'all' | 'active' | 'archived';
type StatusFilter = 'all' | 'waiting' | 'accepted' | 'rejected' | 'cancelled' | 'completed';
const storageKey = 'talabat-restaurant-session';
const normalizeDigits = (value: string) => value
  .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660))
  .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x6f0));
const normalizeSearch = (value: string) => normalizeDigits(value)
  .toLocaleLowerCase()
  .normalize('NFD')
  .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
  .replace(/[أإآ]/g, 'ا')
  .replace(/ى/g, 'ي')
  .trim();
const statusGroups: { value: StatusFilter; label: string; statuses: string[] }[] = [
  { value: 'all', label: 'كل الفواتير', statuses: [] },
  { value: 'waiting', label: 'جديدة / بانتظار السائق', statuses: ['NEW', 'PENDING', 'WAITING_FOR_DRIVER', 'ASSIGNED', 'NOT_ASSIGNED', 'TIMEOUT'] },
  { value: 'accepted', label: 'مقبولة / مؤكدة', statuses: ['ACCEPTED', 'CONFIRMED', 'PREPARING', 'READY', 'ON_THE_WAY'] },
  { value: 'rejected', label: 'مرفوضة', statuses: ['REJECTED'] },
  { value: 'cancelled', label: 'ملغاة', statuses: ['CANCELLED'] },
  { value: 'completed', label: 'مكتملة', statuses: ['COMPLETED', 'DELIVERED'] },
];

function readSession(): RestaurantSession | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(storageKey) || 'null') as RestaurantSession | null;
    return parsed && typeof parsed.token === 'string' && typeof parsed.restaurant?.id === 'number'
      ? parsed
      : null;
  } catch { return null; }
}

export default function RestaurantPortalPage() {
  const [session, setSession] = useState<RestaurantSession | null>(readSession);
  const [serialNumber, setSerialNumber] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [filter, setFilter] = useState<ViewFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [portal, setPortal] = useState<Awaited<ReturnType<typeof api.restaurantOverview>> | null>(null);
  const [portalError, setPortalError] = useState('');
  const [loading, setLoading] = useState(false);

  const logout = async () => {
    if (session) {
      try {
        await api.adminRequest(session.token, '/api/restaurant/logout', 'POST', {});
      } catch { /* Local credentials are cleared even when the network is unavailable. */ }
    }
    sessionStorage.removeItem(storageKey);
    setSession(null);
    setPortal(null);
    setPortalError('');
    setSelectedOrder(null);
  };

  const loadPortal = async (quiet = false) => {
    if (!session) return;
    if (!quiet) setLoading(true);
    setPortalError('');
    try {
      const result = await api.restaurantOverview(session.token);
      setPortal(result);
      setSelectedOrder(current =>
        current
          ? result.orders.find(order => order.id === current.id) || current
          : null
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        sessionStorage.removeItem(storageKey);
        setSession(null);
        setPortal(null);
      } else {
        setPortalError(error instanceof Error ? error.message : 'تعذّر تحميل بيانات المطعم.');
      }
    } finally {
      if (!quiet) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    if (!session) return;
    void loadPortal();
    const interval = window.setInterval(() => void loadPortal(true), 5_000);
    // The token is the ownership boundary; clear polling when the session changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => window.clearInterval(interval);
  }, [session?.token]);

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoggingIn(true);
    setLoginError('');
    try {
      const result = await api.restaurantLogin(normalizeDigits(serialNumber).trim());
      const next = { token: result.token, restaurant: result.restaurant };
      sessionStorage.setItem(storageKey, JSON.stringify(next));
      setSession(next);
      setSerialNumber('');
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'تعذّر تسجيل الدخول.');
    } finally {
      setLoggingIn(false);
    }
  };

  if (!session) return <div className="restaurant-portal" dir="rtl">
    <div className="restaurant-login-shell">
      <header className="restaurant-portal-nav">
        <Link href="/" className="restaurant-portal-brand"><span className="restaurant-portal-mark">T</span><span>طلبات</span></Link>
        <span className="restaurant-portal-caption">لوحة المطعم</span>
      </header>
      <main className="restaurant-login-layout">
        <section className="restaurant-login-intro">
          <div className="restaurant-login-icon"><Store size={25}/></div>
          <span className="restaurant-kicker">مساحة مخصصة للمطاعم</span>
          <h1>أدر طلبات<br/>مطعمك بسهولة.</h1>
          <p>تابع الطلبات والفواتير وبيانات حساب مطعمك من مكان واحد.</p>
        </section>
        <form className="restaurant-login-card" onSubmit={submitLogin}>
          <h2>تسجيل دخول المطعم</h2>
          <p>أدخل الرقم التسلسلي المكوّن من ستة أرقام الذي زوّدك به المشرف.</p>
          <label htmlFor="restaurant-serial">الرقم التسلسلي</label>
          <input
            id="restaurant-serial"
            value={serialNumber}
            onChange={event => setSerialNumber(normalizeDigits(event.target.value).replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            pattern="[0-9]{6}"
            dir="ltr"
            placeholder="000000"
            required
            data-testid="input-restaurant-serial"
          />
          {loginError && <div className="restaurant-portal-error" role="alert" data-testid="status-restaurant-login-error">{loginError}</div>}
          <button className="restaurant-primary-button" type="submit" disabled={loggingIn || serialNumber.length !== 6} data-testid="button-restaurant-login">
            {loggingIn ? 'جارٍ التحقق...' : 'دخول لوحة المطعم'}
          </button>
          <Link href="/" className="restaurant-back-link">العودة إلى المتجر</Link>
        </form>
      </main>
    </div>
  </div>;

  const scopedOrders = (portal?.orders || []).filter((order) => {
    if (filter === 'active') return !order.isArchived;
    if (filter === 'archived') return !!order.isArchived;
    return true;
  });
  const searchTerm = normalizeSearch(search);
  const matchesStatus = (order: Order, selected: StatusFilter) => {
    if (selected === 'all') return true;
    return statusGroups.find(group => group.value === selected)?.statuses.includes(order.status.toUpperCase()) || false;
  };
  const displayedOrders = scopedOrders.filter(order => {
    const haystack = normalizeSearch([
      order.id, order.orderNumber, order.invoiceNumber, order.customerName, order.customerPhone,
    ].filter(value => value != null).join(' '));
    const orderDate = new Date(order.createdAt);
    const dateKey = Number.isNaN(orderDate.getTime()) ? '' : [
      orderDate.getFullYear(),
      String(orderDate.getMonth() + 1).padStart(2, '0'),
      String(orderDate.getDate()).padStart(2, '0'),
    ].join('-');
    return matchesStatus(order, statusFilter)
      && (!searchTerm || haystack.includes(searchTerm))
      && (!dateFrom || (dateKey && dateKey >= dateFrom))
      && (!dateTo || (dateKey && dateKey <= dateTo));
  });
  const clearFilters = () => { setSearch(''); setDateFrom(''); setDateTo(''); setStatusFilter('all'); };

  return <div className="restaurant-portal" dir="rtl">
    <header className="restaurant-dashboard-top">
      <div className="restaurant-dashboard-nav">
        <Link href="/" className="restaurant-portal-brand"><span className="restaurant-portal-mark">T</span><span>طلبات</span></Link>
        <div className="restaurant-nav-account"><div><strong>{portal?.restaurant.name || session.restaurant.name}</strong><small>حساب المطعم · #{session.restaurant.id}</small></div>
          <button type="button" className="restaurant-logout-button" onClick={() => void logout()} data-testid="button-restaurant-logout"><LogOut size={16}/><span>تسجيل الخروج</span></button>
        </div>
      </div>
      <div className="restaurant-dashboard-heading"><span className="restaurant-kicker">لوحة التحكم</span><h1>مرحباً، {portal?.restaurant.name || session.restaurant.name}</h1><p>هذه المساحة تعرض بيانات مطعمك فقط.</p></div>
    </header>
    <main className="restaurant-dashboard-main">
      <section className="restaurant-profile-card">
        <div className="restaurant-profile-icon"><Store size={20}/></div>
        <div><strong>بيانات المطعم</strong><span>{portal?.restaurant.phone || session.restaurant.phone || 'لا يوجد هاتف مسجل'}</span><span>{portal?.restaurant.address || session.restaurant.address || 'لا يوجد عنوان مسجل'}</span></div>
      </section>
      <section className="restaurant-metrics" aria-label="ملخص المطعم">
        <article><span>إجمالي الطلبات</span><strong>{portal?.summary.totalOrders ?? '—'}</strong><small>كل الطلبات المسجلة</small></article>
        <article><span>الطلبات النشطة</span><strong>{portal?.summary.activeOrders ?? '—'}</strong><small>غير مؤرشفة</small></article>
        <article><span>الطلبات المؤرشفة</span><strong>{portal?.summary.archivedOrders ?? '—'}</strong><small>متاحة للمراجعة</small></article>
        <article><span>إجمالي المبيعات</span><strong>{portal ? money(portal.summary.revenue) : '—'} <small>{portal && CURRENCY}</small></strong><small>باستثناء الطلبات الملغاة</small></article>
      </section>
      <section className="restaurant-orders-section">
        <div className="restaurant-orders-heading"><div><h2><ClipboardList size={20}/> الطلبات والفواتير</h2><p>الطلبات والفواتير المحفوظة لهذا المطعم.</p></div>
          <button className="restaurant-refresh-button" type="button" disabled={loading} onClick={() => { setRefreshing(true); void loadPortal(); }} data-testid="button-restaurant-refresh"><RefreshCw size={15}/>{refreshing ? 'جارٍ التحديث...' : 'تحديث'}</button>
        </div>
        <div className="restaurant-archive-tabs" role="tablist" aria-label="نطاق الأرشيف">
          {([['active', 'النشطة'], ['archived', 'الأرشيف'], ['all', 'الكل']] as const).map(([value, label]) =>
            <button type="button" role="tab" aria-selected={filter === value} className={filter === value ? 'is-active' : ''} key={value} onClick={() => setFilter(value)} data-testid={`tab-restaurant-${value}`}>{label}</button>
          )}
        </div>
        <div className="restaurant-order-tools">
          <label className="restaurant-search-field">
            <Search size={17} aria-hidden="true"/>
            <span className="sr-only">البحث برقم الطلب أو اسم العميل أو الهاتف</span>
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث برقم الطلب، العميل أو الهاتف" aria-label="البحث برقم الطلب أو اسم العميل أو الهاتف" data-testid="input-restaurant-order-search"/>
          </label>
          <div className="restaurant-date-filters">
            <label><CalendarDays size={15} aria-hidden="true"/><span>من</span><input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} aria-label="تاريخ الطلب من" data-testid="input-restaurant-date-from"/></label>
            <label><span>إلى</span><input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} aria-label="تاريخ الطلب إلى" data-testid="input-restaurant-date-to"/></label>
          </div>
          {(search || dateFrom || dateTo || statusFilter !== 'all') && <button type="button" className="restaurant-clear-filters" onClick={clearFilters} data-testid="button-restaurant-clear-filters"><X size={14}/>مسح الفلاتر</button>}
        </div>
        <div className="restaurant-status-tabs" role="tablist" aria-label="تصنيف الفواتير">
          {statusGroups.map(group => <button type="button" role="tab" aria-selected={statusFilter === group.value} className={statusFilter === group.value ? 'is-active' : ''} key={group.value} onClick={() => setStatusFilter(group.value)} data-testid={`tab-restaurant-status-${group.value}`}>
            <span>{group.label}</span><small>{scopedOrders.filter(order => matchesStatus(order, group.value)).length}</small>
          </button>)}
        </div>
        {portalError && <div className="restaurant-portal-error" role="alert">{portalError}<button type="button" onClick={() => void loadPortal()}>إعادة المحاولة</button></div>}
        {loading && !portal ? <div className="restaurant-orders-empty" role="status">جارٍ تحميل الطلبات...</div>
          : displayedOrders.length ? <div className="restaurant-order-list" aria-live="polite" data-testid="list-restaurant-orders">
            {displayedOrders.map(order => <article className="restaurant-order-card" key={order.id} data-testid={`card-restaurant-order-${order.id}`}>
              <div className="restaurant-order-card-head"><div><strong>طلب <span dir="ltr">#{order.id}</span></strong><small dir="ltr" style={{ display: 'block', marginTop: 4, color: 'var(--rp-soft)', fontWeight: 700 }}>{order.invoiceNumber}</small><time>{dateLabel(order.createdAt)}</time></div><div className="restaurant-order-status-group"><span className={`restaurant-order-status status-${order.status.toLowerCase()}`}>{statusLabel(order.status)}</span><small className="restaurant-driver-decision" data-testid={`text-restaurant-driver-decision-${order.id}`}>قرار السائق: {driverApprovalLabel(order.driverApprovalStatus || order.assignmentStatus || undefined)}</small>{order.status === 'REJECTED' && <small className="restaurant-rejection-note" data-testid={`text-restaurant-rejection-not-cancellation-${order.id}`}>رفض السائق لا يلغي الطلب؛ يُعاد توجيهه عند توفر سائق آخر.</small>}{order.status === 'CANCELLED' && <small className="restaurant-cancellation-details" data-testid={`text-restaurant-cancellation-${order.id}`}>{order.cancellationReason ? `السبب: ${order.cancellationReason}` : 'لم يُسجّل سبب الإلغاء'}{order.cancelledAt ? ` · ${dateLabel(order.cancelledAt)}` : ''}</small>}</div></div>
              <p className="restaurant-order-items">{order.orderType === 'RESERVATION' ? 'حجز' : 'توصيل'} · {order.itemsSummary || order.items.map(item => `${item.quantity} × ${item.productName || 'صنف'}`).join('، ') || 'لا توجد أصناف'}</p>
              <div className="restaurant-order-card-foot"><div><span>العميل: {order.customerName}</span><span dir="ltr">{order.customerPhone}</span></div><strong>{money(order.totalAmount)} {CURRENCY}</strong>
                <button type="button" className="restaurant-invoice-button" onClick={() => setSelectedOrder(order)} data-testid={`button-restaurant-invoice-${order.id}`}><Receipt size={15}/>عرض الفاتورة</button>
              </div>
            </article>)}
          </div> : !portalError && <div className="restaurant-orders-empty" data-testid="empty-restaurant-orders"><ClipboardList size={26}/><strong>لا توجد فواتير تطابق الاختيار</strong><span>{search || dateFrom || dateTo || statusFilter !== 'all' ? 'جرّب تعديل البحث أو نطاق التاريخ أو تصنيف الحالة.' : 'ستظهر الفواتير الجديدة هنا تلقائياً بعد وصول الطلب.'}</span></div>}
      </section>
    </main>
    <InvoiceDialog open={!!selectedOrder} onClose={() => setSelectedOrder(null)} order={selectedOrder}/>
  </div>;
}
