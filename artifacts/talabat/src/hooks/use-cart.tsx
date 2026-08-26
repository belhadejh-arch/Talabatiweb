import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Product } from "@workspace/api-client-react";

interface CartItem {
  id: string; // unique id combining product id + selected size + selected addons
  product: Product;
  quantity: number;
  selectedSizeId: number | null;
  selectedSizeName: string | null;
  selectedAddonIds: number[];
  price: number; // unit price (size price or base price + addons)
}

interface CartContextType {
  items: CartItem[];
  addItem: (
    product: Product,
    quantity: number,
    options?: { selectedSizeId?: number | null; selectedAddonIds?: number[] },
  ) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  total: number;
  itemCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem("talabat_cart");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("talabat_cart", JSON.stringify(items));
  }, [items]);

  const addItem = (
    product: Product,
    quantity: number,
    options?: { selectedSizeId?: number | null; selectedAddonIds?: number[] },
  ) => {
    const selectedSizeId = options?.selectedSizeId ?? null;
    const selectedAddonIds = options?.selectedAddonIds ?? [];

    setItems((current) => {
      const id = `${product.id}-${selectedSizeId ?? "base"}-${[...selectedAddonIds].sort().join(",")}`;
      const existing = current.find((item) => item.id === id);

      const size = (product.sizes || []).find((s) => s.id === selectedSizeId);
      const basePrice = size ? size.price : product.price;

      const addonTotal = (product.addons || [])
        .filter((a) => selectedAddonIds.includes(a.id))
        .reduce((sum, a) => sum + a.price, 0);

      const itemPrice = basePrice + addonTotal;

      if (existing) {
        return current.map((item) => (item.id === id ? { ...item, quantity: item.quantity + quantity } : item));
      }

      return [
        ...current,
        {
          id,
          product,
          quantity,
          selectedSizeId,
          selectedSizeName: size?.name ?? null,
          selectedAddonIds,
          price: itemPrice,
        },
      ];
    });
  };

  const removeItem = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(id);
      return;
    }
    setItems((current) => current.map((item) => (item.id === id ? { ...item, quantity } : item)));
  };

  const clearCart = () => setItems([]);

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        total,
        itemCount,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
};
