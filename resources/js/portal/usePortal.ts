import { useCallback, useEffect, useRef, useState } from 'react';
import { portalApi, portalError } from './api';

/** GET a portal URL; reload() fetches again. */
export function usePortal<T>(url: string | null, params?: Record<string, unknown>) {
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<string | null>(null);
    const key = JSON.stringify(params ?? {});
    const req = useRef(0);

    const load = useCallback(async () => {
        if (!url) {
            return;
        }
        const id = ++req.current;
        setError(null);
        try {
            const r = await portalApi.get<T>(url, { params: JSON.parse(key) });
            if (id === req.current) {
                setData(r.data);
            }
        } catch (e) {
            if (id === req.current) {
                setError(portalError(e));
            }
        }
    }, [url, key]);

    useEffect(() => {
        load();
    }, [load]);

    return { data, error, reload: load };
}
