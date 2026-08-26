import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Store, Truck, CreditCard, BarChart, Bell, Settings, LogOut, Menu, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { useLogout, useGetMe } from "@workspace/api-client-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function AdminLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();
  
  const { data: user } = useGetMe();
  const logout = useLogout();

  const navItems = [
    { icon: LayoutDashboard, label: "لوحة القيادة", path: "/admin/dashboard" },
    { icon: Store, label: "المطاعم", path: "/admin/restaurants" },
    { icon: Truck, label: "السائقون", path: "/admin/drivers" },
    { icon: CreditCard, label: "الاشتراكات", path: "/admin/subscriptions" },
    { icon: BarChart, label: "التحليلات", path: "/admin/analytics" },
    { icon: Bell, label: "الإشعارات", path: "/admin/notifications" },
    { icon: Settings, label: "الإعدادات", path: "/admin/settings" },
  ];

  const NavLinks = () => (
    <div className="flex-1 overflow-y-auto py-4 space-y-1">
      {navItems.map((item) => {
        const isActive = location === item.path || location.startsWith(`${item.path}/`);
        return (
          <Link key={item.path} href={item.path} className={cn(
            "flex items-center gap-3 px-4 py-3 mx-4 rounded-xl text-sm font-medium transition-all duration-200",
            isActive 
              ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md shadow-sidebar-primary/20" 
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          )}>
            <item.icon className={cn("h-5 w-5 shrink-0 transition-transform", isActive && "scale-110")} />
            {item.label}
          </Link>
        );
      })}
    </div>
  );

  return (
    <div className="flex h-screen bg-background font-sans overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 flex-col border-e border-sidebar-border bg-sidebar md:flex shadow-xl shadow-sidebar/5 z-10 relative">
        <div className="flex flex-col h-40 px-6 py-6 border-b border-sidebar-border/50 justify-between">
          <Link href="/admin/dashboard" className="flex items-center gap-3 font-bold text-2xl tracking-tighter text-sidebar-primary hover:opacity-90 transition-opacity">
            <span className="text-white bg-gradient-to-br from-primary to-blue-600 w-10 h-10 rounded-xl flex items-center justify-center shadow-lg">T</span>
            <span className="text-sidebar-foreground">TALABAT</span>
          </Link>
          
          <div className="flex items-center gap-3 bg-sidebar-accent/50 p-2.5 rounded-xl border border-sidebar-border/50">
            <Avatar className="h-9 w-9 border border-sidebar-border">
              <AvatarFallback className="text-sidebar-foreground bg-sidebar-primary/20 text-sidebar-primary font-bold">
                {user?.username?.[0]?.toUpperCase() || 'A'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{user?.username || 'Admin User'}</p>
              <p className="text-xs text-sidebar-foreground/60 truncate">{user?.email || user?.role || 'مدير النظام'}</p>
            </div>
          </div>
        </div>
        
        <div className="px-4 py-2">
          <p className="text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider px-4 mb-2">القائمة الرئيسية</p>
        </div>
        <NavLinks />
        
        <div className="p-4 border-t border-sidebar-border/50">
          <Button 
            variant="ghost" 
            className="w-full justify-start text-sidebar-foreground/80 hover:bg-destructive/10 hover:text-destructive rounded-xl transition-colors"
            onClick={() => {
              logout.mutate(undefined, {
                onSuccess: () => window.location.href = '/admin/login'
              });
            }}
          >
            <LogOut className="me-2 h-4 w-4" />
            تسجيل الخروج
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden relative">
        {/* Top Header */}
        <header className="flex h-20 items-center justify-between px-6 sm:px-8 bg-background/80 backdrop-blur-md border-b border-border/50 sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden rounded-xl">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 p-0 bg-sidebar border-sidebar-border text-sidebar-foreground">
                <div className="flex h-20 items-center px-6 border-b border-sidebar-border/50">
                  <span className="font-bold text-2xl tracking-tighter text-sidebar-foreground flex items-center gap-3">
                    <span className="text-white bg-primary w-8 h-8 rounded-lg flex items-center justify-center text-lg">T</span>
                    TALABAT
                  </span>
                </div>
                <div className="flex flex-col h-[calc(100vh-5rem)]">
                  <div className="py-4">
                    <NavLinks />
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            
            <div className="hidden sm:block">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {navItems.find(i => location.startsWith(i.path))?.label || "لوحة القيادة"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {new Date().toLocaleDateString('ar-LY', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-card rounded-full p-1 shadow-sm border flex items-center">
              <Button 
                variant="ghost" 
                size="icon" 
                className="rounded-full h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 text-muted-foreground hover:text-foreground relative">
                <Bell className="h-4 w-4" />
                <span className="absolute top-1.5 end-1.5 h-2 w-2 rounded-full bg-destructive border-2 border-card" />
              </Button>
            </div>
          </div>
        </header>

        {/* Canvas */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-8">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
