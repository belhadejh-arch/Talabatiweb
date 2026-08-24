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
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-full h-1/2 bg-primary/10 -skew-y-6 transform origin-top-left -z-10" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-primary/20 rounded-full blur-3xl -z-10" />
      
      <Card className="w-full max-w-md shadow-2xl border-none">
        <CardHeader className="space-y-2 text-center pb-8">
          <div className="mx-auto w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mb-4 transform rotate-3">
            <span className="text-primary-foreground font-bold text-3xl -rotate-3 tracking-tighter">T</span>
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight">{t('admin.login.title')}</CardTitle>
          <CardDescription className="text-base">{t('admin.login.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admin.login.email')}</FormLabel>
                    <FormControl>
                      <Input placeholder="admin" className="h-12" {...field} />
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
                    <FormLabel>{t('admin.login.password')}</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" className="h-12" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {login.isError && (
                <div className="text-sm font-medium text-destructive">
                  {t('admin.login.error')}
                </div>
              )}
              <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={login.isPending}>
                {login.isPending ? t('admin.login.signingIn') : t('admin.login.submit')}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}