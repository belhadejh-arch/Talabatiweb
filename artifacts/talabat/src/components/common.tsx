import { ArrowLeft, ChevronLeft, Minus, Plus, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import { Link } from 'wouter';
import { useCart } from '../lib/cart';
import { money, type Catalog } from '../lib/api';

export function Header() {
  const { count } = useCart();
  return <header className="site-header"><div className="shell header-inner">
    <Link href="/" className="brand" data-testid="link-home"><span className="brand-mark"><UtensilsCrossed size={19} strokeWidth={2.6} /></span><span>طلبات<span style={{ color: 'hsl(var(--primary))' }}>.</span></span></Link>
    <nav className="nav-actions" aria-label="التنقل الرئيسي">
      <Link href="/admin" className="btn btn-plain admin-link" data-testid="link-admin">لوحة الإدارة</Link>
      <Link href="/#cart" className="btn btn-dark" data-testid="link-cart"><ShoppingBag size={17}/><span>السلة</span><span aria-label={`${count} عناصر`}>({count})</span></Link>
    </nav>
  </div></header>;
}

export function CartPanel({ catalog }: { catalog: Catalog }) {
  const cart = useCart();
  const restaurant = catalog.restaurants.find(r => r.id === cart.restaurantId);
  const rows = cart.items.map(item => ({ ...item, product: catalog.products.find(p => p.id === item.productId) }));
  const estimated = rows.reduce((sum, row) => sum + (row.product ? Number(row.product.price) * row.quantity : 0), 0);
  return <aside className="cart-panel" id="cart" aria-label="سلة الطلب">
    <div className="cart-head"><div><span className="eyebrow" style={{ color: 'hsl(var(--primary))' }}>طلبك الآن</span><h2 className="display text-2xl mt-1">سلة الطلب</h2></div><ShoppingBag size={22}/></div>
    {cart.items.length === 0 ? <div className="text-center py-6"><div className="empty-illustration"><ShoppingBag size={31}/></div><h3 className="font-bold">السلة تنتظر اختيارك</h3><p className="subtle text-sm mt-2">تصفّح القائمة وأضف ما تشتهيه.</p></div> : <>
      <p className="subtle text-xs mb-2">من {restaurant?.name || 'مطعم غير متاح'}</p>
      {rows.map(row => <div className="cart-item" key={row.productId} data-testid={`cart-item-${row.productId}`}>
        <div className="min-w-0"><p className="font-bold text-sm">{row.product?.name || `منتج #${row.productId}`}</p><span className="subtle text-xs">{row.product ? `${money(Number(row.product.price) * row.quantity)} ر.س تقريباً` : 'لم يعد متاحاً'}</span></div>
        <div className="stepper" aria-label={`كمية ${row.product?.name || 'المنتج'}`}><button onClick={() => cart.setQuantity(row.productId, row.quantity - 1)} aria-label="تقليل الكمية" data-testid={`button-decrease-${row.productId}`}><Minus size={13}/></button><span className="text-xs font-bold" data-testid={`text-quantity-${row.productId}`}>{row.quantity}</span><button onClick={() => cart.setQuantity(row.productId, row.quantity + 1)} disabled={row.quantity >= 99} aria-label="زيادة الكمية" data-testid={`button-increase-${row.productId}`}><Plus size={13}/></button></div>
      </div>)}
      <div className="total-line font-bold mt-4"><span>المجموع التقديري</span><span data-testid="text-estimated-total">{money(estimated)} ر.س</span></div>
      <p className="subtle text-xs leading-relaxed mb-4">تُحسب الرسوم والمبلغ النهائي من الخادم عند تأكيد الطلب.</p>
      <Link href="/checkout" className="btn btn-primary w-full" data-testid="link-checkout">إتمام الطلب <ArrowLeft size={17}/></Link>
      <button onClick={() => { if (window.confirm('هل تريد إفراغ السلة؟')) cart.clear(); }} className="w-full text-center text-xs subtle mt-4 hover:underline" data-testid="button-clear-cart">إفراغ السلة</button>
    </>}
  </aside>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="surface text-center py-12" role="alert" data-testid="status-error"><h2 className="display text-2xl">تعذّر تحميل البيانات</h2><p className="subtle mt-3 mb-5">{message}</p>{onRetry && <button className="btn btn-primary" onClick={onRetry} data-testid="button-retry">إعادة المحاولة <ChevronLeft size={16}/></button>}</div>;
}
export function LoadingState() {
  return <div aria-label="جارٍ تحميل البيانات" role="status" className="grid gap-4" data-testid="status-loading"><div className="skeleton h-12 w-52"/><div className="grid md:grid-cols-2 gap-4"><div className="skeleton h-44"/><div className="skeleton h-44"/></div><div className="skeleton h-24"/></div>;
}