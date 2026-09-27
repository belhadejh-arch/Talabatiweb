import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ClipboardList, LayoutDashboard, LogOut, RefreshCw, ChartNoAxesCombined, Store, Utensils, CalendarClock, Truck, Settings, Menu as MenuIcon, X } from 'lucide-react';
import { Link } from 'wouter';
import { useForm } from 'react-hook-form';
import { Form } from '@/components/ui/form';
import { ErrorState, LoadingState } from '../components/common';
import { useAdminOverview, useAdminStats } from '../hooks/use-data';
import { useAdminWrite } from '../hooks/use-admin';
import { api, dateLabel, money, statusLabel, type Order } from '../lib/api';
import AdminDashboard from './admin-dashboard';
import AdminRestaurants from './admin-restaurants';
import AdminMenuPage from './admin-menu';
import AdminSubscriptions from './admin-subscriptions';
import AdminDrivers from './admin-drivers';
import AdminAnalytics from './admin-analytics';
import AdminSettingsPage from './admin-settings';

type Tab = 'overview' | 'orders' | 'restaurants' | 'menu' | 'subscriptions' | 'drivers' | 'analytics' | 'stats' | 'settings';
const navigation = [
  { id:'overview',label:'لوحة القيادة',icon:LayoutDashboard },
  { id:'orders',label:'الطلبات',icon:ClipboardList },
  { id:'restaurants',label:'المطاعم',icon:Store },
  { id:'menu',label:'قائمة الطعام',icon:Utensils },
  { id:'subscriptions',label:'الاشتراكات',icon:CalendarClock },
  { id:'drivers',label:'السائقون',icon:Truck },
  { id:'analytics',label:'التحليلات',icon:ChartNoAxesCombined },
  { id:'settings',label:'الإعدادات',icon:Settings },
] as const;
function readToken() { try { return sessionStorage.getItem('talabat-admin-token'); } catch { return null; } }

