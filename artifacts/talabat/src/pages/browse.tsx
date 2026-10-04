import { useEffect, useMemo, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { Info, MapPin, Plus, UtensilsCrossed, Share2, Check, Crosshair, Navigation, X } from 'lucide-react';
import { Header, CartPanel, ErrorState, LoadingState } from '../components/common';
import { useCatalog } from '../hooks/use-data';
import { useCart } from '../lib/cart';
import { catalogImageUrl, money, CURRENCY, calculateDistanceKm, formatDistance } from '../lib/api';

type UserLocation = { latitude: number; longitude: number; label?: string };

const LIBYAN_CITIES = [
  { name: 'طرابلس (الميدان)', lat: 32.8872, lng: 13.1913 },
  { name: 'بنغازي (المركز)', lat: 32.1167, lng: 20.0667 },
  { name: 'مصراتة (المركز)', lat: 32.3754, lng: 15.0925 },
  { name: 'الزاوية (المركز)', lat: 32.7522, lng: 12.7278 },
  { name: 'البيضاء (المركز)', lat: 32.7628, lng: 21.7551 },
  { name: 'طبرق (المركز)', lat: 32.0836, lng: 23.9764 },
];

export default function Browse() {
  const { data, isLoading, error, refetch } = useCatalog();
  const cart = useCart();
  const [, setLocation] = useLocation();
  const [matchRest, paramsRest] = useRoute('/restaurant/:id');
  const [matchR, paramsR] = useRoute('/r/:id');
  const routeParam = paramsRest?.id || paramsR?.id;

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // User location state
  const [userLocation, setUserLocation] = useState<UserLocation | null>(() => {
    try {
      const raw = localStorage.getItem('talabat-user-location');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.latitude != null && parsed?.longitude != null) return parsed;
      }
    } catch {}
    return null;
  });
  const [showLocationPrompt, setShowLocationPrompt] = useState(() => {
    try {
      return !localStorage.getItem('talabat-user-location') && !sessionStorage.getItem('talabat-dismissed-loc-prompt');
    } catch { return true; }
  });
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState('');
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualLat, setManualLat] = useState('32.8872');
  const [manualLng, setManualLng] = useState('13.1913');

  const requestGpsLocation = () => {
    if (!navigator.geolocation) {
      setLocError('المتصفح لا يدعم تحديد الموقع. يمكنك اختيار المدينة يدوياً.');
      return;
    }
    setLocating(true);
    setLocError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next: UserLocation = {
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
          label: 'موقعي الحالي عبر GPS'
        };
        setUserLocation(next);
        localStorage.setItem('talabat-user-location', JSON.stringify(next));
        setShowLocationPrompt(false);
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setLocError(err.code === 1 ? 'تم رفض إذن الوصول للموقع. يمكنك تحديد موقعك يدوياً أدناه.' : 'تعذر تحديد الموقع الجغرافي حالياً.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleSetManualLocation = (lat: number, lng: number, label: string) => {
    const next: UserLocation = { latitude: lat, longitude: lng, label };
    setUserLocation(next);
    localStorage.setItem('talabat-user-location', JSON.stringify(next));
    setShowLocationPrompt(false);
    setManualModalOpen(false);
  };

  const dismissLocationPrompt = () => {
    setShowLocationPrompt(false);
    try { sessionStorage.setItem('talabat-dismissed-loc-prompt', 'true'); } catch {}
  };

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

  // Sort restaurants by real calculated distance if userLocation is available
  const restaurants = useMemo(() => {
    if (!data?.restaurants) return [];
    const mapped = data.restaurants.map(r => {
      const distanceKm = (userLocation && r.latitude != null && r.longitude != null)
        ? calculateDistanceKm(userLocation.latitude, userLocation.longitude, r.latitude, r.longitude)
        : null;
      return { ...r, distanceKm };
    });

    if (!userLocation) return mapped;

    // Show closest restaurants first; restaurants without coordinates at the end
    return mapped.sort((a, b) => {
      if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
      if (a.distanceKm != null) return -1;
      if (b.distanceKm != null) return 1;
      return 0;
    });
  }, [data, userLocation]);

  const selected = data?.restaurants.find(r => r.id === selectedId) || restaurants[0];
  const products = data?.products.filter(p => p.restaurantId === selected?.id) || [];
  const categories = [...new Set(products.map(p => p.category || 'القائمة'))];

  const handleSelectRestaurant = (id: number) => {
    setLocation(`/restaurant/${id}`);
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

      {/* Location determination prompt on first visit or whenever user wants to set it */}
      {showLocationPrompt && !userLocation && (
        <div className="mb-6 p-4 rounded-2xl border-2 border-primary/20 bg-primary/5 flex items-center justify-between gap-4 flex-wrap" data-testid="banner-location-prompt">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center shrink-0">
              <Navigation size={20}/>
            </div>
            <div>
              <strong className="block text-sm">حدد موقعك لعرض المطاعم الأقرب إليك أولاً</strong>
              <p className="text-xs text-muted-foreground mt-0.5">سنحسب المسافة الحقيقية الدقيقة بين موقعك وكل مطعم لتسهيل التوصيل.</p>
              {locError && <p className="text-xs text-destructive mt-1 font-medium">{locError}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={requestGpsLocation}
              disabled={locating}
              className="btn btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5"
              data-testid="button-request-gps"
            >
              <Crosshair size={14} className={locating ? 'animate-spin' : ''}/>
              <span>{locating ? 'جارٍ التحديد...' : 'تحديد موقعي (GPS)'}</span>
            </button>
            <button
              type="button"
              onClick={() => setManualModalOpen(true)}
              className="btn btn-outline text-xs px-3 py-1.5"
              data-testid="button-set-manual-loc"
            >
              تحديد يدوي
            </button>
            <button
              type="button"
              onClick={dismissLocationPrompt}
              className="text-muted-foreground hover:text-foreground p-1 text-xs"
              title="تخطي"
            >
              <X size={16}/>
            </button>
          </div>
        </div>
      )}

      <section className="restaurant-picker" aria-label="اختيار المطعم">
        <div className="restaurant-picker-title flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span>المطاعم المتاحة</span>
            <span className="subtle text-xs">{data?.restaurants.length ?? '—'} مطعم</span>
            {userLocation && (
              <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full flex items-center gap-1" title="مرتبة من الأقرب إلى الأبعد">
                <Navigation size={11}/>
                الأقرب لموقعك أولاً
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {userLocation ? (
              <button
                type="button"
                onClick={() => setManualModalOpen(true)}
                className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                data-testid="button-change-location"
              >
                <MapPin size={12} className="text-primary"/>
                <span>موقعك: {userLocation.label || 'محدد'}</span>
                <span className="underline">(تغيير)</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={requestGpsLocation}
                disabled={locating}
                className="text-xs text-primary font-bold hover:underline flex items-center gap-1"
                data-testid="button-activate-gps"
              >
                <Crosshair size={12}/>
                <span>تحديد موقعي لترتيب الأقرب</span>
              </button>
            )}
          </div>
        </div>

        {isLoading ? <LoadingState/> : error ? <ErrorState message={(error as Error).message} onRetry={() => { void refetch(); }}/> : !data || data.restaurants.length === 0 ? <div className="surface text-center py-12"><div className="empty-illustration"><UtensilsCrossed size={29}/></div><h3 className="display text-2xl">لا توجد مطاعم حالياً</h3><p className="subtle mt-2">عد لاحقاً لرؤية المطاعم المتاحة.</p></div> : <div className="restaurant-grid">{restaurants.map(restaurant => <button key={restaurant.id} onClick={() => handleSelectRestaurant(restaurant.id)} className={`restaurant-card ${selected?.id === restaurant.id ? 'active' : ''}`} data-testid={`button-restaurant-${restaurant.id}`} aria-pressed={selected?.id === restaurant.id}>
          {restaurant.imageUrl && <img className="restaurant-cover" src={catalogImageUrl(restaurant.imageUrl)} alt="" loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; }}/>}
          <div className="flex items-center justify-between gap-1 mt-1">
            <h3 className="mb-0">{restaurant.name}</h3>
            {restaurant.distanceKm != null && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0" data-testid={`badge-distance-${restaurant.id}`}>
                <MapPin size={10}/>
                {formatDistance(restaurant.distanceKm)}
              </span>
            )}
          </div>
          <p className="subtle text-xs mt-1 line-clamp-2">{restaurant.description || restaurant.address}</p>
        </button>)}</div>}
      </section>

      {selected && <section id="menu" className="scroll-mt-28"><div className="menu-heading flex items-center justify-between gap-3 flex-wrap"><h2 className="section-title">قائمة {selected.name}</h2><button type="button" onClick={copyDirectRestaurantLink} className="text-xs text-primary font-bold hover:underline flex items-center gap-1"><Share2 size={13}/>{copiedLink ? 'تم نسخ الرابط' : 'مشاركة قائمة هذا المطعم'}</button></div>
        {products.length === 0 ? <div className="surface text-center py-9 subtle">لم تُضف أطباق إلى هذه القائمة بعد.</div> : <><nav className="category-nav" aria-label="أقسام القائمة">{categories.map((category, index) => <a href={`#menu-category-${index}`} key={category} data-testid={`link-category-${index}`}>{category}</a>)}</nav>{categories.map((category, index) => <div className="category-block" id={`menu-category-${index}`} key={category}><h3 className="category-title"><span>{category}</span><span className="category-count">{products.filter(p => (p.category || 'القائمة') === category).length}</span></h3><div className="product-list">{products.filter(p => (p.category || 'القائمة') === category).map(product => <div className="product-row" key={product.id} data-testid={`card-product-${product.id}`}>{product.imageUrl ? <img className="product-image" src={catalogImageUrl(product.imageUrl)} alt={product.name} loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; }}/> : <div className="product-placeholder" aria-hidden="true">{product.name.charAt(0)}</div>}<div className="min-w-0 flex-1"><h4>{product.name}</h4>{product.description && <p>{product.description}</p>}</div><div className="product-actions"><span className="price text-sm" data-testid={`text-price-${product.id}`}>{money(product.price)} {CURRENCY}</span><button type="button" className="icon-button" onClick={() => cart.add(product.restaurantId, product.id)} aria-label={`أضف ${product.name} إلى السلة`} data-testid={`button-add-product-${product.id}`}><Plus size={19}/></button></div></div>)}</div></div>)}</>}
      </section>}
    </div><div>{data ? <CartPanel catalog={data}/> : <div className="cart-panel"><div className="skeleton h-44"/></div>}</div></main>

    {/* Manual Location Selection Modal */}
    {manualModalOpen && (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="bg-card text-foreground rounded-2xl border border-border p-5 max-w-md w-full shadow-2xl space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <h3 className="font-bold text-base flex items-center gap-2">
              <MapPin size={18} className="text-primary"/>
              <span>تحديد موقعك لعرض الأقرب</span>
            </h3>
            <button type="button" onClick={() => setManualModalOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X size={18}/>
            </button>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-3">اختر مدينتك أو منطقتك لترتيب المطاعم حسب المسافة الحقيقية:</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {LIBYAN_CITIES.map(city => (
                <button
                  key={city.name}
                  type="button"
                  onClick={() => handleSetManualLocation(city.lat, city.lng, city.name)}
                  className="btn btn-outline text-xs py-2 px-3 justify-start"
                >
                  <MapPin size={13} className="text-primary ml-1.5"/>
                  <span>{city.name}</span>
                </button>
              ))}
            </div>
            <div className="border-t pt-3 space-y-2">
              <span className="text-xs font-semibold block">أو أدخل الإحداثيات يدوياً:</span>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="any"
                  placeholder="خط العرض (Lat)"
                  value={manualLat}
                  onChange={e => setManualLat(e.target.value)}
                  className="admin-input text-xs"
                  dir="ltr"
                />
                <input
                  type="number"
                  step="any"
                  placeholder="خط الطول (Lng)"
                  value={manualLng}
                  onChange={e => setManualLng(e.target.value)}
                  className="admin-input text-xs"
                  dir="ltr"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  const lat = Number(manualLat), lng = Number(manualLng);
                  if (Number.isFinite(lat) && Number.isFinite(lng)) {
                    handleSetManualLocation(lat, lng, 'موقع مخصص');
                  }
                }}
                className="btn btn-primary w-full text-xs py-2 mt-2"
              >
                تطبيق الإحداثيات
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    <footer className="border-t border-border py-8"><div className="shell flex flex-wrap items-center justify-between gap-3"><span className="brand text-xl">طلبات<span style={{ color: 'hsl(var(--primary))' }}>.</span></span><span className="subtle text-xs">وجبتك القادمة تبدأ هنا.</span></div></footer>
  </div>;
}