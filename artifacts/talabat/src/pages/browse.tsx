import { useEffect, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { Info, MapPin, Plus, UtensilsCrossed, Share2, Check } from 'lucide-react';
import { Header, CartPanel, ErrorState, LoadingState } from '../components/common';
import { useCatalog } from '../hooks/use-data';
import { useCart } from '../lib/cart';
import { catalogImageUrl, money, CURRENCY, restaurantMenuPath, restaurantMenuUrl } from '../lib/api';

export default function Browse() {
  const { data, isLoading, error, refetch } = useCatalog();
  const cart = useCart();
  const [, setLocation] = useLocation();
  const [, paramsNamedRest] = useRoute('/restaurant/:id/:name');
  const [, paramsRest] = useRoute('/restaurant/:id');
  const [, paramsR] = useRoute('/r/:id');
  const routeParam = paramsNamedRest?.id || paramsRest?.id || paramsR?.id;
  const isStandaloneLink = Boolean(routeParam);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (routeParam && data?.restaurants?.length) {
      const found = data.restaurants.find(r => String(r.id) === routeParam || r.slug === routeParam);
      if (found) {
        setSelectedId(found.id);
        return;
      }
    }
    const searchParams = new URLSearchParams(window.location.search);
    const restQuery = searchParams.get('restaurant');
    if (restQuery && data?.restaurants?.length) {
      const found = data.restaurants.find(r => String(r.id) === restQuery || r.slug === restQuery);
      if (found) setSelectedId(found.id);
    }
  }, [routeParam, data]);

  const restaurants = data?.restaurants ?? [];

  const linkedRestaurant = isStandaloneLink
    ? restaurants.find(r => String(r.id) === routeParam || r.slug === routeParam)
    : undefined;
  const selected = isStandaloneLink
    ? linkedRestaurant
    : data?.restaurants.find(r => r.id === selectedId) || restaurants[0];
  const products = data?.products.filter(p => p.restaurantId === selected?.id) || [];
  const categories = [...new Set(products.map(p => p.category || 'القائمة'))];

  const handleSelectRestaurant = (restaurant: (typeof restaurants)[number]) => {
    setLocation(restaurantMenuPath(restaurant));
  };

  const copyDirectRestaurantLink = () => {
    if (!selected) return;
    const url = restaurantMenuUrl(selected);
    navigator.clipboard?.writeText(url).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }).catch(() => {});
  };

  return <div dir="rtl" className="storefront min-h-[100dvh]">
    <Header standaloneName={isStandaloneLink ? selected?.name || 'قائمة المطعم' : undefined} standaloneRestaurantId={isStandaloneLink ? selected?.id : undefined} />
    {isStandaloneLink && (isLoading || error || !selected) ? <main className="shell py-16 text-center" data-testid={error ? 'status-restaurant-load-error' : !isLoading ? 'status-restaurant-not-found' : 'status-restaurant-loading'}>
      {isLoading ? <LoadingState/> : error ? <ErrorState message={(error as Error).message} onRetry={() => { void refetch(); }}/> : <div className="surface py-12"><div className="empty-illustration"><UtensilsCrossed size={29}/></div><h1 className="display text-2xl">المطعم غير متاح</h1><p className="subtle mt-2">تأكد من صحة الرابط أو تواصل مع المطعم للحصول على رابط جديد.</p></div>}
    </main> : <>
    <section className="hero" style={selected?.imageUrl ? { backgroundImage: `url("${catalogImageUrl(selected.imageUrl)}")` } : undefined}><div className="shell hero-inner">
      <div className="restaurant-identity">
        <div className="restaurant-avatar" aria-hidden="true">
          {selected?.imageUrl ? (
            <img src={catalogImageUrl(selected.imageUrl)} alt="" className="w-full h-full object-cover rounded-2xl" />
          ) : (
            selected?.name?.charAt(0) || <UtensilsCrossed size={28}/>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="display hero-title" data-testid="text-selected-restaurant">{selected?.name || 'طلبات'}</h1>
            {selected && !isStandaloneLink && (
              <button
                type="button"
                onClick={copyDirectRestaurantLink}
                className="bg-card/85 text-foreground hover:bg-card border border-border/80 px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
                title="نسخ الرابط المستقل لهذا المطعم لمشاركته مع الزبائن"
                data-testid="button-share-restaurant"
              >
                {copiedLink ? <><Check size={13} className="text-green-600"/>تم نسخ الرابط</> : <><Share2 size={13}/>نسخ رابط المطعم</>}
              </button>
            )}
          </div>
          <p className="restaurant-location"><MapPin size={14}/>{selected?.address || 'اكتشف المطاعم وقوائم الطعام'}</p>
          {!isStandaloneLink && <a href="#restaurants" className="inline-block mt-2 text-xs font-bold text-primary hover:underline" data-testid="link-explore">تصفح جميع المطاعم</a>}
        </div>
      </div>
    </div></section>
    <main className="shell layout"><div className="min-w-0" id={isStandaloneLink ? 'menu' : 'restaurants'}>
      {selected?.description && <div className="restaurant-about"><Info size={16}/><span>{selected.description}</span></div>}

      {!isStandaloneLink && <section className="restaurant-picker" aria-label="اختيار المطعم">
        <div className="restaurant-picker-title flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span>المطاعم المتاحة</span>
            <span className="subtle text-xs">{data?.restaurants.length ?? '—'} مطعم</span>
          </div>
        </div>

        {isLoading ? <LoadingState/> : error ? <ErrorState message={(error as Error).message} onRetry={() => { void refetch(); }}/> : !data || data.restaurants.length === 0 ? <div className="surface text-center py-12"><div className="empty-illustration"><UtensilsCrossed size={29}/></div><h3 className="display text-2xl">لا توجد مطاعم حالياً</h3><p className="subtle mt-2">عد لاحقاً لرؤية المطاعم المتاحة.</p></div> : <div className="restaurant-grid">{restaurants.map(restaurant => <button key={restaurant.id} onClick={() => handleSelectRestaurant(restaurant)} className={`restaurant-card ${selected?.id === restaurant.id ? 'active' : ''}`} data-testid={`button-restaurant-${restaurant.id}`} aria-pressed={selected?.id === restaurant.id}>
          {restaurant.imageUrl && <img className="restaurant-cover" src={catalogImageUrl(restaurant.imageUrl)} alt="" loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; }}/>}
          <div className="flex items-center justify-between gap-1 mt-1">
            <h3 className="mb-0">{restaurant.name}</h3>
            <div className="flex items-center gap-1.5">
              {!restaurant.isOpen && (
                <span className="text-[10px] font-bold bg-rose-500/15 text-rose-500 px-2 py-0.5 rounded-full" data-testid={`badge-closed-${restaurant.id}`}>
                  مغلق (يفتح {restaurant.openingTime})
                </span>
              )}
            </div>
          </div>
          <p className="subtle text-xs mt-1 line-clamp-2">{restaurant.description || restaurant.address}</p>
        </button>)}</div>}
      </section>}

      {selected && <section id="menu" className="scroll-mt-28">
        {!selected.isOpen && (
          <div className="mb-4 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-sm font-bold flex items-center gap-2" data-testid="banner-restaurant-closed">
            <span>⚠️ هذا المطعم مغلق حالياً (ساعات العمل: من {selected.openingTime} إلى {selected.closingTime}). لا يمكن إرسال طلبات في الوقت الحالي.</span>
          </div>
        )}
        <div className="menu-heading flex items-center justify-between gap-3 flex-wrap"><h2 className="section-title">قائمة {selected.name}</h2>{!isStandaloneLink && <button type="button" onClick={copyDirectRestaurantLink} className="text-xs text-primary font-bold hover:underline flex items-center gap-1"><Share2 size={13}/>{copiedLink ? 'تم نسخ الرابط' : 'مشاركة قائمة هذا المطعم'}</button>}</div>
        {products.length === 0 ? <div className="surface text-center py-9 subtle">لم تُضف أطباق إلى هذه القائمة بعد.</div> : <><nav className="category-nav" aria-label="أقسام القائمة">{categories.map((category, index) => <a href={`#menu-category-${index}`} key={category} data-testid={`link-category-${index}`}>{category}</a>)}</nav>{categories.map((category, index) => <div className="category-block" id={`menu-category-${index}`} key={category}><h3 className="category-title"><span>{category}</span><span className="category-count">{products.filter(p => (p.category || 'القائمة') === category).length}</span></h3><div className="product-list">{products.filter(p => (p.category || 'القائمة') === category).map(product => <div className="product-row" key={product.id} data-testid={`card-product-${product.id}`}>{product.imageUrl ? <img className="product-image" src={catalogImageUrl(product.imageUrl)} alt={product.name} loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; }}/> : <div className="product-placeholder" aria-hidden="true">{product.name.charAt(0)}</div>}<div className="min-w-0 flex-1"><h4>{product.name}</h4>{product.description && <p>{product.description}</p>}</div><div className="product-actions"><span className="price text-sm" data-testid={`text-price-${product.id}`}>{money(product.price)} {CURRENCY}</span><button type="button" className="icon-button" onClick={() => {
          if (!selected.isOpen) {
            alert('عذراً، هذا المطعم مغلق حالياً ولا يمكن إضافة منتجات للسلة أو إنشاء طلبات.');
            return;
          }
          cart.add(product.restaurantId, product.id);
        }} aria-label={`أضف ${product.name} إلى السلة`} data-testid={`button-add-product-${product.id}`}><Plus size={19}/></button></div></div>)}</div></div>)}</>}
      </section>}
    </div><div>{data ? <CartPanel catalog={isStandaloneLink && selected ? { ...data, restaurants: [selected], products } : data} restaurantId={isStandaloneLink ? selected?.id : undefined}/> : <div className="cart-panel"><div className="skeleton h-44"/></div>}</div></main>

    {!isStandaloneLink && <footer className="border-t border-border py-8"><div className="shell flex flex-wrap items-center justify-between gap-3"><span className="brand text-xl">طلبات<span style={{ color: 'hsl(var(--primary))' }}>.</span></span><span className="subtle text-xs">وجبتك القادمة تبدأ هنا.</span></div></footer>}
    </>}
  </div>;
}