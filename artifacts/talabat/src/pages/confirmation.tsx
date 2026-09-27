import { Check, Clock3, ReceiptText, ArrowRight } from 'lucide-react';
import { Link } from 'wouter';
import { Header } from '../components/common';
import { dateLabel, money, statusLabel, type Order } from '../lib/api';

function lastOrder(): Order | null {
  try { const value = JSON.parse(sessionStorage.getItem('talabat-last-order') || 'null') as Order | null; return value?.id ? value : null; } catch { return null; }
}
export default function Confirmation() {
  const order = lastOrder();
  return <div dir="rtl" className="confirmation-page min-h-[100dvh]"><Header/><main className="shell page-wrap max-w-4xl">
    {!order ? <div className="surface text-center py-16"><div className="empty-illustration"><ReceiptText size={30}/></div><h1 className="section-title">لا يوجد طلب لعرضه</h1><p className="subtle mt-3 mb-6">تظهر هنا تفاصيل الطلب الذي أكملته في هذه الجلسة فقط.</p><Link href="/" className="btn btn-primary" data-testid="link-browse-after-empty">تصفّح المطاعم</Link></div> : <>
      <div className="w-16 h-16 rounded-full grid place-items-center mb-7" style={{ background: 'hsl(var(--secondary))' }}><Check size={32}/></div>
      <span className="eyebrow" style={{ color: 'hsl(var(--primary))' }}>تم استلام الطلب</span><h1 className="section-title mt-2">طلبك في الطريق إلى المطبخ.</h1><p className="subtle mt-4 max-w-lg leading-8">شكراً لك يا {order.customerName}. تم تسجيل طلبك بنجاح، وهذه تفاصيله كما وردت من المطعم.</p>
      <div className="grid grid-cols-1 gap-4 mt-10">
        <div className="surface"><span className="eyebrow subtle">رقم الطلب</span><div className="display text-4xl mt-2" dir="ltr" data-testid="text-order-id">#{order.id}</div><div className="border-t border-border mt-7 pt-5 flex justify-between gap-3 text-sm"><span>الحالة</span><span className="status-pill" data-testid="status-order">{statusLabel(order.status)}</span></div><div className="total-line text-sm"><span>نوع الطلب</span><span>{order.orderType === 'DELIVERY' ? 'توصيل' : 'حجز'}</span></div><div className="total-line text-sm"><span>تاريخ الطلب</span><span data-testid="text-order-created">{dateLabel(order.createdAt)}</span></div>{order.orderType === 'RESERVATION' && <><div className="total-line text-sm"><span>موعد الحجز</span><span>{order.reservationDate}، {order.reservationTime}</span></div><div className="total-line text-sm"><span>عدد الأشخاص</span><span>{order.partySize}</span></div></>}</div>
        <div className="surface"><span className="eyebrow subtle">فاتورة الطلب</span><h2 className="display text-2xl mt-2">{order.restaurantName || 'تفاصيل الطلب'}</h2><div className="mt-5">{order.items?.map((item, i) => <div key={`${item.productId}-${i}`} className="total-line border-b border-border text-sm"><span>{item.quantity} × {item.productName || `منتج #${item.productId}`}</span><span>{item.totalPrice != null ? `${money(item.totalPrice)} ر.س` : ''}</span></div>)}</div><div className="total-line text-sm mt-3"><span>المنتجات</span><span>{money(order.subtotal)} ر.س</span></div><div className="total-line text-sm"><span>رسوم التوصيل</span><span>{money(order.deliveryFee)} ر.س</span></div><div className="total-line font-bold text-lg border-t border-border mt-2 pt-4"><span>المجموع النهائي</span><span data-testid="text-order-total">{money(order.totalAmount)} ر.س</span></div></div>
      </div>
      <div className="notice flex gap-3 items-start mt-6"><Clock3 size={19} className="shrink-0 mt-1"/><p>احتفظ برقم طلبك للرجوع إليه عند التواصل مع المطعم. هذه الصفحة تعرض آخر طلب ناجح في جلستك الحالية.</p></div>
      <Link href="/" className="btn btn-dark mt-8" data-testid="link-back-home"><ArrowRight size={17}/> العودة للقائمة</Link>
    </>}
  </main></div>;
}