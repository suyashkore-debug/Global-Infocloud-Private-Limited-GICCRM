import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export type AppOptions = Record<string, string>;

let cache: Promise<AppOptions> | null = null;
const CHANGED = 'app-options-changed';

const load = () => (cache ??= api.get<{ data: AppOptions }>('/app-options').then((r) => r.data.data).catch(() => ((cache = null), {})));

/** Fetch the settings again (after Setup saved some) and update every screen using them. */
export function reloadAppOptions(): void {
    cache = null;
    window.dispatchEvent(new Event(CHANGED));
}

/**
 * Company settings that shape everyday screens (defaults, visible fields, the menu): loaded once
 * per page load, again after reloadAppOptions(). Null until they arrive.
 */
export function useAppOptions(): AppOptions | null {
    const [options, setOptions] = useState<AppOptions | null>(null);

    useEffect(() => {
        let alive = true;
        const fetch = () => load().then((o) => alive && setOptions(o));
        fetch();
        window.addEventListener(CHANGED, fetch);

        return () => {
            alive = false;
            window.removeEventListener(CHANGED, fetch);
        };
    }, []);

    return options;
}
