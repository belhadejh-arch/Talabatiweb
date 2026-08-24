import { useState } from "react";
import { useParams, Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useGetPublicMenu, getGetPublicMenuQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MapPin, Phone, Info, Plus, Minus, ShoppingBag } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { Separator } from "@/components/ui/separator";

export default function PublicRestaurant() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const { data: menuData, isLoading } = useGetPublicMenu(slug, { query: { queryKey: getGetPublicMenuQueryKey(slug), enabled: !!slug } });
  
  const { items, addItem, removeItem, updateQuantity, total, itemCount } = useCart();
  const [activeCategory, setActiveCategory] = useState<number | null>(null);

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center text-muted-foreground">{t("common.loading")}</div>;
  }

  if (!menuData) {
    return <div className="flex h-screen items-center justify-center text-muted-foreground">Restaurant not found.</div>;
  }

  const { restaurant, categories } = menuData;
  const displayCategory = activeCategory || (categories.length > 0 ? categories[0].id : null);

  return (
    <div className="min-h-screen bg-secondary/30 pb-20 md:pb-0">
      {/* Hero Section */}
      <div className="relative h-64 md:h-80 w-full bg-secondary">
        {restaurant.coverUrl ? (
          <img src={restaurant.coverUrl} alt={restaurant.name} className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-primary/20" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/90 to-transparent" />
        
        <div className="absolute bottom-0 w-full p-4 md:p-8 flex items-end gap-6 container mx-auto">
          <div className="h-24 w-24 md:h-32 md:w-32 rounded-2xl bg-card border-4 border-background flex items-center justify-center overflow-hidden shrink-0 shadow-lg">
            {restaurant.logoUrl ? (
              <img src={restaurant.logoUrl} alt={restaurant.name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-4xl font-bold text-muted-foreground">{restaurant.name.charAt(0)}</span>
            )}
          </div>
          <div className="flex-1 text-foreground pb-2">
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-2">{restaurant.name}</h1>
            <div className="flex flex-wrap items-center gap-4 text-sm text-foreground/80">
              <span className="flex items-center gap-1"><MapPin className="h-4 w-4" /> {restaurant.address}</span>
              <span className="flex items-center gap-1"><Info className="h-4 w-4" /> {restaurant.description || ''}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 flex flex-col md:flex-row gap-8">
        {/* Menu Content */}
        <div className="flex-1 min-w-0">
          {/* Categories Nav */}
          <div className="sticky top-16 z-40 bg-background/95 backdrop-blur py-4 mb-6 border-b">
            <ScrollArea className="w-full whitespace-nowrap">
              <div className="flex gap-2 pb-2">
                {categories.map((category) => (
                  <Button
                    key={category.id}
                    variant={displayCategory === category.id ? "default" : "outline"}
                    className="rounded-full px-6"
                    onClick={() => setActiveCategory(category.id)}
                  >
                    {category.name}
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Products Grid */}
          <div className="space-y-8">
            {categories.filter(c => displayCategory ? c.id === displayCategory : true).map((category) => (
              <div key={category.id} id={`category-${category.id}`} className="scroll-mt-32">
                <h3 className="text-2xl font-bold mb-4">{category.name}</h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {category.products.map((product) => (
                    <Card key={product.id} className="border-none shadow-sm hover-elevate overflow-hidden transition-all group">
                      <div className="flex p-4 gap-4 h-full">
                        <div className="flex-1 flex flex-col min-w-0">
                          <h4 className="font-semibold text-lg">{product.name}</h4>
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-4 mt-1">{product.description}</p>
                          <div className="mt-auto flex items-center justify-between">
                            <span className="font-bold text-primary">{t("common.currency")}{product.price.toFixed(2)}</span>
                            <Button size="sm" onClick={() => addItem(product, 1)}>
                              <Plus className="h-4 w-4 mr-1" /> Add
                            </Button>
                          </div>
                        </div>
                        {product.imageUrl && (
                          <div className="h-24 w-24 md:h-32 md:w-32 rounded-lg bg-secondary shrink-0 overflow-hidden relative">
                            <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sticky Cart (Desktop) */}
        <div className="hidden md:block w-80 lg:w-96 shrink-0 relative">
          <div className="sticky top-24">
            <Card className="border-none shadow-lg">
              <div className="p-4 bg-primary text-primary-foreground rounded-t-xl flex items-center justify-between">
                <h3 className="font-bold flex items-center gap-2">
                  <ShoppingBag className="h-5 w-5" /> {t("public.cart.title")}
                </h3>
                <Badge variant="secondary" className="bg-primary-foreground text-primary hover:bg-primary-foreground">{itemCount}</Badge>
              </div>
              <CardContent className="p-0">
                {items.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
                    <ShoppingBag className="h-12 w-12 opacity-20 mb-4" />
                    <p>{t("public.cart.empty")}</p>
                  </div>
                ) : (
                  <div className="flex flex-col max-h-[calc(100vh-16rem)]">
                    <ScrollArea className="flex-1 p-4">
                      <div className="space-y-4">
                        {items.map((item) => (
                          <div key={item.id} className="flex gap-3">
                            <div className="flex flex-col items-center gap-1 bg-secondary rounded-md p-1 shrink-0 h-fit">
                              <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="p-1 hover:bg-background rounded text-foreground"><Plus className="h-3 w-3" /></button>
                              <span className="text-xs font-medium w-4 text-center">{item.quantity}</span>
                              <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="p-1 hover:bg-background rounded text-foreground"><Minus className="h-3 w-3" /></button>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate pr-2">{item.product.name}</p>
                              {item.selectedAddonIds.length > 0 && (
                                <p className="text-xs text-muted-foreground line-clamp-1">With add-ons</p>
                              )}
                              <p className="text-sm font-medium text-primary mt-1">{t("common.currency")}{(item.price * item.quantity).toFixed(2)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                    <div className="p-4 border-t border-border bg-card/50">
                      <div className="flex justify-between items-center mb-4">
                        <span className="font-medium">{t("public.cart.total")}</span>
                        <span className="font-bold text-lg">{t("common.currency")}{total.toFixed(2)}</span>
                      </div>
                      <Link href={`/${slug}/checkout`}>
                        <Button className="w-full h-12 text-base font-semibold shadow-md">{t("public.cart.checkout")}</Button>
                      </Link>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Mobile Cart Bar */}
        {items.length > 0 && (
          <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border z-50 animate-in slide-in-from-bottom-full">
            <Link href={`/${slug}/checkout`}>
              <Button className="w-full h-14 text-base font-semibold shadow-xl flex justify-between px-6 bg-primary hover:bg-primary/90">
                <span className="flex items-center gap-2"><Badge variant="secondary" className="bg-primary-foreground text-primary">{itemCount}</Badge> Items</span>
                <span>{t("public.cart.checkout")} • {t("common.currency")}{total.toFixed(2)}</span>
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}