import { type ReactNode, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CartProvider } from './lib/cart';
import Browse from './pages/browse';
import Checkout from './pages/checkout';
import Confirmation from './pages/confirmation';
import Admin from './pages/admin';
import Driver from './pages/driver';
import RestaurantPortalPage from './pages/restaurant-portal';
import NotFoundAr from './pages/not-found-ar';

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: true, retry: 1 } } });
const meta: Record<string, { title: string; description: string }> = {
  '/': { title: 'طلبات | اكتشف مطاعمك المفضّلة', description: 'تصفّح المطاعم والقوائم، وأرسل طلبك بسهولة عبر طلبات.' },
  '/checkout': { title: 'تأكيد الطلب | طلبات', description: 'راجع تفاصيل الطلب واختر التوصيل أو الحجز قبل الإرسال.' },
  '/order-confirmation': { title: 'تم استلام طلبك | طلبات', description: 'تفاصيل الطلب الذي تم استلامه بنجاح.' },
  '/admin': { title: 'لوحة الإدارة | طلبات', description: 'إدارة الطلبات ومتابعة بيانات التشغيل.' },
  '/driver': { title: 'مساحة السائق | طلبات', description: 'تابع محاولات إسناد طلباتك وحالاتها في مساحة السائق.' },
  '/restaurant-portal': { title: 'لوحة المطعم | طلبات', description: 'تابع طلبات مطعمك وفواتيره وبيانات حسابك.' },
};
function PageMetadata() {
  const [location] = useLocation();
  useEffect(() => {
    const page = meta[location] || { title: 'الصفحة غير موجودة | طلبات', description: 'الصفحة المطلوبة غير موجودة.' };
    document.title = page.title;
    document.documentElement.lang = 'ar';
    document.documentElement.dir = 'rtl';
    let description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!description) { description = document.createElement('meta'); description.name = 'description'; document.head.appendChild(description); }
    description.content = page.description;
    for (const [property, content] of [['og:title', page.title], ['og:description', page.description]]) {
      let element = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
      if (!element) { element = document.createElement('meta'); element.setAttribute('property', property); document.head.appendChild(element); }
      element.content = content;
    }
  }, [location]);
  return null;
}
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><CartProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><PageMetadata/><RoutedErrorBoundary><Switch>
    <Route path="/" component={Browse}/>
    <Route path="/restaurant/:id" component={Browse}/>
    <Route path="/r/:id" component={Browse}/>
    <Route path="/checkout" component={Checkout}/>
    <Route path="/order-confirmation" component={Confirmation}/>
    <Route path="/admin" component={Admin}/>
    <Route path="/driver" component={Driver}/>
    <Route path="/restaurant-portal" component={RestaurantPortalPage}/>
    <Route component={NotFoundAr}/>
  </Switch></RoutedErrorBoundary></WouterRouter></CartProvider><Toaster/></TooltipProvider></QueryClientProvider>;
}

export default App;