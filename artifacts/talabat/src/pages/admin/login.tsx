import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLogin } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

const loginSchema = z.object({
  username: z.string().min(1, { message: "Required" }),
  password: z.string().min(1, { message: "Required" })
});

export default function AdminLogin() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const login = useLogin();

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: ""
    }
  });

  const onSubmit = (values: z.infer<typeof loginSchema>) => {
    login.mutate({ data: values }, {
      onSuccess: () => {
        setLocation("/admin/dashboard");
      }
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-cyan-400 via-blue-500 to-purple-600 p-4 sm:p-8 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 start-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay pointer-events-none" />
      <div className="absolute -top-40 -end-40 w-96 h-96 bg-white/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -start-40 w-96 h-96 bg-white/20 rounded-full blur-3xl pointer-events-none" />
      
      <Card className="w-full max-w-md shadow-2xl border-none rounded-3xl overflow-hidden bg-card/95 backdrop-blur-sm">
        {/* Top visual accent matching the reference vibe */}
        <div className="h-32 bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center relative overflow-hidden">
          <div className="absolute bottom-0 start-0 w-full">
            <svg viewBox="0 0 1440 320" className="w-full h-auto drop-shadow-md text-card fill-current" preserveAspectRatio="none">
              <path d="M0,128L48,144C96,160,192,192,288,186.7C384,181,480,139,576,149.3C672,160,768,213,864,213.3C960,213,1056,160,1152,144C1248,128,1344,149,1392,160L1440,171L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
            </svg>
          </div>
          <div className="z-10 flex flex-col items-center mb-6">
            <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-md shadow-sm mb-2">
              <span className="text-white font-bold text-3xl tracking-tighter block leading-none">T</span>
            </div>
            <span className="text-white font-bold tracking-widest text-sm opacity-90">TALABAT</span>
          </div>
        </div>

        <CardHeader className="space-y-1 text-center pt-8 pb-6">
          <CardTitle className="text-2xl font-bold tracking-tight text-foreground">{t('admin.login.title', 'Welcome back!')}</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">{t('admin.login.subtitle', 'Sign in to continue to your dashboard')}</CardDescription>
        </CardHeader>
        <CardContent className="px-8 pb-10">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground/80">{t('admin.login.email', 'Username')}</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="admin" 
                        autoComplete="username"
                        className="h-12 bg-secondary/50 border-transparent focus:bg-background focus:border-primary transition-colors rounded-xl px-4" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center">
                      <FormLabel className="text-foreground/80">{t('admin.login.password', 'Password')}</FormLabel>
                    </div>
                    <FormControl>
                      <Input 
                        type="password" 
                        placeholder="••••••••" 
                        autoComplete="current-password"
                        className="h-12 bg-secondary/50 border-transparent focus:bg-background focus:border-primary transition-colors rounded-xl px-4" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {login.isError && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-xl text-center font-medium animate-in fade-in slide-in-from-top-2">
                  {t('admin.login.error', 'Invalid credentials')}
                </div>
              )}
              
              <div className="pt-2">
                <Button 
                  type="submit" 
                  className="w-full h-12 text-base font-semibold rounded-xl bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-600/90 shadow-md hover:shadow-lg transition-all" 
                  disabled={login.isPending}
                >
                  {login.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      {t('admin.login.signingIn', 'Signing In...')}
                    </>
                  ) : (
                    t('admin.login.submit', 'Login')
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
