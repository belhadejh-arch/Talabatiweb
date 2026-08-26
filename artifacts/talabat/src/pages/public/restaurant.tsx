import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useGetPublicMenu, getGetPublicMenuQueryKey, type Product } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { MapPin, Info, Plus, Minus, ShoppingBag, Trash2, ArrowLeft, MoreHorizontal } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { formatCurrency } from "@/lib/currency";
import { ProductOptionsDialog } from "@/components/store/product-options-dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerClose
} from "@/components/ui/drawer";

export default function PublicRestaurant() {
  const { slug } = useParams<{ slug: string }>();
  const { data: menuData, isLoading } = useGetPublicMenu(slug, { query: { queryKey: getGetPublicMenuQueryKey(slug), enabled: !!slug } });
  
  const { items, addItem, removeItem, updateQuantity, total, itemCount } = useCart();
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [optionsProduct, setOptionsProduct] = useState<Product | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 150);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleProductClick = (product: Product) => {
    const hasOptions = (product.sizes && product.sizes.length > 0) || (product.addons && product.addons.length > 0);
    if (hasOptions) {
      setOptionsProduct(product);
    } else {
      addItem(product, 1);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-muted-foreground font-medium animate-pulse">جاري تحميل المنيو...</p>
        </div>
      </div>
    );
  }

  if (!menuData) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-xl text-muted-foreground">المطعم غير موجود.</p>
      </div>
    );
  }

  const { restaurant, categories } = menuData;
  const displayCategory = activeCategory || (categories.length > 0 ? categories[0].id : null);

  const cartDrawerContent = (
    <DrawerContent className="storefront dark h-[85vh] max-h-[85vh] rounded-t-3xl border-border/10 bg-background flex flex-col after:!bg-background">
      <DrawerHeader className="border-b border-border/10 pb-4">
        <div className="flex items-center justify-between">
          <DrawerTitle className="text-2xl font-bold flex items-center gap-2">
            <ShoppingBag className="h-6 w-6 text-primary" />
            سلة الطلبات
          </DrawerTitle>
          <Badge className="bg-primary/20 text-primary hover:bg-primary/30 text-base px-3 py-1 rounded-full">
            {itemCount} {itemCount === 1 ? 'منتج' : 'منتجات'}
          </Badge>
        </div>
      </DrawerHeader>
      
      <ScrollArea className="flex-1 px-4 py-4">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground">
            <ShoppingBag className="h-16 w-16 opacity-10 mb-4" />
            <p className="text-lg">السلة فارغة</p>
            <p className="text-sm opacity-70 mt-2">أضف بعض المنتجات الشهية للبدء</p>
          </div>
        ) : (
          <div className="space-y-4 pb-20">
            {items.map((item) => {
              const addonNames = (item.product.addons || [])
                .filter((a) => item.selectedAddonIds.includes(a.id))
                .map((a) => a.name);
              return (
                <div key={item.id} className="flex gap-4 p-4 rounded-2xl bg-secondary/30 border border-border/5" data-testid={`cart-item-${item.id}`}>
                  <div className="h-20 w-20 rounded-xl bg-secondary shrink-0 overflow-hidden shadow-sm">
                    {item.product.imageUrl ? (
                      <img src={item.product.imageUrl} alt={item.product.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-3xl font-bold opacity-20">
                        {item.product.name.charAt(0)}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0 flex flex-col">
                    <div className="flex justify-between items-start mb-1">
                      <p className="font-bold text-base truncate pl-2 text-foreground">
                        {item.product.name}
                        {item.selectedSizeName && <span className="text-primary text-sm mr-1">({item.selectedSizeName})</span>}
                      </p>
                      <button onClick={() => removeItem(item.id)} className="text-muted-foreground hover:text-destructive shrink-0 p-1 bg-background rounded-md transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    
                    {addonNames.length > 0 && (
                      <p className="text-xs text-muted-foreground line-clamp-1 mb-2">
                        + {addonNames.join("، ")}
                      </p>
                    )}
                    
                    <div className="mt-auto flex items-center justify-between">
                      <p className="font-bold text-primary">{formatCurrency(item.price * item.quantity)}</p>
                      
                      <div className="flex items-center gap-3 bg-background rounded-full p-1 border border-border/20 shadow-sm">
                        <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-secondary text-foreground"><Minus className="h-3 w-3" /></button>
                        <span className="text-sm font-bold w-4 text-center">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="h-7 w-7 flex items-center justify-center rounded-full bg-primary text-primary-foreground hover:opacity-90"><Plus className="h-3 w-3" /></button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
      
      {items.length > 0 && (
        <div className="p-4 pt-4 border-t border-border/10 bg-background/95 backdrop-blur z-10 pb-6">
          <div className="flex justify-between items-center mb-4 px-2">
            <span className="font-medium text-muted-foreground text-lg">الإجمالي</span>
            <span className="font-bold text-2xl text-foreground">{formatCurrency(total)}</span>
          </div>
          <Link href={`/${slug}/checkout`}>
            <Button className="w-full h-14 rounded-2xl text-lg font-bold shadow-xl shadow-primary/25" data-testid="button-checkout">
              🛒 إتمام الطلب
            </Button>
          </Link>
        </div>
      )}
    </DrawerContent>
  );

  return (
    <div className="flex-1 w-full bg-background relative pb-28 min-h-screen">
      
      {/* Floating Compact Header (Visible on scroll) */}
      <div className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 md:max-w-[480px] md:mx-auto ${scrolled ? 'bg-background/90 backdrop-blur-md shadow-sm translate-y-0 py-3 px-4' : '-translate-y-full opacity-0'}`}>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 overflow-hidden flex items-center justify-center border border-primary/20 shrink-0">
            {restaurant.logoUrl ? (
              <img src={restaurant.logoUrl} alt={restaurant.name} className="h-full w-full object-cover" />
            ) : (
              <span className="font-bold text-primary">{restaurant.name.charAt(0)}</span>
            )}
          </div>
          <h2 className="font-bold text-lg text-foreground truncate">{restaurant.name}</h2>
        </div>
      </div>

      {/* Hero Section */}
      <div className="relative h-[30vh] min-h-[220px] w-full bg-secondary">
        {restaurant.coverUrl ? (
          <img src={restaurant.coverUrl} alt={restaurant.name} className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-primary/10" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        
        {/* Info overlay */}
        <div className="absolute bottom-0 w-full px-5 pb-6">
          <div className="flex items-end gap-5">
            <div className="h-20 w-20 md:h-24 md:w-24 rounded-2xl bg-card border-2 border-border/10 flex items-center justify-center overflow-hidden shrink-0 shadow-2xl relative z-10">
              {restaurant.logoUrl ? (
                <img src={restaurant.logoUrl} alt={restaurant.name} className="h-full w-full object-cover" />
              ) : (
                <span className="text-4xl font-bold text-muted-foreground">{restaurant.name.charAt(0)}</span>
              )}
            </div>
            <div className="flex-1 pb-1">
              <h1 className="text-3xl font-black tracking-tight text-foreground mb-1 shadow-black drop-shadow-sm">{restaurant.name}</h1>
              <div className="flex items-center gap-3 text-sm text-foreground/80 font-medium">
                <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-primary" /> {restaurant.address}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="px-4 py-6">
        
        {/* About Box if description exists */}
        {restaurant.description && (
           <div className="mb-6 p-4 rounded-2xl bg-secondary/30 border border-border/5 text-sm text-muted-foreground flex gap-3">
             <Info className="h-5 w-5 text-primary shrink-0" />
             <p className="leading-relaxed">{restaurant.description}</p>
           </div>
        )}

        {/* Categories Nav (Sticky) */}
        <div className="sticky top-0 md:top-[64px] z-30 bg-background/95 backdrop-blur-md pt-2 pb-4 -mx-4 px-4 mb-6 shadow-sm shadow-background">
          <ScrollArea className="w-full whitespace-nowrap" dir="rtl">
            <div className="flex gap-2.5 pb-1">
              {categories.map((category) => (
                <Button
                  key={category.id}
                  variant={displayCategory === category.id ? "default" : "outline"}
                  className={`rounded-full px-6 py-5 text-sm font-bold border-2 transition-all ${
                    displayCategory === category.id 
                      ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20 scale-105" 
                      : "bg-secondary/40 text-foreground border-transparent hover:border-border/30 hover:bg-secondary"
                  }`}
                  onClick={() => setActiveCategory(category.id)}
                >
                  {category.name}
                </Button>
              ))}
            </div>
            <ScrollBar orientation="horizontal" className="hidden" />
          </ScrollArea>
        </div>

        {/* Products Grid */}
        <div className="space-y-10">
          {categories.filter(c => displayCategory ? c.id === displayCategory : true).map((category) => (
            <div key={category.id} id={`category-${category.id}`} className="scroll-mt-32">
              
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-2xl font-bold text-foreground">{category.name}</h3>
                <span className="text-sm font-bold text-muted-foreground bg-secondary px-3 py-1 rounded-full">{category.products.length}</span>
              </div>
              
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {category.products.map((product) => {
                  const hasSizes = product.sizes && product.sizes.length > 0;
                  const minSizePrice = hasSizes ? Math.min(...product.sizes!.map((s) => s.price)) : product.price;
                  
                  return (
                    <div 
                      key={product.id} 
                      className="group flex flex-col bg-card rounded-3xl border border-border/10 overflow-hidden shadow-sm hover:shadow-xl hover:border-primary/20 transition-all duration-300 relative cursor-pointer"
                      onClick={() => handleProductClick(product)}
                      data-testid={`card-product-${product.id}`}
                    >
                      {/* Product Image taking top half */}
                      <div className="w-full aspect-[4/3] bg-secondary relative overflow-hidden">
                        {product.imageUrl ? (
                          <img 
                            src={product.imageUrl} 
                            alt={product.name} 
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" 
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-4xl font-black opacity-10">
                            {product.name.charAt(0)}
                          </div>
                        )}
                        {/* Shadow gradient for image text legibility if needed */}
                        <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent opacity-60" />
                        
                        {/* Quick Add Button overlay */}
                        <div className="absolute bottom-2 left-2">
                          <button 
                            className="h-9 w-9 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
                            onClick={(e) => { e.stopPropagation(); handleProductClick(product); }}
                            aria-label="أضف"
                          >
                            <Plus className="h-5 w-5" />
                          </button>
                        </div>
                      </div>

                      {/* Product Info */}
                      <div className="p-3.5 flex flex-col flex-1">
                        <h4 className="font-bold text-base leading-tight mb-1 text-foreground line-clamp-1">{product.name}</h4>
                        {product.description && (
                           <p className="text-xs text-muted-foreground line-clamp-2 mb-3 leading-relaxed">{product.description}</p>
                        )}
                        <div className="mt-auto pt-2">
                           <span className="font-black text-primary text-[15px]">
                             {hasSizes && <span className="text-xs text-muted-foreground font-medium ml-1">من</span>}
                             {formatCurrency(minSizePrice)}
                           </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Floating Mobile Cart Bar */}
      {items.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 md:max-w-[480px] md:mx-auto">
          {/* Fading background behind floating bar */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent -top-12 bottom-0 pointer-events-none" />
          
          <div className="relative p-4 pb-6 animate-in slide-in-from-bottom-full duration-300">
            <Drawer open={isCartOpen} onOpenChange={setIsCartOpen}>
              <DrawerTrigger asChild>
                <Button 
                  className="w-full h-16 rounded-2xl text-lg font-bold shadow-xl shadow-primary/20 flex items-center justify-between px-5 bg-primary hover:bg-primary hover:scale-[1.02] active:scale-[0.98] transition-all"
                  data-testid="button-open-cart"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-black/15 rounded-xl flex items-center justify-center relative">
                       <ShoppingBag className="h-5 w-5 text-white" />
                       <span className="absolute -top-2 -right-2 h-6 w-6 bg-foreground text-background text-xs rounded-full flex items-center justify-center border-2 border-primary font-black">
                         {itemCount}
                       </span>
                    </div>
                    <span className="text-white">عرض السلة</span>
                  </div>
                  <span className="text-white font-black bg-black/15 px-3 py-1.5 rounded-xl">{formatCurrency(total)}</span>
                </Button>
              </DrawerTrigger>
              {cartDrawerContent}
            </Drawer>
          </div>
        </div>
      )}

      {/* Product Details Drawer */}
      <ProductOptionsDialog 
        product={optionsProduct} 
        open={!!optionsProduct} 
        onOpenChange={(open) => !open && setOptionsProduct(null)} 
      />
    </div>
  );
}