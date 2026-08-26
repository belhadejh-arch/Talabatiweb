import { ReactNode } from "react";

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div 
      className="storefront dark min-h-[100dvh] flex flex-col bg-background font-sans text-foreground selection:bg-primary/30" 
      dir="rtl"
    >
      <main className="flex-1 w-full md:max-w-[480px] md:mx-auto bg-background relative shadow-2xl overflow-x-hidden border-x border-border/10 flex flex-col min-h-[100dvh]">
        {children}
      </main>
    </div>
  );
}