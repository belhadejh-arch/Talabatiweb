import { useEffect, useState } from "react";
import { Product } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/currency";
import { useCart } from "@/hooks/use-cart";
import { Minus, Plus, X } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
  DrawerClose
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { getAssetUrl } from "@/lib/asset-url";

export function ProductOptionsDialog({
  product,
  open,
  onOpenChange,
}: {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { addItem } = useCart();
  const [selectedSizeId, setSelectedSizeId] = useState<number | null>(null);
  const [selectedAddonIds, setSelectedAddonIds] = useState<number[]>([]);
  const [quantity, setQuantity] = useState(1);

  const availableSizes = (product?.sizes || []).filter((s) => s.isAvailable);
  const availableAddons = (product?.addons || []).filter((a) => a.isAvailable);

  useEffect(() => {
    if (product) {
      setSelectedSizeId(availableSizes.length > 0 ? availableSizes[0].id : null);
      setSelectedAddonIds([]);
      setQuantity(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  if (!product) return null;

  const basePrice = availableSizes.length > 0
    ? (availableSizes.find((s) => s.id === selectedSizeId)?.price ?? availableSizes[0].price)
    : product.price;

  const addonsTotal = availableAddons
    .filter((a) => selectedAddonIds.includes(a.id))
    .reduce((sum, a) => sum + a.price, 0);

  const unitPrice = basePrice + addonsTotal;
  const lineTotal = unitPrice * quantity;

  const toggleAddon = (id: number) => {
    setSelectedAddonIds((current) => (current.includes(id) ? current.filter((a) => a !== id) : [...current, id]));
  };

  const handleAdd = () => {
    addItem(product, quantity, { selectedSizeId, selectedAddonIds });
    toast.success(`تمت إضافة ${product.name} إلى السلة`);
    onOpenChange(false);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="storefront dark h-[92dvh] max-h-[92dvh] rounded-t-3xl bg-background border-border/10 outline-none flex flex-col after:!bg-background" data-testid="dialog-product-options">
        <div className="absolute right-4 top-4 z-50">
          <DrawerClose asChild>
            <Button variant="secondary" size="icon" className="h-8 w-8 rounded-full bg-black/40 text-white hover:bg-black/60 backdrop-blur-md border-none">
              <X className="h-4 w-4" />
            </Button>
          </DrawerClose>
        </div>
        
        <ScrollArea className="flex-1 w-full overflow-y-auto">
          <div className="flex flex-col pb-56">
            {/* Hero Image */}
            <div className="w-full relative h-[30vh] min-h-[210px] sm:h-[35vh] sm:min-h-[250px] bg-secondary flex items-center justify-center shrink-0">
              {product.imageUrl ? (
                <img 
                  src={getAssetUrl(product.imageUrl)} 
                  alt={product.name} 
                  className="absolute inset-0 h-full w-full object-cover" 
                />
              ) : (
                <span className="text-6xl opacity-20 font-bold">{product.name.charAt(0)}</span>
              )}
              {/* Gradient Overlay for seamless blend */}
              <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-80" />
            </div>

            {/* Content Body */}
            <div className="px-4 sm:px-6 pt-4 space-y-6 sm:space-y-8 relative z-10 -mt-6">
              
              <DrawerHeader className="px-0 pt-0 pb-2 text-right">
                <DrawerTitle className="text-2xl sm:text-3xl font-bold tracking-tight mb-2 text-foreground">{product.name}</DrawerTitle>
                {product.description && (
                  <p className="text-muted-foreground leading-relaxed text-sm">{product.description}</p>
                )}
              </DrawerHeader>

              {/* Sizes Selection */}
              {availableSizes.length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-lg font-bold">الحجم</h4>
                  <div className="flex flex-wrap gap-3">
                    {availableSizes.map((size) => {
                      const isSelected = selectedSizeId === size.id;
                      return (
                        <button
                          key={size.id}
                          type="button"
                          onClick={() => setSelectedSizeId(size.id)}
                           className={`relative flex items-center gap-3 rounded-2xl border-2 px-4 sm:px-5 py-3.5 sm:py-4 text-right transition-all duration-200 flex-1 min-w-[min(140px,100%)] overflow-hidden group ${
                            isSelected 
                              ? "border-primary bg-primary/10 shadow-sm" 
                              : "border-border/40 bg-secondary/30 hover:border-border"
                          }`}
                          data-testid={`button-size-${size.id}`}
                        >
                          <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${isSelected ? "border-primary" : "border-muted-foreground"}`}>
                            {isSelected && <div className="h-2.5 w-2.5 rounded-full bg-primary animate-in zoom-in" />}
                          </div>
                          <div className="flex flex-col flex-1 min-w-0">
                            <span className={`font-semibold text-base ${isSelected ? "text-primary" : "text-foreground"}`}>{size.name}</span>
                            <span className="text-sm font-medium opacity-80">{formatCurrency(size.price)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Addons Selection */}
              {availableAddons.length > 0 && (
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <h4 className="text-lg font-bold">إضافات نوصي بها</h4>
                    <span className="text-xs text-muted-foreground bg-secondary/50 px-2 py-1 rounded-md">اختياري</span>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {availableAddons.map((addon) => {
                      const isChecked = selectedAddonIds.includes(addon.id);
                      return (
                         <button
                          key={addon.id}
                          type="button"
                          onClick={() => toggleAddon(addon.id)}
                           className={`flex items-center gap-3 sm:gap-4 rounded-2xl p-3 sm:p-4 transition-all duration-200 border-2 text-right ${
                            isChecked 
                              ? "border-primary/50 bg-primary/5" 
                              : "border-border/20 bg-secondary/20 hover:bg-secondary/40"
                          }`}
                          data-testid={`checkbox-addon-${addon.id}`}
                        >
                          <div className={`h-6 w-6 rounded flex items-center justify-center border-2 shrink-0 transition-colors ${
                            isChecked ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/50"
                          }`}>
                            {isChecked && (
                              <svg width="14" height="10" viewBox="0 0 14 10" fill="none" xmlns="http://www.w3.org/2000/svg" className="animate-in zoom-in duration-200">
                                <path d="M1 5L4.5 8.5L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </div>
                          
                          <div className="flex-1 flex justify-between items-center min-w-0">
                            <span className={`font-semibold truncate pr-2 ${isChecked ? "text-foreground" : "text-foreground/90"}`}>{addon.name}</span>
                            <span className={`text-sm shrink-0 font-medium ${isChecked ? "text-primary" : "text-muted-foreground"}`}>+{formatCurrency(addon.price)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        {/* Fixed Bottom Bar */}
         <div className="absolute bottom-0 inset-x-0 p-3 sm:p-4 pt-6 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-gradient-to-t from-background via-background/95 to-transparent z-20">
          <div className="flex flex-col gap-4 max-w-[480px] mx-auto">
            {/* Quantity Stepper */}
            <div className="flex items-center justify-center gap-6 mb-2">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="h-12 w-12 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center text-foreground transition-transform active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                disabled={quantity <= 1}
                data-testid="button-decrease-qty"
              >
                <Minus className="h-5 w-5" />
              </button>
              <span className="text-2xl font-bold w-8 text-center">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                className="h-12 w-12 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center text-foreground transition-transform active:scale-95"
                data-testid="button-increase-qty"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
            
            {/* CTA */}
            <Button 
              className="w-full h-16 text-lg font-bold rounded-2xl shadow-xl shadow-primary/25 hover:shadow-primary/40 transition-all hover:scale-[1.02] active:scale-[0.98]" 
              onClick={handleAdd} 
              data-testid="button-confirm-add-to-cart"
            >
              <span className="flex-1 text-right">إضافة إلى السلة</span>
              <span className="bg-black/20 px-3 py-1 rounded-lg text-base">{formatCurrency(lineTotal)}</span>
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}