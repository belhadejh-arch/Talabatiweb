import { useState } from 'react';
import { ArrowRight, Crosshair, MapPin, ShoppingBag } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { Form } from '@/components/ui/form';
import { Header, ErrorState, LoadingState } from '../components/common';
import LocationPickerMap from '../components/location-map';
import { useCatalog } from '../hooks/use-data';
import { useCart } from '../lib/cart';
import { api, money, CURRENCY, type OrderInput } from '../lib/api';

type CheckoutFields = { customerName: string; customerPhone: string; notes: string; latitude: string; longitude: string; reservationDate: string; reservationTime: string; partySize: string };
type PendingAttempt = { key: string; input: OrderInput };
function readPending(): PendingAttempt | null {
  try {
    const value = JSON.parse(sessionStorage.getItem('talabat-pending-order') || 'null') as PendingAttempt | null;
    return value?.key && value?.input?.items?.length ? value : null;
  } catch { return null; }
}
function getSavedUserLocation(): { lat: string; lng: string } {
  try {
    const raw = localStorage.getItem('talabat-user-location');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.latitude != null && parsed?.longitude != null) {
        return { lat: String(parsed.latitude), lng: String(parsed.longitude) };
      }
    }
  } catch {}
  return { lat: '', lng: '' };
}
const today = () => { const d = new Date(); const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 10); };

