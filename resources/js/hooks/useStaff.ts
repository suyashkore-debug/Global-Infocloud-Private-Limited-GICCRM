import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Staff } from '../types';

let cache: Promise<Staff[]> | null = null;

/** The company's active HRMS employees, fetched once per page load. */
export function useStaff(): Staff[] {
    const [staff, setStaff] = useState<Staff[]>([]);

    useEffect(() => {
        cache ??= api.get<{ data: Staff[] }>('/staff').then((r) => r.data.data).catch(() => {
            cache = null;
            return [];
        });
        let active = true;
        cache.then((list) => active && setStaff(list));

        return () => {
            active = false;
        };
    }, []);

    return staff;
}

export function clearStaffCache(): void {
    cache = null;
}
