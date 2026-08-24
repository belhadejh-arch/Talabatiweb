import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { LayoutDashboard, Store, ShoppingBag, Truck, CreditCard, BarChart, Bell, Settings, LogOut, Menu, Moon, Sun, Languages } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { useLogout, useGetMe } from "@workspace/api-client-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function AdminLayout({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();
  
  const { data: user } = useGetMe();
  const logout = useLogout();

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar');
  };

  const navItems = [
    { icon: LayoutDashboard, label: t("admin.sidebar.dashboard"), path: "/admin/dashboard" },
    { icon: Store, label: t("admin.sidebar.restaurants"), path: "/admin/restaurants" },
    { icon: ShoppingBag, label: t("admin.sidebar.orders"), path: "/admin/orders" },
    { icon: Truck, label: t("admin.sidebar.drivers"), path: "/admin/drivers" },
    { icon: CreditCard, label: t("admin.sidebar.subscriptions"), path: "/admin/subscriptions" },
    { icon: BarChart, label: t("admin.sidebar.analytics"), path: "/admin/analytics" },
    { icon: Bell, label: t("admin.sidebar.notifications"), path: "/admin/notifications" },
    { icon: Settings, label: t("admin.sidebar.settings"), path: "/admin/settings" },
  ];

  const NavLinks = () => (
    <div className="flex-1 overflow-y-auto py-4 space-y-1">
      {navItems.map((item) => {
        const isActive = location === item.path || location.startsWith(`${item.path}/`);
        return (
          <Link key={item.path} href={item.path} className={cn(
            "flex items-center gap-3 px-4 py-3 mx-3 rounded-lg text-sm font-medium transition-colors",
            isActive 
              ? "bg-sidebar-primary text-sidebar-primary-foreground" 
              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          )}>
            <item.icon className="h-5 w-5 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </div>
  );

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex h-16 items-center px-6 border-b border-sidebar-border">
          <Link href="/admin/dashboard" className="flex items-center gap-2 font-bold text-2xl tracking-tighter text-sidebar-primary">
            <span className="text-white bg-sidebar-primary px-2 rounded">T</span>
            <span className="text-sidebar-foreground">TALABAT</span>
          </Link>
        </div>
        <NavLinks />
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 mb-4">
            <Avatar className="h-9 w-9 bg-sidebar-accent">
              <AvatarFallback className="text-sidebar-foreground bg-sidebar-accent">{user?.username?.[0]?.toUpperCase() || 'A'}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{user?.username || 'Admin'}</p>
              <p className="text-xs text-sidebar-foreground/70 truncate">Super Admin</p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={() => {
              logout.mutate(undefined, {
                onSuccess: () => window.location.href = '/admin/login'
              });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            {t("admin.header.logout")}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between border-b px-4 sm:px-6 bg-card">
          <div className="flex items-center gap-4">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side={i18n.language === 'ar' ? 'right' : 'left'} className="w-64 p-0 bg-sidebar border-sidebar-border text-sidebar-foreground">
                <div className="flex h-16 items-center px-6 border-b border-sidebar-border">
                  <span className="font-bold text-2xl tracking-tighter text-sidebar-foreground">TALABAT</span>
                </div>
                <div className="flex flex-col h-[calc(100vh-4rem)]">
                  <NavLinks />
                </div>
              </SheetContent>
            </Sheet>
            
            <h1 className="text-xl font-semibold hidden sm:block">
              {navItems.find(i => location.startsWith(i.path))?.label || ""}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleLanguage} title="Toggle Language">
              <Languages className="h-5 w-5" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 bg-secondary/30">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}