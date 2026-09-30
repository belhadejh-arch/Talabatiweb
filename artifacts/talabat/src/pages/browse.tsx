import { useEffect, useMemo, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { Info, MapPin, Plus, Search, UtensilsCrossed, Share2, Check, ArrowRight } from 'lucide-react';
import { Header, CartPanel, ErrorState, LoadingState } from '../components/common';
import { useCatalog } from '../hooks/use-data';
import { useCart } from '../lib/cart';
import { catalogImageUrl, money, CURRENCY } from '../lib/api';

export default function Browse() {
  const { data, isLoading, error, refetch } = useCatalog();
  const cart = useCart();
  const [, setLocation] = useLocation();
  const [matchRest, paramsRest] = useRoute('/restaurant/:id');
  const [matchR, paramsR] = useRoute('/r/:id');
  const routeParam = paramsRest?.id || paramsR?.id;

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
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

  const restaurants = useMemo(() => data?.restaurants.filter(r => `${r.name} ${r.description || ''} ${r.address || ''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) || [], [data, search]);
  const selected = data?.restaurants.find(r => r.id === selectedId) || restaurants[0];
  const products = data?.products.filter(p => p.restaurantId === selected?.id) || [];
  const categories = [...new Set(products.map(p => p.category || 'القائمة'))];

  const handleSelectRestaurant = (id: number) => {
    setSelectedId(id);
    const url = new URL(window.location.href);
    url.searchParams.set('restaurant', String(id));
    window.history.replaceState({}, '', url.pathname + url.search);
    document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const copyDirectRestaurantLink = () => {
    if (!selected) return;
    const origin = window.location.origin;
    const url = `${origin}/restaurant/${selected.id}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }).catch(() => {});
  };

  return <div dir="rtl" className="storefront min-h-[100dvh]">
    <Header />
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
            {selected && (
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
          <a href="#restaurants" className="inline-block mt-2 text-xs font-bold text-primary hover:underline" data-testid="link-explore">تصفح جميع المطاعم</a>
        </div>
      </div>
    </div></section>
    <main className="shell layout"><div className="min-w-0" id="restaurants">
      {selected?.description && <div className="restaurant-about"><Info size={16}/><span>{selected.description}</span></div>}
      <section className="restaurant-picker" aria-label="اختيار المطعم">
        <div className="restaurant-picker-title"><span>المطاعم المتاحة</span><span className="subtle text-xs">{data?.restaurants.length ?? '—'} مطعم</span></div>
        <label className="searchbox"><Search size={16} className="subtle"/><input type="search" placeholder="ابحث عن مطعم..." value={search} onChange={e => setSearch(e.target.value)} aria-label="ابحث عن مطعم" data-testid="input-search-restaurants"/></label>
        {isLoading ? <LoadingState/> : error ? <ErrorState message={(error as Error).message} onRetry={() => { void refetch(); }}/> : !data || data.restaurants.length === 0 ? <div className="surface text-center py-12"><div className="empty-illustration"><UtensilsCrossed size={29}/></div><h3 className="display text-2xl">لا توجد مطاعم حالياً</h3><p className="subtle mt-2">عد لاحقاً لرؤية المطاعم المتاحة.</p></div> : restaurants.length === 0 ? <div className="surface text-center py-10"><h3 className="display text-2xl">لا توجد نتائج</h3><p className="subtle mt-2">جرّب البحث باسم آخر.</p><button className="btn btn-outline mt-5" onClick={() => setSearch('')} data-testid="button-clear-search">مسح البحث</button></div> : <div className="restaurant-grid">{restaurants.map(restaurant => <button key={restaurant.id} onClick={() => handleSelectRestaurant(restaurant.id)} className={`restaurant-card ${selected?.id === restaurant.id ? 'active' : ''}`} data-testid={`button-restaurant-${restaurant.id}`} aria-pressed={selected?.id === restaurant.id}>
          {restaurant.imageUrl && <img className="restaurant-cover" src={catalogImageUrl(restaurant.imageUrl)} alt="" loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; }}/>}<h3>{restaurant.name}</h3><p className="subtle text-xs mt-1 line-clamp-2">{restaurant.description || restaurant.address}</p></button>)}</div>}
      </section>
      {selected && <section id="menu" className="scroll-mt-28"><div className="menu-heading flex items-center justify-between gap-3 flex-wrap"><h2 className="section-title">قائمة {selected.name}</h2><button type="button" onClick={copyDirectRestaurantLink} className="text-xs text-primary font-bold hover:underline flex items-center gap-1"><Share2 size={13}/>{copiedLink ? 'تم نسخ الرابط' : 'مشاركة قائمة هذا المطعم'}</button></div>
        {products.length === 0 ? <div className="surface text-center py-9 subtle">لم تُضف أطباق إلى هذه القائمة بعد.</div> : <><nav className="category-nav" aria-label="أقسام القائمة">{categories.map((category, index) => <a href={`#menu-category-${index}`} key={category} data-testid={`link-category-${index}`}>{category}</a>)}</nav>{categories.map((category, index) => <div className="category-block" id={`menu-category-${index}`} key={category}><h3 className="category-title"><span>{category}</span><span className="category-count">{products.filter(p => (p.category || 'القائمة') === category).length}</span></h3><div className="product-list">{products.filter(p => (p.category || 'القائمة') === category).map(product => <div className="product-row" key={product.id} data-testid={`card-product-${product.id}`}>{product.imageUrl ? <img className="product-image" src={catalogImageUrl(product.imageUrl)} alt={product.name} loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; }}/> : <div className="product-placeholder" aria-hidden="true">{product.name.charAt(0)}</div>}<div className="min-w-0 flex-1"><h4>{product.name}</h4>{product.description && <p>{product.description}</p>}</div><div className="product-actions"><span className="price text-sm" data-testid={`text-price-${product.id}`}>{money(product.price)} {CURRENCY}</span><button type="button" className="icon-button" onClick={() => cart.add(product.restaurantId, product.id)} aria-label={`أضف ${product.name} إلى السلة`} data-testid={`button-add-product-${product.id}`}><Plus size={19}/></button></div></div>)}</div></div>)}</>}
      </section>}
    </div><div>{data ? <CartPanel catalog={data}/> : <div className="cart-panel"><div className="skeleton h-44"/></div>}</div></main>
    <footer className="border-t border-border py-8"><div className="shell flex flex-wrap items-center justify-between gap-3"><span className="brand text-xl">طلبات<span style={{ color: 'hsl(var(--primary))' }}>.</span></span><span className="subtle text-xs">وجبتك القادمة تبدأ هنا.</span></div></footer>
  </div>;
}