export default function Admin() {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(readToken);
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const form = useForm<{username:string;password:string}>({defaultValues:{username:'',password:''}});
  const overview = useAdminOverview(token);
  const stats = useAdminStats(token);
  const logout = () => { sessionStorage.removeItem('talabat-admin-token'); setToken(null); setMenuOpen(false); queryClient.removeQueries({queryKey:['admin']}); form.reset(); };
  const write = useAdminWrite(token || '', logout);
  useEffect(() => { if ([overview.error, stats.error].some(error => error && 'status' in error && error.status === 401)) logout(); }, [overview.error, stats.error]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => queryClient.getQueryCache().subscribe(event => {
    if (event.type !== 'updated') return;
    const error = event?.query?.state.error;
    if (error && typeof error === 'object' && 'status' in error && error.status === 401 && event.query.queryKey[0] === 'admin') logout();
  }), [queryClient]); // eslint-disable-line react-hooks/exhaustive-deps
  const login = form.handleSubmit(async values => {
    setLoggingIn(true);setLoginError('');
    try { const result = await api.adminLogin(values.username.trim(),values.password);sessionStorage.setItem('talabat-admin-token',result.token);setToken(result.token);form.reset(); }
    catch (cause) {setLoginError(cause instanceof Error ? cause.message : 'تعذّر تسجيل الدخول.');}
    finally {setLoggingIn(false);}
  });
  if (!token) return <div dir="rtl" className="login-wrap">
    <div className="login-art"><Link href="/" className="brand" data-testid="link-admin-to-home">طلبات<span style={{color:'hsl(var(--secondary))'}}>.</span></Link><div><span className="eyebrow" style={{color:'hsl(var(--secondary))'}}>مساحة إدارة الطلبات</span><h1 className="display mt-5" style={{fontSize:'clamp(3rem, 5vw, 5.4rem)'}}>وراء كل طلب،<br/>فريق يعرف ماذا يفعل.</h1><p className="opacity-70 mt-5 leading-8 max-w-md">بيانات الطلبات والمطاعم في مكان واحد. وصول مخصّص للمشرفين فقط.</p></div><span className="text-xs opacity-50">TALABAT / ADMIN</span></div>
    <div className="login-form"><div className="login-form-inner"><div className="login-brand-banner" aria-hidden="true"><span className="login-brand-mark">T</span><span className="login-brand-word">TALABAT</span><svg className="login-brand-wave" viewBox="0 0 1440 180" preserveAspectRatio="none"><path d="M0,56 C140,105 235,150 380,118 C530,84 605,35 745,63 C905,96 965,145 1110,116 C1250,88 1338,69 1440,90 L1440,180 L0,180 Z"/></svg></div><h2 className="section-title mt-2">مرحباً بعودتك</h2><p className="subtle login-subtitle">تسجيل الدخول إلى مركز تحكم طلبات</p><Form {...form}><form onSubmit={login} className="form-stack"><label className="field">البريد الإلكتروني أو اسم المستخدم<input {...form.register('username',{required:true})} autoComplete="username" data-testid="input-admin-username" required/></label><label className="field">كلمة المرور<input {...form.register('password',{required:true})} type="password" autoComplete="current-password" data-testid="input-admin-password" required/></label>{loginError && <div className="error-box" role="alert" data-testid="status-login-error">{loginError}</div>}<button type="submit" disabled={loggingIn} className="btn btn-primary w-full mt-2" data-testid="button-admin-login">{loggingIn ? 'جارٍ الدخول...' : 'تسجيل الدخول'}</button></form></Form><Link href="/" className="inline-block subtle text-sm mt-6 hover:underline" data-testid="link-back-store">العودة إلى المتجر</Link></div></div>
  </div>;
  const data = overview.data;
  const activeTab = tab === 'stats' ? 'analytics' : tab;
  const navigate = (next:Tab) => {setTab(next);setMenuOpen(false);};
  return <div dir="rtl" className="admin-layout">
    <aside className="admin-sidebar"><div className="admin-sidebar-head"><Link href="/" className="brand" data-testid="link-admin-home"><span className="brand-mark">T</span><span>TALABAT</span></Link><div className="admin-user"><div className="admin-user-avatar" aria-hidden="true">A</div><div><strong>مساحة المشرف</strong><small>إدارة طلبات</small></div></div><button className="admin-menu-trigger admin-action" type="button" aria-label={menuOpen ? 'إغلاق القائمة' : 'فتح قائمة الأقسام'} aria-expanded={menuOpen} aria-controls="admin-navigation" onClick={() => setMenuOpen(!menuOpen)} data-testid="button-admin-menu">{menuOpen ? <X size={19}/> : <MenuIcon size={19}/>}</button></div><p className="admin-sidebar-label">القائمة الرئيسية</p><nav id="admin-navigation" className={menuOpen ? 'is-open' : ''} aria-label="أقسام الإدارة">{navigation.map(({id,label,icon:Icon}) => <button type="button" key={id} onClick={() => navigate(id)} data-testid={`button-admin-${id}`} aria-current={activeTab === id ? 'page' : undefined}><Icon size={18}/>{label}</button>)}<button type="button" onClick={() => navigate('stats')} data-testid="button-admin-stats" aria-current={tab === 'stats' ? 'page' : undefined}><ChartNoAxesCombined size={18}/>الإحصاءات</button><button type="button" className="admin-mobile-logout" onClick={logout} data-testid="button-admin-logout-mobile"><LogOut size={18}/>تسجيل الخروج</button></nav><button type="button" onClick={logout} className="admin-logout" data-testid="button-admin-logout" aria-label="تسجيل الخروج"><LogOut size={18}/><span>تسجيل الخروج</span></button></aside>
    <main className="admin-content"><header className="admin-topbar"><div><h1>{tab === 'stats' ? 'الإحصاءات' : navigation.find(item => item.id === activeTab)?.label}</h1><p>{new Intl.DateTimeFormat('ar',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date())}</p></div><button type="button" className="btn btn-outline" onClick={() => {void queryClient.invalidateQueries({queryKey:['admin']});}} data-testid="button-admin-refresh" aria-label="تحديث البيانات"><RefreshCw size={16}/><span className="hidden sm:inline">تحديث البيانات</span></button></header><div className="admin-canvas">
    {overview.isLoading ? <LoadingState/> : overview.error ? <ErrorState message={(overview.error as Error).message} onRetry={() => {void overview.refetch();}}/> : !data ? <ErrorState message="البيانات غير متاحة حالياً." onRetry={() => {void overview.refetch();}}/> : <>
      {tab === 'overview' && <><AdminDashboard overview={data} stats={stats.data || data.stats}/><div className="mt-10 flex items-center justify-between gap-2"><h2 className="admin-section-title mb-0">أحدث الطلبات</h2><button type="button" onClick={() => navigate('orders')} className="text-sm font-bold" style={{color:'#6263df'}} data-testid="button-view-all-orders">عرض الطلبات ←</button></div><OrdersTable orders={data.orders.slice(0,6)}/></>}
      {tab === 'orders' && <><p className="subtle text-sm mb-5">أحدث الطلبات الواردة (حتى ٢٥٠ طلباً؛ المعروض: {data.orders.length})</p><OrdersTable orders={data.orders}/></>}
      {tab === 'restaurants' && <AdminRestaurants restaurants={data.restaurants} write={write}/>}
      {tab === 'menu' && <AdminMenuPage restaurants={data.restaurants} token={token} write={write}/>}
      {tab === 'subscriptions' && <AdminSubscriptions subscriptions={data.subscriptions} restaurants={data.restaurants} write={write}/>}
      {tab === 'drivers' && <AdminDrivers drivers={data.drivers} restaurants={data.restaurants} write={write}/>}
      {(tab === 'analytics' || tab === 'stats') && <AdminAnalytics token={token}/>}
      {tab === 'settings' && <AdminSettingsPage token={token} write={write}/>}
    </>}</div></main>
  </div>;
}
function OrdersTable({orders}:{orders:Order[]}) {
  if (!orders.length) return <div className="surface text-center py-12 mt-4"><ClipboardList size={28} className="mx-auto mb-4 subtle"/><h3 className="display text-2xl">لا توجد طلبات بعد</h3><p className="subtle text-sm mt-2">ستظهر الطلبات الجديدة هنا فور وصولها.</p></div>;
  return <div className="table-wrap mt-4"><table className="data-table"><thead><tr><th>الطلب</th><th>العميل</th><th>المطعم</th><th>النوع</th><th>الإجمالي</th><th>الحالة</th><th>الوقت</th></tr></thead><tbody>{orders.map(order => <tr className={order.status === 'NEW' ? 'new-order-row' : undefined} key={order.id} data-testid={`row-order-${order.id}`}><td className="font-bold" dir="ltr">#{order.id}</td><td><div className="font-bold">{order.customerName}</div><span className="subtle" dir="ltr">{order.customerPhone}</span></td><td>{order.restaurantName || `#${order.restaurantId}`}</td><td>{order.orderType === 'DELIVERY' ? 'توصيل' : 'حجز'}</td><td className="font-bold whitespace-nowrap">{money(order.totalAmount)} ر.س</td><td><span className="status-pill">{statusLabel(order.status)}</span></td><td className="subtle whitespace-nowrap">{dateLabel(order.createdAt)}</td></tr>)}</tbody></table></div>;
}