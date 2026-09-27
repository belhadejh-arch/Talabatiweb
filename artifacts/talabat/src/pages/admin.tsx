import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ClipboardList, LayoutDashboard, LogOut, RefreshCw, Store, Truck, Users, ChartNoAxesCombined } from 'lucide-react';
import { Link } from 'wouter';
import { useForm } from 'react-hook-form';
import { Form } from '@/components/ui/form';
import { ErrorState, LoadingState } from '../components/common';
import { useAdminOverview, useAdminStats } from '../hooks/use-data';
import { api, dateLabel, money, statusLabel, type StatsData } from '../lib/api';

function readToken() { try { return sessionStorage.getItem('talabat-admin-token'); } catch { return null; } }
function StatDetails({ stats }: { stats: StatsData }) {
  const entries = Object.entries(stats);
  if (!entries.length) return <p className="subtle text-sm p-5">لا تتوفر إحصاءات حالياً.</p>;
  return <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{entries.map(([key, value]) => <div key={key} className="metric min-w-0"><span className="subtle text-xs break-all">{key}</span><div className="mt-2 text-sm font-bold break-words" dir={typeof value === 'number' ? 'ltr' : 'auto'}>{value == null ? '—' : typeof value === 'object' ? <pre className="text-xs font-normal whitespace-pre-wrap max-h-36 overflow-auto">{JSON.stringify(value, null, 2)}</pre> : String(value)}</div></div>)}</div>;
}
export default function Admin() {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(readToken);
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [tab, setTab] = useState<'overview' | 'orders' | 'stats'>('overview');
  const form = useForm<{ username: string; password: string }>({ defaultValues: { username: '', password: '' } });
  const overview = useAdminOverview(token);
  const stats = useAdminStats(token);
  const logout = () => { sessionStorage.removeItem('talabat-admin-token'); setToken(null); queryClient.removeQueries({ queryKey: ['admin'] }); form.reset(); };
  useEffect(() => { if (overview.error && 'status' in overview.error && overview.error.status === 401) logout(); }, [overview.error]); // eslint-disable-line react-hooks/exhaustive-deps
  const login = form.handleSubmit(async values => {
    setLoggingIn(true); setLoginError('');
    try { const result = await api.adminLogin(values.username.trim(), values.password); sessionStorage.setItem('talabat-admin-token', result.token); setToken(result.token); form.reset(); }
    catch (cause) { setLoginError(cause instanceof Error ? cause.message : 'تعذّر تسجيل الدخول.'); }
    finally { setLoggingIn(false); }
  });
  if (!token) return <div dir="rtl" className="login-wrap">
    <div className="login-art"><Link href="/" className="brand" data-testid="link-admin-to-home">طلبات<span style={{ color: 'hsl(var(--secondary))' }}>.</span></Link><div><span className="eyebrow" style={{ color: 'hsl(var(--secondary))' }}>مساحة إدارة الطلبات</span><h1 className="display mt-5" style={{ fontSize: 'clamp(3rem, 5vw, 5.4rem)' }}>وراء كل طلب،<br/>فريق يعرف ماذا يفعل.</h1><p className="opacity-70 mt-5 leading-8 max-w-md">بيانات الطلبات والمطاعم في مكان واحد. وصول مخصّص للمشرفين فقط.</p></div><span className="text-xs opacity-50">TALABAT / ADMIN</span></div>
     <div className="login-form"><div className="login-form-inner"><div className="login-brand-banner" aria-hidden="true"><span className="login-brand-mark">T</span><span className="login-brand-word">TALABAT</span><svg className="login-brand-wave" viewBox="0 0 1440 180" preserveAspectRatio="none"><path d="M0,56 C140,105 235,150 380,118 C530,84 605,35 745,63 C905,96 965,145 1110,116 C1250,88 1338,69 1440,90 L1440,180 L0,180 Z"/></svg></div><h2 className="section-title mt-2">مرحباً بعودتك</h2><p className="subtle login-subtitle">تسجيل الدخول إلى مركز تحكم طلبات</p><Form {...form}><form onSubmit={login} className="form-stack"><label className="field">البريد الإلكتروني أو اسم المستخدم<input {...form.register('username', { required: true })} autoComplete="username" data-testid="input-admin-username" required/></label><label className="field">كلمة المرور<input {...form.register('password', { required: true })} type="password" autoComplete="current-password" data-testid="input-admin-password" required/></label>{loginError && <div className="error-box" role="alert" data-testid="status-login-error">{loginError}</div>}<button type="submit" disabled={loggingIn} className="btn btn-primary w-full mt-2" data-testid="button-admin-login">{loggingIn ? 'جارٍ الدخول...' : 'تسجيل الدخول'}</button></form></Form><Link href="/" className="inline-block subtle text-sm mt-6 hover:underline" data-testid="link-back-store">العودة إلى المتجر</Link></div></div>
  </div>;
  const data = overview.data;
  const metrics = [
    { label: 'الطلبات', value: data?.orders?.length, icon: ClipboardList },
    { label: 'المطاعم', value: data?.restaurants?.length, icon: Store },
    { label: 'السائقون', value: data?.drivers?.length, icon: Truck },
    { label: 'الاشتراكات', value: data?.subscriptions?.length, icon: Users },
  ];
   return <div dir="rtl" className="admin-layout"><aside className="admin-sidebar"><div><Link href="/" className="brand" data-testid="link-admin-home"><span className="brand-mark" style={{background:'#6366ec'}}>T</span><span>TALABAT</span></Link><p className="sidebar-description text-xs opacity-60 mt-5">القائمة الرئيسية</p></div><nav className="flex md:flex-col gap-2" aria-label="أقسام الإدارة">{([['overview','نظرة عامة',LayoutDashboard],['orders','الطلبات',ClipboardList],['stats','الإحصاءات',ChartNoAxesCombined]] as const).map(([id,label,Icon]) => <button key={id} onClick={() => setTab(id)} className={`text-right px-3 py-2 rounded-lg text-sm font-bold ${tab === id ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'opacity-70 hover:opacity-100'}`} data-testid={`button-admin-${id}`} aria-current={tab === id ? 'page' : undefined}><Icon size={17}/>{label}</button>)}</nav><button onClick={logout} className="flex items-center gap-2 text-sm opacity-70 hover:opacity-100 md:mt-auto" data-testid="button-admin-logout"><LogOut size={16}/><span className="hidden sm:inline">تسجيل الخروج</span></button></aside>
     <main className="admin-content"><div className="admin-topbar"><div><h1 className="text-xl font-bold">{tab === 'overview' ? 'لوحة القيادة' : tab === 'orders' ? 'الطلبات' : 'الإحصاءات'}</h1><p className="subtle text-xs mt-1">بيانات حقيقية تتجدد تلقائياً كل 30 ثانية</p></div><button className="btn btn-outline" onClick={() => { void overview.refetch(); void stats.refetch(); }} data-testid="button-admin-refresh"><RefreshCw size={16}/><span className="hidden sm:inline">تحديث البيانات</span></button></div>
      {overview.isLoading ? <LoadingState/> : overview.error ? <ErrorState message={(overview.error as Error).message} onRetry={() => { void overview.refetch(); }}/> : !data ? <ErrorState message="البيانات غير متاحة حالياً." onRetry={() => { void overview.refetch(); }}/> : <>
         {tab === 'overview' && <><div className="metric-grid">{metrics.map(({ label, value, icon: Icon }) => <div className="metric" key={label}><div className="flex items-start justify-between gap-3"><span className="subtle text-sm">{label}</span><span className="metric-icon"><Icon size={18}/></span></div><strong data-testid={`text-metric-${label}`}>{value ?? '—'}</strong><span className="subtle text-xs">من البيانات الحالية</span></div>)}</div><div className="mt-10 flex items-center justify-between gap-2"><h2 className="display text-2xl">أحدث الطلبات</h2><button onClick={() => setTab('orders')} className="text-sm font-bold" style={{ color: 'hsl(var(--primary))' }} data-testid="button-view-all-orders">عرض الكل ←</button></div><OrdersTable orders={data.orders.slice(0, 6)}/><div className="mt-10"><h2 className="display text-2xl mb-4">مؤشرات التشغيل</h2><StatDetails stats={data.stats || {}}/></div></>}
        {tab === 'orders' && <><p className="subtle text-sm mb-5">جميع الطلبات الواردة ({data.orders.length})</p><OrdersTable orders={data.orders}/></>}
        {tab === 'stats' && <>{stats.isLoading ? <LoadingState/> : stats.error ? <ErrorState message={(stats.error as Error).message} onRetry={() => { void stats.refetch(); }}/> : <StatDetails stats={stats.data || data.stats || {}}/>}</>}
      </>}
    </main></div>;
}
function OrdersTable({ orders }: { orders: NonNullable<ReturnType<typeof useAdminOverview>['data']>['orders'] }) {
  if (!orders.length) return <div className="surface text-center py-12 mt-4"><ClipboardList size={28} className="mx-auto mb-4 subtle"/><h3 className="display text-2xl">لا توجد طلبات بعد</h3><p className="subtle text-sm mt-2">ستظهر الطلبات الجديدة هنا فور وصولها.</p></div>;
   return <div className="table-wrap mt-4"><table className="data-table"><thead><tr><th>الطلب</th><th>العميل</th><th>المطعم</th><th>النوع</th><th>الإجمالي</th><th>الحالة</th><th>الوقت</th></tr></thead><tbody>{orders.map(order => <tr className={order.status === 'NEW' ? 'new-order-row' : undefined} key={order.id} data-testid={`row-order-${order.id}`}><td className="font-bold" dir="ltr">#{order.id}</td><td><div className="font-bold">{order.customerName}</div><span className="subtle" dir="ltr">{order.customerPhone}</span></td><td>{order.restaurantName || `#${order.restaurantId}`}</td><td>{order.orderType === 'DELIVERY' ? 'توصيل' : 'حجز'}</td><td className="font-bold whitespace-nowrap">{money(order.totalAmount)} ر.س</td><td><span className="status-pill">{statusLabel(order.status)}</span></td><td className="subtle whitespace-nowrap">{dateLabel(order.createdAt)}</td></tr>)}</tbody></table></div>;
}