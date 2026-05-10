import { useEffect, useState, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { ApiFetchError } from '@/lib/api';

/**
 * useApiData — the shape every page that fetches server data should use.
 *
 * Mirrors useDataState's return type so it slots into DataTable's
 * isLoading / isError / emptyState props with zero plumbing changes.
 *
 * Honors the dev-mode toggles in AppContext (loadingMode / errorMode / emptyMode)
 * so the Settings page can still simulate states without hitting the network.
 */
export function useApiData<T>(
  fetcher: () => Promise<T[]>,
  deps: unknown[] = [],
) {
  const { settings } = useApp();
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; status: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (e) {
      const err = e as ApiFetchError | Error;
      setError({
        message: err.message || 'Could not load data',
        status: (err as ApiFetchError).status ?? 0,
      });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { load(); }, [load]);

  // Dev-mode overrides
  if (settings.loadingMode) return { data: [] as T[], isLoading: true, isError: null, isEmpty: false, refetch: load };
  if (settings.errorMode)   return { data: [] as T[], isLoading: false, isError: { message: 'Simulated error (toggle off in Settings)', status: 0 }, isEmpty: false, refetch: load };
  if (settings.emptyMode)   return { data: [] as T[], isLoading: false, isError: null, isEmpty: true, refetch: load };

  return {
    data,
    isLoading,
    isError: error,
    isEmpty: data.length === 0,
    refetch: load,
  };
}
