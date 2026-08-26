import { useEffect, useState } from "react";
import { Product } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/currency";
import { useCart } from "@/hooks/use-cart";
import { Minus, Plus } from "lucide-react";

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
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-product-options">
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {product.imageUrl && (
            <div className="h-40 w-full rounded-lg overflow-hidden bg-secondary">
              <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
            </div>
          )}

          {product.description && <p className="text-sm text-muted-foreground">{product.description}</p>}

          {availableSizes.length > 0 && (
            <div className="space-y-2">
              <Label>الحجم</Label>
              <div className="grid grid-cols-3 gap-2">
                {availableSizes.map((size) => (
                  <button
                    key={size.id}
                    type="button"
                    onClick={() => setSelectedSizeId(size.id)}
                    className={`rounded-md border px-2 py-2 text-sm font-medium transition-colors ${
                      selectedSizeId === size.id ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary/50"
                    }`}
                    data-testid={`button-size-${size.id}`}
                  >
                    <div>{size.name}</div>
                    <div className="text-xs text-muted-foreground">{formatCurrency(size.price)}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {availableAddons.length > 0 && (
            <div className="space-y-2">
              <Label>الإضافات</Label>
              <div className="space-y-1.5">
                {availableAddons.map((addon) => (
                  <label
                    key={addon.id}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm cursor-pointer hover:bg-secondary/40"
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedAddonIds.includes(addon.id)}
                        onChange={() => toggleAddon(addon.id)}
                        data-testid={`checkbox-addon-${addon.id}`}
                      />
                      {addon.name}
                    </span>
                    <span className="text-muted-foreground">+{formatCurrency(addon.price)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label>الكمية</Label>
            <div className="flex items-center gap-3 bg-secondary rounded-md p-1">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="p-1.5 hover:bg-background rounded"
                data-testid="button-decrease-qty"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-6 text-center font-medium">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                className="p-1.5 hover:bg-background rounded"
                data-testid="button-increase-qty"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button className="w-full h-12 text-base font-semibold" onClick={handleAdd} data-testid="button-confirm-add-to-cart">
            إضافة إلى السلة — {formatCurrency(lineTotal)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
