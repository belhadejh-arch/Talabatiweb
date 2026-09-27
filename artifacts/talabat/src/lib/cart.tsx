import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type CartItem = { productId: number; quantity: number };
type CartState = { restaurantId: number | null; items: CartItem[] };
type CartContextValue = CartState & { add: (restaurantId: number, productId: number) => boolean; setQuantity: (productId: number, quantity: number) => void; clear: () => void; count: number };
const empty: CartState = { restaurantId: null, items: [] };
const CartContext = createContext<CartContextValue | null>(null);

function readCart(): CartState {
  try {
    const parsed = JSON.parse(localStorage.getItem('talabat-cart') || 'null') as CartState | null;
    if (parsed && (parsed.restaurantId === null || Number.isInteger(parsed.restaurantId)) && Array.isArray(parsed.items)) {
      const items = parsed.items.filter(item => Number.isInteger(item.productId) && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 99).slice(0, 50);
      return { restaurantId: items.length ? parsed.restaurantId : null, items };
    }
  } catch { /* Corrupt stored data is discarded. */ }
  return empty;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartState>(readCart);
  useEffect(() => { localStorage.setItem('talabat-cart', JSON.stringify(cart)); }, [cart]);
  const add = (restaurantId: number, productId: number) => {
    if (cart.restaurantId !== null && cart.restaurantId !== restaurantId && !window.confirm('سلتك تحتوي على طلب من مطعم آخر. هل تريد بدء سلة جديدة؟')) return false;
    setCart(previous => {
      const items = previous.restaurantId === restaurantId ? previous.items : [];
      const existing = items.find(item => item.productId === productId);
      if (existing) return { restaurantId, items: items.map(item => item.productId === productId ? { ...item, quantity: Math.min(99, item.quantity + 1) } : item) };
      if (items.length >= 50) return previous;
      return { restaurantId, items: [...items, { productId, quantity: 1 }] };
    });
    return true;
  };
  const setQuantity = (productId: number, quantity: number) => setCart(previous => {
    const items = previous.items.map(item => item.productId === productId ? { ...item, quantity: Math.min(99, quantity) } : item).filter(item => item.quantity > 0);
    return { restaurantId: items.length ? previous.restaurantId : null, items };
  });
  const clear = () => setCart(empty);
  return <CartContext.Provider value={{ ...cart, add, setQuantity, clear, count: cart.items.reduce((sum, item) => sum + item.quantity, 0) }}>{children}</CartContext.Provider>;
}

export function useCart() {
  const cart = useContext(CartContext);
  if (!cart) throw new Error('CartProvider missing');
  return cart;
}