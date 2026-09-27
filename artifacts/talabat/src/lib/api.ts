export type Restaurant = { id: number; name: string; slug: string; phone: string | null; address: string | null; description: string | null; deliveryFee: number; imageUrl: string | null; status?: string };
export type Product = { id: number; restaurantId: number; name: string; description: string | null; price: number; category: string | null; imageUrl: string | null };
export type Catalog = { restaurants: Restaurant[]; products: Product[]; subscriptions: unknown[] };
export type OrderItem = { productId: number; productName?: string; quantity: number; unitPrice?: number; totalPrice?: number; selectedSize?: string | null };
export type Order = { id: number; restaurantId: number; restaurantName?: string; customerName: string; customerPhone: string; orderType: 'DELIVERY' | 'RESERVATION'; items: OrderItem[]; itemsSummary?: string; subtotal: number; deliveryFee: number; totalAmount: number; status: string; assignmentStatus?: string | null; driverId?: number | null; createdAt: string; reservationDate?: string | null; reservationTime?: string | null; partySize?: number | null; notes?: string | null };
export type OrderInput = { restaurantId: number; customerName: string; customerPhone: string; orderType: 'DELIVERY' | 'RESERVATION'; items: { productId: number; quantity: number }[]; notes?: string; latitude?: number; longitude?: number; reservationDate?: string; reservationTime?: string; partySize?: number };
export type StatsData = Record<string, unknown>;
export type AdminOverview = { orders: Order[]; drivers: Record<string, unknown>[]; subscriptions: Record<string, unknown>[]; restaurants: Restaurant[]; stats: StatsData };
export type DriverIdentity = { id: number; name: string; email: string; restaurantId: number };
export type DriverOrder = Pick<Order, 'id' | 'restaurantName' | 'customerName' | 'customerPhone' | 'orderType' | 'itemsSummary' | 'totalAmount' | 'status' | 'assignmentStatus' | 'createdAt' | 'notes'>;
export type DriverStats = { summary: { totalOrders: number; accepted: number; rejected: number; timeout: number; cancelled: number; completed: number; totalOrderValue: number; totalEarnings: number | null; averageOrderValue: number; acceptanceRate: number; rejectionRate: number }; periods: { period: string; orders: number; orderValue: number; earnings: number }[]; byRestaurant: { name: string; orders: number; orderValue: number; earnings: number }[] };
export type DriverGmailStatus = { configured: boolean; missingConfiguration?: string[]; connected: boolean; email: string | null; registeredEmail: string | null };

export class ApiError extends Error {
  constructor(message: string, public status: number, public requestId?: string) { super(message); this.name = 'ApiError'; }
}

// The preview proxy mounts the API below /talabat; Vercel mounts it at /.
export function catalogImageUrl(url: string | null): string | undefined {
  if (!url) return undefined;
  const previewPrefix = import.meta.env.DEV ? import.meta.env.BASE_URL.replace(/\/$/, '') : '';
  return url.startsWith('/api/storage/db-images/') ? `${previewPrefix}${url}` : url;
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
  adminStats: (token: string, filters?: { from?: string; to?: string; period?: string }) => request<StatsData>(`/api/admin/stats${filters ? `?${new URLSearchParams(Object.entries(filters).filter(([, value]) => !!value) as [string, string][]).toString()}` : ''}`, { headers: { Authorization: `Bearer ${token}` } }),
  adminRequest: <T>(token: string, path: string, method = 'GET', body?: unknown) => request<T>(path, { method, headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : jsonHeaders) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
  driverLogin: (serialNumber: string) => request<{ token: string; driver: DriverIdentity }>('/api/driver/login', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ serialNumber }) }),
  driverOrders: (token: string) => request<{ orders: DriverOrder[] }>('/api/driver/orders', { headers: { Authorization: `Bearer ${token}` } }),
  driverStats: (token: string) => request<DriverStats>('/api/driver/stats', { headers: { Authorization: `Bearer ${token}` } }),
  driverGmailStatus: (token: string) => request<DriverGmailStatus>('/api/driver/gmail/status', { headers: { Authorization: `Bearer ${token}` } }),
  driverGmailConnect: (token: string) => request<{ authorizationUrl: string }>('/api/driver/gmail/connect', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }),
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