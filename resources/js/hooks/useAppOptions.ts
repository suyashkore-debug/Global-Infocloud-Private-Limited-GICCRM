import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export type AppOptions = Record<string, string>;

let cache: Promise<AppOptions> | null = null;

/**
 * Company settings that shape everyday screens (defaults, visible fields): loaded once per page
 * load. Null until they arrive.
 */
export function useAppOptions(): AppOptions | null {
    const [options, setOptions] = useState<AppOptions | null>(null);

    useEffect(() => {
        cache ??= api.get<{ data: AppOptions }>('/app-options').then((r) => r.data.data).catch(() => ((cache = null), {}));
        let alive = true;
        cache.then((o) => alive && setOptions(o));

        return () => {
            alive = false;
        };
    }, []);

    return options;
}
