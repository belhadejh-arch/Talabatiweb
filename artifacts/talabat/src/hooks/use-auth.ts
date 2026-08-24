import { useGetMe, getGetMeQueryKey } from '@workspace/api-client-react';

export function useAuth() {
  const { data: user, isLoading, isError } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
      refetchOnWindowFocus: false,
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user && !isError,
  };
}
