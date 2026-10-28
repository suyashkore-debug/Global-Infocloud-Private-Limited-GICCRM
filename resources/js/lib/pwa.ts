import { useEffect, useState } from 'react';
import { api } from './api';

/**
 * PWA: the service worker (installable app, offline page, Web Push), the browser's "Install app"
 * offer, and turning phone / browser notifications on or off for this device.
 */
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let installPrompt: InstallPrompt | null = null;
const installWatchers = new Set<(can: boolean) => void>();

export function registerServiceWorker(): void {
    if (!('serviceWorker' in navigator)) {
        return;
    }
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        installPrompt = e as InstallPrompt;
        installWatchers.forEach((w) => w(true));
    });
    window.addEventListener('appinstalled', () => {
        installPrompt = null;
        installWatchers.forEach((w) => w(false));
    });
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
    });
}

/** Whether the browser offers "Install app" right now, and a function to show it. */
export function useInstallApp(): { canInstall: boolean; install: () => Promise<void> } {
    const [canInstall, setCanInstall] = useState(installPrompt !== null);
    useEffect(() => {
        installWatchers.add(setCanInstall);

        return () => {
            installWatchers.delete(setCanInstall);
        };
    }, []);

    return {
        canInstall,
        install: async () => {
            if (!installPrompt) {
                return;
            }
            await installPrompt.prompt();
            await installPrompt.userChoice;
            installPrompt = null;
            setCanInstall(false);
        },
    };
}

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export type PushState = 'unsupported' | 'blocked' | 'off' | 'on';

export async function pushState(): Promise<PushState> {
    if (!pushSupported()) {
        return 'unsupported';
    }
    if (Notification.permission === 'denied') {
        return 'blocked';
    }
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();

    return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

const keyBytes = (base64: string) => {
    const pad = '='.repeat((4 - (base64.length % 4)) % 4);
    const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));

    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** Ask permission (must follow a click), subscribe this device and save it for the user. */
export async function enablePush(): Promise<PushState> {
    if (!pushSupported()) {
        return 'unsupported';
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
        return permission === 'denied' ? 'blocked' : 'off';
    }
    const { data } = await api.get<{ data: { public_key: string | null } }>('/push/key');
    if (!data.data.public_key) {
        throw new Error('Phone notifications are not set up on this server.');
    }
    const reg = (await navigator.serviceWorker.getRegistration('/')) ?? (await navigator.serviceWorker.register('/sw.js', { scope: '/' }));
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(data.data.public_key) }));
    await api.post('/push/subscribe', sub.toJSON());

    return 'on';
}

export async function disablePush(): Promise<PushState> {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
        await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined);
        await sub.unsubscribe();
    }

    return 'off';
}

/** This device's notification state, kept current. */
export function usePushState(): [PushState | null, (s: PushState) => void] {
    const [state, setState] = useState<PushState | null>(null);
    useEffect(() => {
        pushState().then(setState).catch(() => setState('unsupported'));
    }, []);

    return [state, setState];
}
