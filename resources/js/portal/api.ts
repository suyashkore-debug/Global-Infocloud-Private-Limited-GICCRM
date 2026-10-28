import axios, { isAxiosError } from 'axios';
import { readStorage, writeStorage } from '../lib/storage';

const TOKEN_KEY = 'portal_token';

/** Customers area login token (kept apart from the staff token). */
export const portalToken = {
    get: (): string | null => readStorage(TOKEN_KEY),
    set: (token: string | null): void => writeStorage(TOKEN_KEY, token),
};

export const portalApi = axios.create({ baseURL: '/api/portal', headers: { Accept: 'application/json' } });

portalApi.interceptors.request.use((config) => {
    const token = portalToken.get();
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
});

portalApi.interceptors.response.use(
    (r) => r,
    (error) => {
        if (isAxiosError(error) && error.response?.status === 401 && !String(error.config?.url).includes('/login')) {
            portalToken.set(null);
            if (!window.location.pathname.startsWith('/portal/login')) {
                window.location.href = '/portal/login';
            }
        }

        return Promise.reject(error);
    },
);

export function portalError(e: unknown): string {
    if (isAxiosError(e)) {
        const data = e.response?.data as { message?: string; errors?: Record<string, string[]> } | undefined;
        const first = data?.errors ? Object.values(data.errors)[0]?.[0] : undefined;

        return first ?? data?.message ?? e.message;
    }

    return 'Something went wrong.';
}

export type PortalContact = {
    id: number;
    first_name: string;
    last_name: string | null;
    email: string;
    phone: string | null;
    title: string | null;
    is_primary: boolean;
    customer: { id: number; name: string };
    company_name: string;
    company: PortalBrand | null;
    chat_enabled: boolean;
    knowledge_base_enabled: boolean;
    can_close_tickets: boolean;
    can_edit_company: boolean;
    permissions: string[];
};

/** A company's customers-area look: name, HRMS logo and the slug in its login link. */
export type PortalBrand = { name: string; logo_url: string | null; slug: string };

const BRAND_KEY = 'portal_brand';

/** Remembers the last company's branding so its login page shows the logo without ?company=. */
export const portalBrandStore = {
    get(): PortalBrand | null {
        try {
            return JSON.parse(localStorage.getItem(BRAND_KEY) ?? 'null');
        } catch {
            return null;
        }
    },
    set(brand: PortalBrand | null) {
        try {
            if (brand) {
                localStorage.setItem(BRAND_KEY, JSON.stringify(brand));
            } else {
                localStorage.removeItem(BRAND_KEY);
            }
        } catch {
            // Storage blocked: the page just shows the GIC Folks logo.
        }
    },
};
