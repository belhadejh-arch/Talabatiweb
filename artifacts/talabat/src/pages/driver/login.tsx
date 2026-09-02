import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { getBaseUrl } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, ShieldCheck, Truck } from "lucide-react";

export default function DriverLogin() {
  const [, setLocation] = useLocation();
  const [serialNumber, setSerialNumber] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const base = getBaseUrl() ?? "";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(serialNumber)) {
      setError("أدخل الرقم التسلسلي المكوّن من 6 أرقام");
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(`${base}/api/driver-auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serialNumber }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "تعذر تسجيل الدخول");
      setLocation("/driver/dashboard");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "تعذر تسجيل الدخول");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-4" dir="rtl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,hsl(var(--primary)/.2),transparent_34%),radial-gradient(circle_at_80%_80%,hsl(190_90%_45%/.14),transparent_35%)]" />
      <Card className="relative w-full max-w-md overflow-hidden border-white/10 bg-slate-900/95 text-white shadow-2xl shadow-primary/10">
        <div className="h-2 bg-gradient-to-l from-primary via-cyan-400 to-emerald-400" />
        <CardHeader className="items-center space-y-4 pb-5 pt-9 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/15 text-primary ring-1 ring-primary/30"><Truck className="h-10 w-10" /></div>
          <div><CardTitle className="text-2xl font-black">دخول السائق</CardTitle><CardDescription className="mt-2 text-slate-400">ادخل إلى لوحة طلباتك داخل منصة TALABAT</CardDescription></div>
        </CardHeader>
        <CardContent className="px-6 pb-8 sm:px-9">
          <form onSubmit={submit} className="space-y-5">
            <label className="block space-y-2 text-sm font-semibold">
              الرقم التسلسلي
              <Input
                dir="ltr"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="645738"
                value={serialNumber}
                onChange={(event) => setSerialNumber(event.target.value.replace(/\D/g, "").slice(0, 6))}
                className="h-14 border-white/10 bg-white/5 text-center font-mono text-2xl tracking-[0.45em] text-white placeholder:text-slate-600"
                autoFocus
              />
            </label>
            {error && <p className="rounded-lg border border-red-400/20 bg-red-400/10 p-3 text-center text-sm text-red-300">{error}</p>}
            <Button type="submit" className="h-12 w-full text-base font-bold" disabled={isLoading || serialNumber.length !== 6}>
              {isLoading ? <><Loader2 className="ms-2 h-5 w-5 animate-spin" />جاري الدخول...</> : "دخول"}
            </Button>
          </form>
          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500"><ShieldCheck className="h-4 w-4 text-emerald-400" />جلسة آمنة ومخصصة لحسابك</div>
        </CardContent>
      </Card>
    </main>
  );
}