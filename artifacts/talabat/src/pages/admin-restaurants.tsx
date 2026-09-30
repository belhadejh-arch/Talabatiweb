import { useState } from 'react';
import { Pencil, Plus, Archive, RotateCcw, Receipt, Link as LinkIcon, Check } from 'lucide-react';
import { CURRENCY, money, catalogImageUrl, type Restaurant, type Order } from '../lib/api';
import { useAdminRestaurantRevenues } from '../hooks/use-admin';
import { ConfirmDialog, EmptyBlock, EntityDialog, InvoiceDialog, SectionHeading, type Field, type Write, number } from './admin-ui';

const fields: Field[] = [
  { key:'name', label:'اسم المطعم', required:true },
  { key:'phone', label:'رقم الهاتف', type:'tel', required:true },
  { key:'address', label:'العنوان', required:true },
  { key:'deliveryFee', label:`رسوم التوصيل (${CURRENCY})`, type:'number', min:0, step:'0.01' },
  { key:'imageUrl', label:'صورة المطعم (رفع مباشر من الجهاز)', type:'image-upload' },
  { key:'description', label:'وصف المطعم', type:'textarea' },
];

export default function AdminRestaurants({ restaurants, orders = [], token, write }: { restaurants: Restaurant[]; orders?: Order[]; token: string; write: Write }) {
  const [editing, setEditing] = useState<Restaurant | 'new' | null>(null);
  const [archiving, setArchiving] = useState<Restaurant | null>(null);
  const [restoring, setRestoring] = useState<Restaurant | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [selectedSummary, setSelectedSummary] = useState<{ restaurantName: string; date: string; ordersCount: number; totalRevenue: number; deliveryFees: number; orders: Order[] } | null>(null);
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const revenuesQuery = useAdminRestaurantRevenues(token, date);
  const revenueByRestaurant = new Map(
    (revenuesQuery.data?.revenues || []).map(revenue => [revenue.restaurantId, revenue])
  );

  const getTodayStats = (restaurantId: number) => {
    const todayStr = new Date().toDateString();
    const restOrders = orders.filter(o => o.restaurantId === restaurantId && o.status !== 'CANCELLED');
    const todayOrders = restOrders.filter(o => new Date(o.createdAt).toDateString() === todayStr);
    const todayRevenue = todayOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
    const todayDelivery = todayOrders.reduce((sum, o) => sum + (Number(o.deliveryFee) || 0), 0);
    return { todayOrders, todayRevenue, todayDelivery, allOrders: restOrders };
  };

  const copyRestaurantLink = (id: number) => {
    const origin = window.location.origin;
    const url = `${origin}/restaurant/${id}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2500);
    }).catch(() => {});
  };

  return <div className="admin-workspace">
    <SectionHeading title="المطاعم" subtitle={`${money(restaurants.length)} مطعم مدرج · إدارة بيانات المطاعم ومداخيل كل مطعم اليومية والأسبوعية والشهرية والسنوية`}>
      <button className="admin-action primary" onClick={() => setEditing('new')} data-testid="button-add-restaurant">
        <Plus size={16}/>إضافة مطعم
      </button>
    </SectionHeading>

    {revenuesQuery.error && <div className="admin-flash error" role="alert" data-testid="status-restaurant-revenues-error">
      تعذّر تحميل المداخيل. <button className="admin-action" type="button" onClick={() => void revenuesQuery.refetch()}>إعادة المحاولة</button>
    </div>}
    {revenuesQuery.isLoading && <p className="subtle text-sm" role="status">جارٍ تحميل المداخيل حسب الفترات…</p>}

    <div className="admin-card">{restaurants.length ? <div className="admin-table-scroll"><table className="admin-table">
      <thead>
        <tr>
          <th>المطعم</th>
          <th>التواصل</th>
          <th>العنوان</th>
          <th>رسوم التوصيل</th>
          <th>المداخيل حسب الفترة</th>
          <th>الحالة</th>
          <th>الإجراءات</th>
        </tr>
      </thead>
      <tbody>
        {restaurants.map(r => {
          const stats = getTodayStats(r.id);
          const revenue = revenueByRestaurant.get(r.id);
          return <tr key={r.id} data-testid={`row-restaurant-${r.id}`}>
            <td>
              <div className="flex items-center gap-2.5">
                {r.imageUrl ? (
                  <img src={catalogImageUrl(r.imageUrl)} alt="" className="w-9 h-9 object-cover rounded-lg border border-border" />
                ) : (
                  <div className="w-9 h-9 bg-primary/10 text-primary font-bold rounded-lg flex items-center justify-center text-xs">
                    {r.name.charAt(0)}
                  </div>
                )}
                <div>
                  <strong>{r.name}</strong>
                  <small dir="ltr" className="block text-muted-foreground">#{r.id}</small>
                </div>
              </div>
            </td>
            <td dir="ltr">{r.phone || '—'}</td>
            <td>{r.address || '—'}</td>
            <td>{money(r.deliveryFee)} {CURRENCY}</td>
            <td>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 min-w-[210px]" data-testid={`revenue-periods-${r.id}`}>
                <small className="flex justify-between gap-2"><span>يومي</span><strong>{revenue ? money(revenue.dailyRevenue) : '—'} {CURRENCY}</strong></small>
                <small className="flex justify-between gap-2"><span>أسبوعي</span><strong>{revenue ? money(revenue.weeklyRevenue) : '—'} {CURRENCY}</strong></small>
                <small className="flex justify-between gap-2"><span>شهري</span><strong>{revenue ? money(revenue.monthlyRevenue) : '—'} {CURRENCY}</strong></small>
                <small className="flex justify-between gap-2"><span>سنوي</span><strong>{revenue ? money(revenue.yearlyRevenue) : '—'} {CURRENCY}</strong></small>
              </div>
            </td>
            <td><span className="status-pill">{r.status === 'ARCHIVED' ? 'مؤرشف' : r.status === 'INACTIVE' ? 'غير نشط' : 'مدرج'}</span></td>
            <td>
              <div className="admin-actions">
                <button
                  className="admin-action"
                  title="استخراج فاتورة / كشف مداخيل المطعم اليومية"
                  onClick={() => setSelectedSummary({
                    restaurantName: r.name,
                    date: new Intl.DateTimeFormat('ar', { dateStyle: 'full' }).format(new Date()),
                    ordersCount: stats.todayOrders.length,
                    totalRevenue: stats.todayRevenue,
                    deliveryFees: stats.todayDelivery,
                    orders: stats.todayOrders.length ? stats.todayOrders : stats.allOrders.slice(0, 15)
                  })}
                  data-testid={`button-invoice-restaurant-${r.id}`}
                >
                  <Receipt size={14}/>فاتورة المطعم
                </button>

                <button
                  className="admin-action"
                  title="نسخ الرابط المستقل للمطعم لمشاركته مع الزبائن"
                  onClick={() => copyRestaurantLink(r.id)}
                  data-testid={`button-copy-link-restaurant-${r.id}`}
                >
                  {copiedId === r.id ? <><Check size={14} className="text-green-600"/>تم النسخ</> : <><LinkIcon size={14}/>رابط الزبائن</>}
                </button>

                <button className="admin-action" onClick={() => setEditing(r)} data-testid={`button-edit-restaurant-${r.id}`}>
                  <Pencil size={14}/>تعديل
                </button>

                {r.status === 'ARCHIVED' ? (
                  <button className="admin-action" onClick={() => setRestoring(r)} data-testid={`button-restore-restaurant-${r.id}`}>
                    <RotateCcw size={14}/>استعادة
                  </button>
                ) : (
                  <button className="admin-action danger" onClick={() => setArchiving(r)} data-testid={`button-archive-restaurant-${r.id}`}>
                    <Archive size={14}/>أرشفة
                  </button>
                )}
              </div>
            </td>
          </tr>;
        })}
      </tbody>
    </table></div> : <EmptyBlock title="لا توجد مطاعم" text="أضف أول مطعم لبدء إدارة القوائم والطلبات."/>}</div>

    <EntityDialog
      open={!!editing}
      onClose={() => setEditing(null)}
      title={editing === 'new' ? 'إضافة مطعم جديد' : 'تعديل بيانات المطعم والصورة'}
      description="يمكنك تعديل بيانات المطعم ورفع صورته مباشرة من جهازك."
      fields={fields}
      initial={editing === 'new' ? {} : editing || {}}
      testId="restaurant"
      onSave={async values => {
        const name = String(values.name).trim(), phone = String(values.phone).trim(), address = String(values.address).trim();
        if (!name || !phone || !address) throw new Error('اسم المطعم ورقم الهاتف والعنوان حقول مطلوبة ولا يمكن تركها فارغة.');
        const body = {
          name,
          phone,
          address,
          description: values.description || null,
          deliveryFee: number(values.deliveryFee),
          imageUrl: values.imageUrl ? String(values.imageUrl) : null,
          logoUrl: values.imageUrl ? String(values.imageUrl) : null,
        };
        if (editing === 'new') await write('/api/admin/restaurants', 'POST', body);
        else if (editing) await write(`/api/admin/restaurants/${editing.id}`, 'PATCH', body);
      }}
    />

    <ConfirmDialog
      open={!!archiving}
      onClose={() => setArchiving(null)}
      title="أرشفة المطعم؟"
      description={`سيُخفى ${archiving?.name || 'المطعم'} من القائمة دون حذف سجل الطلبات السابق.`}
      action="أرشفة المطعم"
      testId="restaurant"
      onConfirm={async () => { if (archiving) await write(`/api/admin/restaurants/${archiving.id}`, 'DELETE'); }}
    />

    <ConfirmDialog
      open={!!restoring}
      onClose={() => setRestoring(null)}
      title="استعادة المطعم؟"
      description={`سيُعاد تفعيل ${restoring?.name || 'المطعم'} ويصبح متاحاً في القائمة مجدداً.`}
      action="تأكيد الاستعادة"
      testId="restaurant-restore"
      onConfirm={async () => { if (restoring) await write(`/api/admin/restaurants/${restoring.id}`, 'PATCH', { status: 'ACTIVE' }); }}
    />

    <InvoiceDialog
      open={!!selectedSummary}
      onClose={() => setSelectedSummary(null)}
      restaurantSummary={selectedSummary}
    />
  </div>;
}