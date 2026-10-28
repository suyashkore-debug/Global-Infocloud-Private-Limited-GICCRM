import axios from 'axios';
import { readStorage, writeStorage } from './storage';

const TOKEN_KEY = 'projects_token';

export const tokenStore = {
    get: (): string | null => readStorage(TOKEN_KEY),
    set: (token: string): void => writeStorage(TOKEN_KEY, token),
    clear: (): void => writeStorage(TOKEN_KEY, null),
};

const COMPANY_KEY = 'projects_company';

/** The company a super admin chose with "Switch company" (sent as X-Company-Id). */
export const companyStore = {
    get: (): string | null => readStorage(COMPANY_KEY),
    set: (id: number | null): void => writeStorage(COMPANY_KEY, id ? String(id) : null),
};

export const api = axios.create({
    baseURL: '/api',
    headers: { Accept: 'application/json' },
});

api.interceptors.request.use((config) => {
    const token = tokenStore.get();
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    const company = companyStore.get();
    if (company) {
        config.headers['X-Company-Id'] = company;
    }

    return config;
});

let unauthorizedHandler: (() => void) | null = null;

/** Called when the server stops accepting the saved token (logged out or deactivated in HRMS). */
export function onUnauthorized(handler: () => void): void {
    unauthorizedHandler = handler;
}

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (axios.isAxiosError(error) && error.response?.status === 401 && tokenStore.get()) {
            tokenStore.clear();
            unauthorizedHandler?.();
        }

        return Promise.reject(error);
    },
);

/** The server's message for a failed request, with the attempts left when HRMS reports them. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
    if (!axios.isAxiosError(error)) {
        return error instanceof Error ? error.message : fallback;
    }

    if (!error.response) {
        return 'Cannot reach the server. Check your connection and try again.';
    }

    const data = error.response.data as { message?: string; attempts_left?: number; errors?: Record<string, string[]> };
    const firstFieldError = data?.errors ? Object.values(data.errors)[0]?.[0] : undefined;
    const message = firstFieldError ?? data?.message ?? fallback;

    return typeof data?.attempts_left === 'number'
        ? `${message} (${data.attempts_left} ${data.attempts_left === 1 ? 'attempt' : 'attempts'} left)`
        : message;
}

/** Laravel 422 field errors as { field: first message }. */
export function fieldErrors(error: unknown): Record<string, string> {
    if (!axios.isAxiosError(error) || error.response?.status !== 422) {
        return {};
    }
    const errors = (error.response.data as { errors?: Record<string, string[]> }).errors ?? {};

    return Object.fromEntries(Object.entries(errors).map(([field, messages]) => [field, messages[0]]));
}
