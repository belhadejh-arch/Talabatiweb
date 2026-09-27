import { Activity, DollarSign, ShoppingBag, Store } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { money, type AdminOverview, type StatsData } from '../lib/api';

type DailyPoint = { day: string; date: string; value: number; orders: number };
function summaryNumber(stats: StatsData | undefined, key: string): number | null {
  const summary = stats?.summary;
  if (!summary || typeof summary !== 'object') return null;
  const raw = (summary as Record<string, unknown>)[key];
  if (raw == null || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}
function dailyOrders(orders: AdminOverview['orders']): DailyPoint[] {
  const days = new Map<string, DailyPoint>();
  for (const order of orders) {
    const time = new Date(order.createdAt);
    if (Number.isNaN(time.getTime())) continue;
    const day = time.toISOString().slice(0, 10);
    const point = days.get(day) || { day, date: new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(time), value: 0, orders: 0 };
    point.orders += 1;
    point.value += Number(order.totalAmount) || 0;
    days.set(day, point);
  }
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-10);
}

export default function AdminDashboard({ overview, stats }: { overview: AdminOverview; stats?: StatsData }) {
  const orders = overview.orders || [];
  const trend = dailyOrders(orders);
  const drivers = overview.drivers || [];
  const hasDriverStatus = drivers.length === 0 || drivers.some(driver => typeof driver.isActive === 'boolean' || typeof driver.status === 'string');
  const activeDrivers = drivers.filter(driver => driver.isActive === true || driver.status === 'ACTIVE').length;
  const cards = [
    { label: 'إجمالي قيمة الطلبات', value: summaryNumber(stats, 'totalOrderValue'), suffix: ' ر.س', note: 'إجمالي قيمة الطلبات المسجلة', icon: DollarSign, test: 'إجمالي قيمة الطلبات' },
    { label: 'إجمالي الطلبات', value: summaryNumber(stats, 'totalOrders'), suffix: '', note: 'من إجمالي السجلات', icon: ShoppingBag, test: 'الطلبات' },
    { label: 'المطاعم المدرجة', value: overview.restaurants?.length ?? 0, suffix: '', note: 'تشمل المطاعم غير النشطة', icon: Store, test: 'المطاعم' },
    { label: 'السائقون النشطون', value: hasDriverStatus ? activeDrivers : null, suffix: '', note: 'حسب حالة السائقين الحالية', icon: Activity, test: 'السائقون' },
  ];
  const ranked = new Map<number, { id: number; name: string; orders: number; value: number }>();
  const names = new Map(overview.restaurants?.map(restaurant => [restaurant.id, restaurant.name]) || []);
  for (const order of orders) {
    const row = ranked.get(order.restaurantId) || { id: order.restaurantId, name: order.restaurantName || names.get(order.restaurantId) || `مطعم #${order.restaurantId}`, orders: 0, value: 0 };
    row.orders++;
    row.value += Number(order.totalAmount) || 0;
    ranked.set(order.restaurantId, row);
  }
  const restaurants = [...ranked.values()].sort((a, b) => b.value - a.value || b.orders - a.orders).slice(0, 7);
  const sampleLabel = `ضمن أحدث ${money(orders.length)} طلب معروض، بكل الحالات`;

  return <div className="admin-overview">
    <section className="metric-grid" aria-label="مؤشرات التشغيل">
      {cards.map(({ label, value, suffix, note, icon: Icon, test }) => <div className="metric" key={label}>
        <div className="flex items-start justify-between gap-2"><span className="metric-label">{label}</span><span className="metric-icon"><Icon size={19}/></span></div>
        <strong data-testid={`text-metric-${test}`}>{value == null ? '—' : <>{money(value)}{suffix}</>}</strong>
        <span className="metric-note">{value == null ? 'البيانات غير متاحة حالياً' : note}</span>
      </div>)}
    </section>
    <p className="admin-subscription-note" data-testid="text-metric-الاشتراكات">الاشتراكات المدرجة: {money(overview.subscriptions.length)}</p>

    <section className="admin-charts" aria-label="اتجاه الطلبات المعروضة">
      <div className="admin-panel"><div className="admin-panel-head"><h2>قيمة الطلبات بمرور الوقت</h2><p>{sampleLabel} · آخر ١٠ أيام مسجّلة</p></div>
        {trend.length ? <div className="admin-chart" role="img" aria-label="رسم لقيمة الطلبات اليومية ضمن أحدث الطلبات المعروضة">
          <ResponsiveContainer width="100%" height="100%"><AreaChart data={trend} margin={{ top: 12, right: 8, left: 2, bottom: 4 }}>
            <defs><linearGradient id="adminValueFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6465e9" stopOpacity={.35}/><stop offset="95%" stopColor="#6465e9" stopOpacity={0}/></linearGradient></defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8edf4"/>
            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill:'#8795a8', fontSize:11 }} dy={8}/>
            <YAxis axisLine={false} tickLine={false} tick={{ fill:'#8795a8', fontSize:11 }} tickFormatter={v => money(v)} width={52}/>
            <Tooltip contentStyle={{ background:'#fff', border:'1px solid #e5ebf3', borderRadius:12, boxShadow:'0 8px 20px rgba(31,50,70,.1)', direction:'rtl' }} formatter={value => [`${money(Number(value))} ر.س`, 'قيمة الطلبات']}/>
            <Area type="monotone" dataKey="value" stroke="#6465e9" strokeWidth={3} fill="url(#adminValueFill)" fillOpacity={1} isAnimationActive={false}/>
          </AreaChart></ResponsiveContainer>
        </div> : <div className="admin-chart-empty">لا توجد طلبات مؤرخة لرسم الاتجاه.</div>}
      </div>
      <div className="admin-panel"><div className="admin-panel-head"><h2>الطلبات بمرور الوقت</h2><p>{sampleLabel} · آخر ١٠ أيام مسجّلة</p></div>
        {trend.length ? <div className="admin-chart" role="img" aria-label="رسم لعدد الطلبات اليومية ضمن أحدث الطلبات المعروضة">
          <ResponsiveContainer width="100%" height="100%"><AreaChart data={trend} margin={{ top: 12, right: 8, left: 2, bottom: 4 }}>
            <defs><linearGradient id="adminOrdersFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#149fbb" stopOpacity={.33}/><stop offset="95%" stopColor="#149fbb" stopOpacity={0}/></linearGradient></defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8edf4"/>
            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill:'#8795a8', fontSize:11 }} dy={8}/>
            <YAxis axisLine={false} tickLine={false} tick={{ fill:'#8795a8', fontSize:11 }} allowDecimals={false} width={36}/>
            <Tooltip contentStyle={{ background:'#fff', border:'1px solid #e5ebf3', borderRadius:12, boxShadow:'0 8px 20px rgba(31,50,70,.1)', direction:'rtl' }} formatter={value => [`${money(Number(value))} طلب`, 'عدد الطلبات']}/>
            <Area type="monotone" dataKey="orders" stroke="#149fbb" strokeWidth={3} fill="url(#adminOrdersFill)" fillOpacity={1} isAnimationActive={false}/>
          </AreaChart></ResponsiveContainer>
        </div> : <div className="admin-chart-empty">لا توجد طلبات مؤرخة لرسم الاتجاه.</div>}
      </div>
    </section>

    <section className="admin-panel" aria-label="ترتيب المطاعم"><div className="admin-rank-head"><h2>أفضل المطاعم</h2><p>حسب قيمة الطلبات ضمن أحدث {money(orders.length)} طلب معروض، بكل الحالات · ليست إجمالي المبيعات</p></div>
      {restaurants.length ? <div className="admin-rank-scroll"><table className="admin-rank-table"><thead><tr><th scope="col">اسم المطعم</th><th scope="col">عدد الطلبات المعروضة</th><th scope="col">قيمة الطلبات المعروضة</th></tr></thead><tbody>{restaurants.map((restaurant, index) => <tr key={restaurant.id} data-testid={`row-top-restaurant-${restaurant.id}`}><td><div className="admin-rank-name"><span className="admin-rank-number">{index + 1}</span><span>{restaurant.name}</span></div></td><td><span className="admin-rank-count">{money(restaurant.orders)}</span></td><td className="admin-rank-value">{money(restaurant.value)} ر.س</td></tr>)}</tbody></table></div> : <div className="admin-empty">لا توجد طلبات لعرض ترتيب المطاعم بعد.</div>}
    </section>
  </div>;
}