export type Restaurant = { id: number; name: string; slug: string; phone: string | null; address: string | null; description: string | null; deliveryFee: number; imageUrl: string | null };
export type Product = { id: number; restaurantId: number; name: string; description: string | null; price: number; category: string | null; imageUrl: string | null };
export type Catalog = { restaurants: Restaurant[]; products: Product[]; subscriptions: unknown[] };
export type OrderItem = { productId: number; productName?: string; quantity: number; unitPrice?: number; totalPrice?: number; selectedSize?: string | null };
export type Order = { id: number; restaurantId: number; restaurantName?: string; customerName: string; customerPhone: string; orderType: 'DELIVERY' | 'RESERVATION'; items: OrderItem[]; itemsSummary?: string; subtotal: number; deliveryFee: number; totalAmount: number; status: string; assignmentStatus?: string | null; driverId?: number | null; createdAt: string; reservationDate?: string | null; reservationTime?: string | null; partySize?: number | null; notes?: string | null };
export type OrderInput = { restaurantId: number; customerName: string; customerPhone: string; orderType: 'DELIVERY' | 'RESERVATION'; items: { productId: number; quantity: number }[]; notes?: string; latitude?: number; longitude?: number; reservationDate?: string; reservationTime?: string; partySize?: number };
export type StatsData = Record<string, unknown>;
export type AdminOverview = { orders: Order[]; drivers: Record<string, unknown>[]; subscriptions: Record<string, unknown>[]; restaurants: Restaurant[]; stats: StatsData };

export class ApiError extends Error {
  constructor(message: string, public status: number, public requestId?: string) { super(message); this.name = 'ApiError'; }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    // Replit previews live under /talabat/; Vercel publishes the same app at /.
    const previewPrefix = import.meta.env.DEV ? import.meta.env.BASE_URL.replace(/\/$/, '') : '';
    response = await fetch(`${previewPrefix}${path}`, { ...options, headers: { 'Accept': 'application/json', ...options.headers } });
  } catch {
    throw new ApiError('تعذّر الاتصال بالخادم. تحقّق من اتصالك وأعد المحاولة.', 0);
  }
  let body: unknown;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok) {
    const error = (body && typeof body === 'object' ? body : {}) as { message?: string; error?: string; requestId?: string };
    throw new ApiError(error.message || error.error || `تعذّر إتمام الطلب (${response.status}).`, response.status, error.requestId);
  }
  return body as T;
}

const jsonHeaders = { 'Content-Type': 'application/json' };
export const api = {
  catalog: () => request<Catalog>('/api/catalog'),
  createOrder: (input: OrderInput, key: string) => request<{ order: Order }>('/api/orders', { method: 'POST', headers: { ...jsonHeaders, 'Idempotency-Key': key }, body: JSON.stringify(input) }),
  adminLogin: (username: string, password: string) => request<{ token: string }>('/api/admin/login', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ username, password }) }),
  adminOverview: (token: string) => request<AdminOverview>('/api/admin/overview', { headers: { Authorization: `Bearer ${token}` } }),
  adminStats: (token: string) => request<StatsData>('/api/admin/stats', { headers: { Authorization: `Bearer ${token}` } }),
};

export const money = (value: number | string | null | undefined) => new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(Number(value) || 0);
export const dateLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};
export const statusLabel = (status: string) => ({
  NEW: 'جديد', PENDING: 'قيد الانتظار', CONFIRMED: 'مؤكد', PREPARING: 'قيد التجهيز', READY: 'جاهز', ON_THE_WAY: 'في الطريق',
  DELIVERED: 'تم التوصيل', COMPLETED: 'مكتمل', CANCELLED: 'ملغي', ASSIGNED: 'تم الإسناد',
} as Record<string, string>)[status] || status;