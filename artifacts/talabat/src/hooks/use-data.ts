import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useCatalog() {
  return useQuery({ queryKey: ['catalog'], queryFn: api.catalog, staleTime: 60_000, retry: 1 });
}
export function useAdminOverview(token: string | null) {
  return useQuery({ queryKey: ['admin', 'overview', token], queryFn: () => api.adminOverview(token!), enabled: !!token, refetchInterval: 5_000, retry: 1 });
}
export function useAdminStats(token: string | null) {
  return useQuery({ queryKey: ['admin', 'stats', token], queryFn: () => api.adminStats(token!), enabled: !!token, refetchInterval: 30_000, retry: 1 });
}