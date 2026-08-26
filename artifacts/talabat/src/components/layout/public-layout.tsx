import { ReactNode } from "react";

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="font-bold text-2xl text-primary tracking-tighter">TALABAT</div>
        </div>
      </header>
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}