export default function Checkout() {
  const [, navigate] = useLocation();
  const cart = useCart();
  const { data, error: catalogError, isLoading, refetch } = useCatalog();
  const [orderType, setOrderType] = useState<'DELIVERY' | 'RESERVATION'>(() => readPending()?.input.orderType || 'DELIVERY');
  const [pending, setPending] = useState<PendingAttempt | null>(readPending);
  const [error, setError] = useState('');
  const [geoState, setGeoState] = useState('');
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const savedLoc = getSavedUserLocation();
  const form = useForm<CheckoutFields>({
    defaultValues: {
      customerName: pending?.input.customerName || '',
      customerPhone: pending?.input.customerPhone || '',
      notes: pending?.input.notes || '',
      latitude: pending?.input.latitude == null ? savedLoc.lat : String(pending.input.latitude),
      longitude: pending?.input.longitude == null ? savedLoc.lng : String(pending.input.longitude),
      reservationDate: pending?.input.reservationDate || '',
      reservationTime: pending?.input.reservationTime || '',
      partySize: String(pending?.input.partySize || 2)
    }
  });
  const restaurant = data?.restaurants.find(r => r.id === cart.restaurantId);
  const rows = cart.items.map(item => ({ ...item, product: data?.products.find(p => p.id === item.productId) }));
  const estimate = rows.reduce((sum, row) => sum + (row.product ? Number(row.product.price) * row.quantity : 0), 0);
  const currentLat = Number(form.watch('latitude'));
  const currentLng = Number(form.watch('longitude'));

  const getLocation = () => {
    if (!navigator.geolocation) { setGeoState('المتصفح لا يدعم تحديد الموقع. حدد موقعك على الخريطة أدناه.'); return; }
    setLocating(true); setGeoState('');
    navigator.geolocation.getCurrentPosition(position => {
      form.setValue('latitude', String(position.coords.latitude.toFixed(6)), { shouldValidate: true });
      form.setValue('longitude', String(position.coords.longitude.toFixed(6)), { shouldValidate: true });
      setGeoState('تم تحديد موقع التوصيل بنجاح.'); setLocating(false);
    }, () => { setGeoState('تعذّر تحديد الموقع عبر GPS. يمكنك النقر على الخريطة لتحديده.'); setLocating(false); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
  };
  const sendAttempt = async (attempt: PendingAttempt) => {
    setError('');
    setSubmitting(true);
    try {
      const result = await api.createOrder(attempt.input, attempt.key);
      sessionStorage.setItem('talabat-last-order', JSON.stringify(result.order));
      sessionStorage.removeItem('talabat-pending-order');
      setPending(null);
      cart.clear();
      navigate('/order-confirmation');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذّر إرسال الطلب. أعد المحاولة.'); }
    finally { setSubmitting(false); }
  };
  const submit = form.handleSubmit(async values => {
    setError('');
    let attempt = pending;
    if (!attempt) {
      if (!restaurant || !cart.items.length || rows.some(row => !row.product || row.product.restaurantId !== restaurant.id)) { setError('بعض عناصر السلة لم تعد متاحة. راجع السلة قبل الإكمال.'); return; }
      const input: OrderInput = { restaurantId: restaurant.id, customerName: values.customerName.trim(), customerPhone: values.customerPhone.trim(), orderType, items: cart.items.map(item => ({ productId: item.productId, quantity: item.quantity })) };
      if (values.notes.trim()) input.notes = values.notes.trim();
      if (orderType === 'DELIVERY') {
        const latitude = Number(values.latitude), longitude = Number(values.longitude);
        if (!values.latitude.trim() || !values.longitude.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) { setError('أدخل إحداثيات توصيل صحيحة أو استخدم زر تحديد الموقع.'); return; }
        input.latitude = latitude; input.longitude = longitude;
      } else {
        if (!values.reservationDate || values.reservationDate < today() || !values.reservationTime || !Number.isInteger(Number(values.partySize)) || Number(values.partySize) < 1 || Number(values.partySize) > 100) { setError('تأكّد من تاريخ ووقت الحجز وعدد الأشخاص (1 إلى 100).'); return; }
        input.reservationDate = values.reservationDate; input.reservationTime = values.reservationTime; input.partySize = Number(values.partySize);
      }
      attempt = { key: crypto.randomUUID(), input };
      sessionStorage.setItem('talabat-pending-order', JSON.stringify(attempt));
      setPending(attempt);
    }
    await sendAttempt(attempt);
  });
  return <div dir="rtl" className="checkout-page min-h-[100dvh]"><Header/><main className="shell page-wrap">
    <Link href="/" className="inline-flex gap-2 items-center text-sm subtle hover:underline mb-7" data-testid="link-back-browse"><ArrowRight size={16}/> العودة للقائمة</Link>
    <span className="eyebrow block" style={{ color: 'hsl(var(--primary))' }}>الخطوة الأخيرة</span><h1 className="section-title mt-2">تأكيد طلبك</h1><p className="subtle mt-3">تفاصيل صغيرة تفصل بينك وبين وجبتك.</p>
    {isLoading && !pending ? <div className="mt-8"><LoadingState/></div> : catalogError && !pending ? <div className="mt-8"><ErrorState message={(catalogError as Error).message} onRetry={() => { void refetch(); }}/></div> : !cart.items.length && !pending ? <div className="surface text-center max-w-xl mx-auto mt-10 py-14"><div className="empty-illustration"><ShoppingBag size={30}/></div><h2 className="display text-3xl">سلتك فارغة</h2><p className="subtle mt-3 mb-6">ابدأ بإضافة شيء يعجبك من القائمة.</p><Link href="/" className="btn btn-primary" data-testid="link-start-shopping">تصفّح المطاعم</Link></div> : <div className="checkout-grid">
      <Form {...form}><form onSubmit={submit} className="form-stack" noValidate>
        {pending && <div className="notice" role="status" data-testid="status-pending-order"><strong>محاولة طلب محفوظة.</strong> إعادة المحاولة ترسل نفس البيانات ونفس معرّف الطلب؛ التعديلات الجديدة تتطلب بدء طلب جديد. <button type="button" className="underline font-bold" onClick={() => { sessionStorage.removeItem('talabat-pending-order'); setPending(null); setError(''); }} data-testid="button-fresh-order">بدء طلب جديد</button></div>}
        <section className="surface form-stack"><div><span className="eyebrow" style={{ color: 'hsl(var(--primary))' }}>01 / بياناتك</span><h2 className="display text-2xl mt-2">كيف نناديك؟</h2></div>
          <div className="field-grid"><label className="field">الاسم الكامل<input {...form.register('customerName', { required: true, maxLength: 120 })} disabled={!!pending} autoComplete="name" placeholder="اسمك الكامل" data-testid="input-customer-name" required/></label><label className="field">رقم الهاتف<input {...form.register('customerPhone', { required: true, minLength: 3, maxLength: 40 })} disabled={!!pending} type="tel" inputMode="tel" autoComplete="tel" placeholder="رقم للتواصل" dir="ltr" data-testid="input-customer-phone" required/></label></div>
          {(form.formState.errors.customerName || form.formState.errors.customerPhone) && <p className="text-sm text-destructive" role="alert">يرجى إدخال الاسم ورقم هاتف صالح.</p>}
        </section>
        <section className="surface form-stack"><div><span className="eyebrow" style={{ color: 'hsl(var(--primary))' }}>02 / طريقة الطلب</span><h2 className="display text-2xl mt-2">على راحتك</h2></div>
          <div className="choice-grid"><button type="button" disabled={!!pending} onClick={() => setOrderType('DELIVERY')} className={`choice ${orderType === 'DELIVERY' ? 'active' : ''}`} aria-pressed={orderType === 'DELIVERY'} data-testid="button-type-delivery"><MapPin size={20} className="mb-2"/><strong className="block">توصيل</strong><span className="subtle text-xs">إلى موقعك</span></button><button type="button" disabled={!!pending} onClick={() => setOrderType('RESERVATION')} className={`choice ${orderType === 'RESERVATION' ? 'active' : ''}`} aria-pressed={orderType === 'RESERVATION'} data-testid="button-type-reservation"><ShoppingBag size={20} className="mb-2"/><strong className="block">حجز</strong><span className="subtle text-xs">موعد في المطعم</span></button></div>
          {!pending && (orderType === 'DELIVERY' ? <div className="form-stack">
            <div className="notice">يرجى التأكد من موقع التوصيل على الخريطة قبل إرسال الطلب. يمكنك النقر على الخريطة لتعديل وتحديد مكان استلام الوجبة بدقة أو استخدام زر GPS.</div>
            <LocationPickerMap
              latitude={Number.isFinite(currentLat) && currentLat !== 0 ? currentLat : null}
              longitude={Number.isFinite(currentLng) && currentLng !== 0 ? currentLng : null}
              onChange={(lat, lng) => {
                form.setValue('latitude', String(lat), { shouldValidate: true });
                form.setValue('longitude', String(lng), { shouldValidate: true });
                setGeoState(`تم تحديد الموقع: (${lat}, ${lng})`);
              }}
              label="تأكيد وتعديل موقع التوصيل على الخريطة"
            />
            {geoState && <p className="text-sm subtle" role="status" data-testid="status-location">{geoState}</p>}
            <div className="field-grid">
              <label className="field">خط العرض (Latitude)<input {...form.register('latitude')} type="number" step="any" min="-90" max="90" dir="ltr" placeholder="32.8872" data-testid="input-latitude"/></label>
              <label className="field">خط الطول (Longitude)<input {...form.register('longitude')} type="number" step="any" min="-180" max="180" dir="ltr" placeholder="13.1913" data-testid="input-longitude"/></label>
            </div>
          </div> : <div className="field-grid"><label className="field">تاريخ الحجز<input {...form.register('reservationDate')} type="date" min={today()} data-testid="input-reservation-date"/></label><label className="field">الوقت<input {...form.register('reservationTime')} type="time" data-testid="input-reservation-time"/></label><label className="field">عدد الأشخاص<input {...form.register('partySize')} type="number" min="1" max="100" data-testid="input-party-size"/></label></div>)}
        </section>
        <section className="surface"><label className="field">ملاحظات إضافية <span className="subtle font-normal">اختياري</span><textarea {...form.register('notes', { maxLength: 2000 })} disabled={!!pending} placeholder="أي شيء ينبغي أن يعرفه المطعم؟" data-testid="input-order-notes"/></label></section>
        {error && <div className="error-box" role="alert" data-testid="status-submit-error">{error}</div>}
        {pending ? <button type="button" onClick={() => { void sendAttempt(pending); }} className="btn btn-primary w-full py-4" disabled={submitting} data-testid="button-submit-order">{submitting ? 'جارٍ إرسال الطلب...' : 'إعادة محاولة إرسال الطلب'}</button> : <button type="submit" className="btn btn-primary w-full py-4" disabled={submitting} data-testid="button-submit-order">{submitting ? 'جارٍ إرسال الطلب...' : 'تأكيد وإرسال الطلب'}</button>}
      </form></Form>
       <aside className="surface checkout-summary md:sticky md:top-24"><span className="eyebrow" style={{ color: 'hsl(var(--primary))' }}>ملخص الطلب</span><h2 className="display text-2xl mt-2 mb-5">{restaurant?.name || 'طلبك'}</h2>{rows.map(row => <div className="total-line text-sm border-b border-border" key={row.productId}><span>{row.quantity} × {row.product?.name || `منتج #${row.productId}`}</span><span>{row.product ? `${money(Number(row.product.price) * row.quantity)} ${CURRENCY}` : 'غير متاح'}</span></div>)}<div className="total-line font-bold mt-4"><span>تقدير المنتجات</span><span data-testid="text-checkout-estimate">{money(estimate)} {CURRENCY}</span></div><p className="subtle text-xs leading-6 mt-3">السعر النهائي ورسوم التوصيل يُحتسبان على الخادم بعد إرسال الطلب.</p></aside>
    </div>}
  </main></div>;
}