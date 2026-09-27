import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useDriverOrders(token: string | null) {
  return useQuery({
    queryKey: ['driver', token, 'orders'],
    queryFn: () => api.driverOrders(token!),
    enabled: !!token,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    retry: (count, error) => !(typeof error === 'object' && error !== null && 'status' in error && error.status === 401) && count < 1,
  });
}

export function useDriverStats(token: string | null) {
  return useQuery({
    queryKey: ['driver', token, 'stats'],
    queryFn: () => api.driverStats(token!),
    enabled: !!token,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    retry: (count, error) => !(typeof error === 'object' && error !== null && 'status' in error && error.status === 401) && count < 1,
  });
}

export function useDriverGmailStatus(token: string | null) {
  return useQuery({
    queryKey: ['driver', token, 'gmail'],
    queryFn: () => api.driverGmailStatus(token!),
    enabled: !!token,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    retry: (count, error) => !(typeof error === 'object' && error !== null && 'status' in error && error.status === 401) && count < 1,
  });
}