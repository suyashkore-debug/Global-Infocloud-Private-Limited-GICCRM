import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../lib/api';

/**
 * GET a URL and keep the response body; reload() fetches again. A null url skips the request.
 */
export function useApi<T>(url: string | null, params?: Record<string, unknown>) {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(url !== null);
    const [error, setError] = useState<string | null>(null);
    const paramsKey = JSON.stringify(params ?? {});
    const requestId = useRef(0);

    const load = useCallback(async () => {
        if (!url) {
            return;
        }
        const id = ++requestId.current;
        setLoading(true);
        setError(null);
        try {
            const response = await api.get<T>(url, { params: JSON.parse(paramsKey) });
            if (id === requestId.current) {
                setData(response.data);
            }
        } catch (e) {
            if (id === requestId.current) {
                setError(errorMessage(e));
            }
        } finally {
            if (id === requestId.current) {
                setLoading(false);
            }
        }
    }, [url, paramsKey]);

    useEffect(() => {
        load();
    }, [load]);

    return { data, setData, loading, error, reload: load };
}
