import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export type AdminCategory = { id: number; restaurantId: number; name: string; isAvailable?: boolean };
export type AdminProduct = { id: number; restaurantId: number; categoryId?: number | null; category?: string | null; name: string; description?: string | null; price: number; imageUrl?: string | null; isAvailable?: boolean; stockQuantity?: number | null };
export type AdminMenu = { categories: AdminCategory[]; products: AdminProduct[] };
export type AdminSettings = { settings: { adminUsername: string; dispatchTimeoutMinutes: number } };
export type AdminRow = Record<string, unknown> & { id?: number };

export function useAdminMenu(token: string, restaurantId: number | null) {
  return useQuery({ queryKey: ['admin', 'menu', restaurantId], queryFn: () => api.adminRequest<AdminMenu>(token, `/api/admin/menu?restaurantId=${restaurantId}`), enabled: !!token && !!restaurantId, retry: 1 });
}
export function useAdminSettings(token: string) {
  return useQuery({ queryKey: ['admin', 'settings'], queryFn: () => api.adminRequest<AdminSettings>(token, '/api/admin/settings'), enabled: !!token, retry: 1 });
}
export function useAdminWrite(token: string, onUnauthorized: () => void) {
  const client = useQueryClient();
  return async <T,>(path: string, method: string, body?: unknown): Promise<T> => {
    try {
      const result = await api.adminRequest<T>(token, path, method, body);
      await Promise.all([client.invalidateQueries({ queryKey: ['admin'] }), client.invalidateQueries({ queryKey: ['catalog'] })]);
      return result;
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error && error.status === 401) onUnauthorized();
      throw error;
    }
  };
}