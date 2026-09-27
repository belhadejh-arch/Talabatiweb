import { useMemo, useState } from 'react';
import { ArrowLeft, MapPin, Plus, Search, UtensilsCrossed } from 'lucide-react';
import { Header, CartPanel, ErrorState, LoadingState } from '../components/common';
import { useCatalog } from '../hooks/use-data';
import { useCart } from '../lib/cart';
import { catalogImageUrl, money } from '../lib/api';

export default function Browse() {
  const { data, isLoading, error, refetch } = useCatalog();
  const cart = useCart();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const restaurants = useMemo(() => data?.restaurants.filter(r => `${r.name} ${r.description || ''} ${r.address || ''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) || [], [data, search]);
  const selected = data?.restaurants.find(r => r.id === selectedId) || restaurants[0];
  const products = data?.products.filter(p => p.restaurantId === selected?.id) || [];
  const categories = [...new Set(products.map(p => p.category || 'القائمة'))];
  return <div dir="rtl" className="storefront min-h-[100dvh]">
    <Header />
    <section className="hero" style={selected?.imageUrl ? { backgroundImage: `url("${catalogImageUrl(selected.imageUrl)}")` } : undefined}><div className="shell hero-inner">
      <div><span className="eyebrow" style={{ color: '#ff7048' }}>مطعم مختار / طلبات</span><h1 className="display hero-title">{selected?.name || 'طلبات'}</h1><p className="text-sm md:text-base max-w-md leading-8 opacity-85">{selected?.address || selected?.description || 'اختر من قائمتنا أطباقك المفضلة.'}</p><a href="#restaurants" className="inline-flex items-center gap-2 mt-4 text-sm font-bold" data-testid="link-explore">اكتشف القائمة <ArrowLeft size={16}/></a></div>
      <div className="hero-orbit" aria-hidden="true"><div className="hero-orbit-inner"><UtensilsCrossed size={60} strokeWidth={1.2}/></div></div>
    </div></section>
    <main className="shell layout"><div className="min-w-0" id="restaurants">
      <div className="section-head"><div><span className="eyebrow" style={{ color: 'hsl(var(--primary))' }}>على قائمتنا اليوم</span><h2 className="section-title mt-2">اكتشف مكانك المفضّل</h2></div><label className="searchbox"><Search size={17} className="subtle"/><input type="search" placeholder="ابحث عن مطعم..." value={search} onChange={e => setSearch(e.target.value)} aria-label="ابحث عن مطعم" data-testid="input-search-restaurants"/></label></div>
      {isLoading ? <LoadingState/> : error ? <ErrorState message={(error as Error).message} onRetry={() => { void refetch(); }}/> : !data || data.restaurants.length === 0 ? <div className="surface text-center py-12"><div className="empty-illustration"><UtensilsCrossed size={29}/></div><h3 className="display text-2xl">لا توجد مطاعم حالياً</h3><p className="subtle mt-2">عد لاحقاً لرؤية المطاعم المتاحة.</p></div> : <>
         {restaurants.length === 0 ? <div className="surface text-center py-10"><h3 className="display text-2xl">لا توجد نتائج</h3><p className="subtle mt-2">جرّب البحث باسم آخر.</p><button className="btn btn-outline mt-5" onClick={() => setSearch('')} data-testid="button-clear-search">مسح البحث</button></div> : <div className="restaurant-grid">{restaurants.map((restaurant, index) => <button key={restaurant.id} onClick={() => { setSelectedId(restaurant.id); document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className={`restaurant-card ${selected?.id === restaurant.id ? 'active' : ''}`} data-testid={`button-restaurant-${restaurant.id}`} aria-pressed={selected?.id === restaurant.id}>
             {restaurant.imageUrl && <img className="restaurant-cover" src={catalogImageUrl(restaurant.imageUrl)} alt="" loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; }}/>}<span className="restaurant-number">0{index + 1} / مطعم</span><h3>{restaurant.name}</h3><p className="subtle text-xs mt-1 line-clamp-2">{restaurant.description || restaurant.address || 'اكتشف القائمة وما تقدّمه.'}</p><div className="flex items-center gap-1 subtle text-xs mt-4"><MapPin size={13}/>{restaurant.address || 'الموقع غير محدد'}</div><ArrowLeft className="arrow" size={20}/></button>)}</div>}
        {selected && <section id="menu" className="scroll-mt-28"><div className="menu-heading"><span className="eyebrow" style={{ color: 'hsl(var(--primary))' }}>من المطبخ إلى بابك</span><h2 className="section-title mt-2">{selected.name}</h2><p className="subtle text-sm mt-2">{selected.description || selected.address || 'اختر من القائمة'}</p></div>
             {products.length === 0 ? <div className="surface text-center py-9 subtle">لم تُضف أطباق إلى هذه القائمة بعد.</div> : categories.map(category => <div key={category}><h3 className="category-label">{category}</h3><div className="product-list">{products.filter(p => (p.category || 'القائمة') === category).map(product => <div className="product-row" key={product.id} data-testid={`card-product-${product.id}`}>{product.imageUrl && <img className="product-image" src={catalogImageUrl(product.imageUrl)} alt={product.name} loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; }}/>}<div className="min-w-0 flex-1"><h4>{product.name}</h4>{product.description && <p>{product.description}</p>}</div><div className="product-actions"><span className="price text-sm" data-testid={`text-price-${product.id}`}>{money(product.price)} ر.س</span><button type="button" className="icon-button" onClick={() => cart.add(product.restaurantId, product.id)} aria-label={`أضف ${product.name} إلى السلة`} data-testid={`button-add-product-${product.id}`}><Plus size={19}/></button></div></div>)}</div></div>)}</section>}
      </>}
    </div><div>{data ? <CartPanel catalog={data}/> : <div className="cart-panel"><div className="skeleton h-44"/></div>}</div></main>
    <footer className="border-t border-border py-8"><div className="shell flex flex-wrap items-center justify-between gap-3"><span className="brand text-xl">طلبات<span style={{ color: 'hsl(var(--primary))' }}>.</span></span><span className="subtle text-xs">وجبتك القادمة تبدأ هنا.</span></div></footer>
  </div>;
}