import { ReactNode, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/components/theme-provider';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

// Import layouts
import { AdminLayout } from '@/components/layout/admin-layout';
import { PublicLayout } from '@/components/layout/public-layout';
import { ProtectedRoute } from '@/components/protected-route';

// Import admin pages
import AdminLogin from '@/pages/admin/login';
import AdminDashboard from '@/pages/admin/dashboard';
import AdminRestaurants from '@/pages/admin/restaurants';
import AdminRestaurantNew from '@/pages/admin/restaurants/new';
import AdminRestaurantDetail from '@/pages/admin/restaurants/detail';
import AdminRestaurantMenu from '@/pages/admin/restaurants/menu';
import AdminDrivers from '@/pages/admin/drivers';
import AdminSubscriptions from '@/pages/admin/subscriptions';
import AdminAnalytics from '@/pages/admin/analytics';
import AdminNotifications from '@/pages/admin/notifications';
import AdminSettings from '@/pages/admin/settings';
import DriverLogin from '@/pages/driver/login';
import DriverDashboard from '@/pages/driver/dashboard';

// Import public pages
import PublicRestaurant from '@/pages/public/restaurant';
import PublicCheckout from '@/pages/public/checkout';

import { CartProvider } from '@/hooks/use-cart';

const queryClient = new QueryClient();

/** Declarative redirect — calls setLocation in useEffect, never during render */
function Redirect({ to }: { to: string }) {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation(to); }, [to, setLocation]);
  return null;
}

function Router() {
  const [location] = useLocation();
  const isAdmin = location.startsWith('/admin');
  const isDriver = location.startsWith('/driver');

  return (
    <RoutedErrorBoundary>
      {isDriver ? (
        <Switch>
          <Route path="/driver/login" component={DriverLogin} />
          <Route path="/driver/dashboard" component={DriverDashboard} />
          <Route component={() => <Redirect to="/driver/login" />} />
        </Switch>
      ) : isAdmin ? (
        <Switch>
          <Route path="/admin/login" component={AdminLogin} />

          <Route path="/admin/*">
            <AdminLayout>
              <Switch>
                <Route path="/admin" component={() => <Redirect to="/admin/dashboard" />} />
                <ProtectedRoute path="/admin/dashboard" component={AdminDashboard} />
                <ProtectedRoute path="/admin/restaurants/new" component={AdminRestaurantNew} />
                <ProtectedRoute path="/admin/restaurants/:id/menu" component={AdminRestaurantMenu} />
                <ProtectedRoute path="/admin/restaurants/:id" component={AdminRestaurantDetail} />
                <ProtectedRoute path="/admin/restaurants" component={AdminRestaurants} />
                <ProtectedRoute path="/admin/drivers" component={AdminDrivers} />
                <ProtectedRoute path="/admin/subscriptions" component={AdminSubscriptions} />
                <ProtectedRoute path="/admin/analytics" component={AdminAnalytics} />
                <ProtectedRoute path="/admin/notifications" component={AdminNotifications} />
                <ProtectedRoute path="/admin/settings" component={AdminSettings} />
                <Route component={NotFound} />
              </Switch>
            </AdminLayout>
          </Route>
        </Switch>
      ) : (
        <CartProvider>
          <PublicLayout>
            <Switch>
              <Route path="/:slug/checkout" component={PublicCheckout} />
              <Route path="/:slug" component={PublicRestaurant} />
              <Route path="/" component={() => <Redirect to="/admin/login" />} />
              <Route component={NotFound} />
            </Switch>
          </PublicLayout>
        </CartProvider>
      )}
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="talabat-theme">
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;