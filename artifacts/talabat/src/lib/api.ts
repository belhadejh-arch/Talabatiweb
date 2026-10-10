export type Restaurant = { id: number; name: string; slug: string; phone: string | null; address: string | null; description: string | null; deliveryFee: number; imageUrl: string | null; latitude?: number | null; longitude?: number | null; openingTime?: string; closingTime?: string; isOpen?: boolean; status?: string };
export type Product = { id: number; restaurantId: number; name: string; description: string | null; price: number; category: string | null; imageUrl: string | null };
export type Catalog = { restaurants: Restaurant[]; products: Product[]; subscriptions: unknown[] };
export type OrderAddon = { addonName: string; price: number };
export type OrderItem = { productId: number | null; productName?: string; quantity: number; unitPrice?: number; subtotal?: number; totalPrice?: number; selectedSize?: string | null; addons?: OrderAddon[] };
export type Order = { id: number; orderNumber?: number; invoiceNumber?: string; restaurantId: number; restaurantName?: string; customerName: string; customerPhone: string; orderType: 'DELIVERY' | 'RESERVATION'; latitude?: number | null; longitude?: number | null; deliveryLocation?: string | null; mapsUrl?: string | null; items: OrderItem[]; itemsSummary?: string; subtotal: number; deliveryFee: number; totalAmount: number; status: string; assignmentStatus?: string | null; driverApprovalStatus?: string; driverId?: number | null; createdAt: string; cancelledAt?: string | null; cancellationReason?: string | null; reservationDate?: string | null; reservationTime?: string | null; partySize?: number | null; notes?: string | null; isArchived?: boolean };
export type OrderInput = { restaurantId: number; customerName: string; customerPhone: string; orderType: 'DELIVERY' | 'RESERVATION'; items: { productId: number; quantity: number }[]; notes?: string; latitude?: number; longitude?: number; reservationDate?: string; reservationTime?: string; partySize?: number };
export type StatsData = Record<string, unknown>;
export type AdminOverview = { orders: Order[]; drivers: Record<string, unknown>[]; subscriptions: Record<string, unknown>[]; restaurants: Restaurant[]; stats: StatsData };
export type DriverIdentity = { id: number; name: string; email: string; restaurantId: number; serialNumber?: string; latitude?: number | null; longitude?: number | null; locationUpdatedAt?: string | null };
export type RestaurantIdentity = { id: number; name: string; phone: string; address: string };
export type RestaurantPortal = {
  restaurant: RestaurantIdentity;
  orders: Order[];
  summary: {
    totalOrders: number;
    activeOrders: number;
    archivedOrders: number;
    payableOrders: number;
    revenue: number;
  };
};
export type DriverOrder = Pick<Order, 'id' | 'orderNumber' | 'invoiceNumber' | 'restaurantId' | 'restaurantName' | 'customerName' | 'customerPhone' | 'orderType' | 'latitude' | 'longitude' | 'deliveryLocation' | 'mapsUrl' | 'items' | 'itemsSummary' | 'subtotal' | 'deliveryFee' | 'totalAmount' | 'status' | 'assignmentStatus' | 'driverApprovalStatus' | 'driverId' | 'createdAt' | 'cancelledAt' | 'cancellationReason' | 'notes'>;
export type DriverStats = { summary: { totalOrders: number; accepted: number; rejected: number; timeout: number; cancelled: number; completed: number; totalOrderValue: number; totalEarnings: number | null; averageOrderValue: number; acceptanceRate: number; rejectionRate: number }; periods: { period: string; orders: number; orderValue: number; earnings: number }[]; byRestaurant: { name: string; orders: number; orderValue: number; earnings: number }[] };
export type DriverGmailStatus = { configured: boolean; missingConfiguration?: string[]; connected: boolean; email: string | null; registeredEmail: string | null };

export class ApiError extends Error {
  constructor(message: string, public status: number, public requestId?: string) { super(message); this.name = 'ApiError'; }
}

// The preview proxy mounts the API below /talabat; Vercel mounts it at /.
export function catalogImageUrl(url: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('data:image/')) return url;
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
  restaurantLogin: (serialNumber: string) => request<{ token: string; restaurant: RestaurantIdentity }>('/api/restaurant/login', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ serialNumber }) }),
  restaurantOverview: (token: string) => request<RestaurantPortal>('/api/restaurant/overview', { headers: { Authorization: `Bearer ${token}` } }),
  driverOrders: (token: string) => request<{ orders: DriverOrder[] }>('/api/driver/orders', { headers: { Authorization: `Bearer ${token}` } }),
  driverStats: (token: string) => request<DriverStats>('/api/driver/stats', { headers: { Authorization: `Bearer ${token}` } }),
  driverGmailStatus: (token: string) => request<DriverGmailStatus>('/api/driver/gmail/status', { headers: { Authorization: `Bearer ${token}` } }),
  driverGmailConnect: (token: string) => request<{ authorizationUrl: string }>('/api/driver/gmail/connect', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }),
  driverUpdateLocation: (token: string, latitude: number, longitude: number) => request<{ ok: boolean; latitude: number; longitude: number }>('/api/driver/location', { method: 'POST', headers: { ...jsonHeaders, Authorization: `Bearer ${token}` }, body: JSON.stringify({ latitude, longitude }) }),
  driverRespondOrder: (token: string, orderId: number, decision: 'ACCEPTED' | 'REJECTED') => request<{ ok: boolean; decision: string }>(`/api/driver/orders/${orderId}/respond`, { method: 'POST', headers: { ...jsonHeaders, Authorization: `Bearer ${token}` }, body: JSON.stringify({ decision }) }),
  archiveAllOrders: (token: string) => request<{ ok: boolean; count: number }>('/api/admin/orders/archive-all', { method: 'POST', headers: { ...jsonHeaders, Authorization: `Bearer ${token}` } }),
  restoreOrder: (token: string, orderId: number) => request<{ ok: boolean }>(`/api/admin/orders/${orderId}/restore`, { method: 'POST', headers: { ...jsonHeaders, Authorization: `Bearer ${token}` } }),
};

export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function formatDistance(km: number): string {
  if (!Number.isFinite(km) || km < 0) return '';
  if (km < 1) {
    return `${Math.round(km * 1000)} م`;
  }
  return `${km.toFixed(1)} كم`;
}

export const CURRENCY = 'د.ل';
export const money = (value: number | string | null | undefined) => new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(Number(value) || 0);
export const dateLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};
export const statusLabel = (status: string) => ({
  NEW: 'جديد', PENDING: 'بانتظار قرار السائق', WAITING_FOR_DRIVER: 'بانتظار قرار السائق',
  ASSIGNED: 'بانتظار قرار السائق', CONFIRMED: 'مؤكد من السائق', ACCEPTED: 'مقبول',
  REJECTED: 'مرفوض من السائق', PREPARING: 'قيد التجهيز', READY: 'جاهز', ON_THE_WAY: 'في الطريق',
  DELIVERED: 'تم التوصيل', COMPLETED: 'مكتمل', CANCELLED: 'ملغى',
  TIMEOUT: 'انتهت مهلة السائق', NOT_ASSIGNED: 'لم يُعيّن سائق',
} as Record<string, string>)[status] || status;