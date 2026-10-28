import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, companyStore, onUnauthorized, tokenStore } from '../lib/api';
import { deviceId } from '../lib/storage';
import type { User } from '../types';

/** Admins and HR must clear a second step: an emailed code, or their authenticator app. */
export type LoginResult =
    | { kind: 'signed-in' }
    | { kind: 'second-step'; method: 'email' | 'authenticator'; message: string; emailHint?: string };

interface LoginReply {
    message?: string;
    otp_required?: boolean;
    two_factor_required?: boolean;
    data?: { access_token?: string; user?: User; email_hint?: string };
}

interface AuthContextValue {
    user: User | null;
    loading: boolean;
    login: (username: string, password: string) => Promise<LoginResult>;
    verifyOtp: (username: string, otp: string) => Promise<void>;
    logout: () => Promise<void>;
    /** Replace the signed-in user after a profile change. */
    updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(() => tokenStore.get() !== null);

    useEffect(() => {
        onUnauthorized(() => setUser(null));

        if (!tokenStore.get()) {
            return;
        }

        api.get<{ data: { user: User } }>('/me')
            .then(({ data }) => setUser(data.data.user))
            .catch(() => {
                tokenStore.clear();
                setUser(null);
            })
            .finally(() => setLoading(false));
    }, []);

    const finishSignIn = useCallback((reply: LoginReply): boolean => {
        const token = reply.data?.access_token;
        if (!token || !reply.data?.user) {
            return false;
        }

        tokenStore.set(token);
        setUser(reply.data.user);

        return true;
    }, []);

    const login = useCallback(
        async (username: string, password: string): Promise<LoginResult> => {
            const { data } = await api.post<LoginReply>('/login', { username, password, device_id: deviceId() });

            if (finishSignIn(data)) {
                return { kind: 'signed-in' };
            }

            return {
                kind: 'second-step',
                method: data.two_factor_required ? 'authenticator' : 'email',
                message: data.message ?? 'Enter the verification code to finish signing in.',
                emailHint: data.data?.email_hint,
            };
        },
        [finishSignIn],
    );

    const verifyOtp = useCallback(
        async (username: string, otp: string): Promise<void> => {
            const { data } = await api.post<LoginReply>('/login/verify-otp', { username, otp, device_id: deviceId() });

            if (!finishSignIn(data)) {
                throw new Error(data.message ?? 'Verification failed. Please sign in again.');
            }
        },
        [finishSignIn],
    );

    const logout = useCallback(async (): Promise<void> => {
        try {
            await api.post('/logout');
        } catch {
            // Signed out locally either way.
        }

        tokenStore.clear();
        companyStore.set(null);
        setUser(null);
    }, []);

    const value = useMemo(() => ({ user, loading, login, verifyOtp, logout, updateUser: setUser }), [user, loading, login, verifyOtp, logout]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used inside <AuthProvider>.');
    }

    return context;
}
