import { useEffect, useRef, useState } from 'react';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

/**
 * Live updates from the Reverb server (Pusher protocol). The server only says what changed
 * ("chat" in a conversation, a new "notification", someone "typing"); screens reload through the
 * normal API. Until the socket is connected, and whenever it drops, screens keep polling.
 */
export type Side = 'staff' | 'portal';
type Handler = (data: Record<string, unknown>) => void;
type AuthPost = (body: { socket_id: string; channel_name: string }) => Promise<{ data: { auth: string } }>;

interface Hub {
    echo: Echo<'reverb'>;
    connected: boolean;
    handlers: Map<string, Set<Handler>>;
    watchers: Set<(connected: boolean) => void>;
}

const hubs: Partial<Record<Side, Hub>> = {};
const env = import.meta.env;

export const realtimeConfigured = Boolean(env.VITE_REVERB_APP_KEY);

/** Connect one side (staff app or customers area) and listen on its private channels. */
export function startRealtime(side: Side, channels: string[], authPost: AuthPost): () => void {
    if (!realtimeConfigured || hubs[side]) {
        return () => undefined;
    }
    const scheme = env.VITE_REVERB_SCHEME ?? 'https';
    const echo = new Echo({
        broadcaster: 'reverb',
        Pusher,
        key: env.VITE_REVERB_APP_KEY,
        wsHost: env.VITE_REVERB_HOST ?? window.location.hostname,
        wsPort: Number(env.VITE_REVERB_PORT ?? 80),
        wssPort: Number(env.VITE_REVERB_PORT ?? 443),
        forceTLS: scheme === 'https',
        enabledTransports: ['ws', 'wss'],
        authorizer: (channel: { name: string }) => ({
            authorize: (socketId: string, callback: (error: Error | null, data: { auth: string } | null) => void) => {
                authPost({ socket_id: socketId, channel_name: channel.name })
                    .then((r) => callback(null, r.data))
                    .catch((e) => callback(e instanceof Error ? e : new Error('Not allowed'), null));
            },
        }),
    });
    const hub: Hub = { echo, connected: false, handlers: new Map(), watchers: new Set() };
    hubs[side] = hub;

    const dispatch = (event: string) => (data: Record<string, unknown>) => hub.handlers.get(event)?.forEach((h) => h(data ?? {}));
    for (const name of channels) {
        const channel = echo.private(name);
        ['chat', 'typing', 'notification', 'whatsapp'].forEach((event) => channel.listen(`.${event}`, dispatch(event)));
    }

    const pusher = (echo.connector as unknown as { pusher: Pusher }).pusher;
    pusher.connection.bind('state_change', ({ current }: { current: string }) => {
        const connected = current === 'connected';
        if (connected !== hub.connected) {
            hub.connected = connected;
            hub.watchers.forEach((w) => w(connected));
            // Catch up on anything missed while disconnected.
            if (connected) {
                hub.handlers.get('chat')?.forEach((h) => h({}));
                hub.handlers.get('notification')?.forEach((h) => h({}));
            }
        }
    });

    return () => {
        echo.disconnect();
        delete hubs[side];
    };
}

/** Run `handler` whenever the server sends `event` to this side. */
export function useRealtimeEvent(side: Side, event: 'chat' | 'typing' | 'notification' | 'whatsapp', handler: Handler) {
    const saved = useRef(handler);
    saved.current = handler;
    useEffect(() => {
        if (!realtimeConfigured) {
            return;
        }
        const call: Handler = (data) => saved.current(data);
        let hub = hubs[side];
        let timer: ReturnType<typeof setInterval> | undefined;
        const attach = () => {
            hub = hubs[side];
            if (!hub) {
                return false;
            }
            if (!hub.handlers.has(event)) {
                hub.handlers.set(event, new Set());
            }
            hub.handlers.get(event)!.add(call);
            return true;
        };
        // The hub may start after this screen mounts (login finishing).
        if (!attach()) {
            timer = setInterval(() => attach() && clearInterval(timer), 500);
        }

        return () => {
            clearInterval(timer);
            hubs[side]?.handlers.get(event)?.delete(call);
        };
    }, [side, event]);
}

/** Whether this side's live connection is up (screens poll slowly while it is). */
export function useRealtimeConnected(side: Side): boolean {
    const [connected, setConnected] = useState(() => hubs[side]?.connected ?? false);
    useEffect(() => {
        if (!realtimeConfigured) {
            return;
        }
        let hub = hubs[side];
        const watch = (c: boolean) => setConnected(c);
        let timer: ReturnType<typeof setInterval> | undefined;
        const attach = () => {
            hub = hubs[side];
            if (!hub) {
                return false;
            }
            hub.watchers.add(watch);
            setConnected(hub.connected);
            return true;
        };
        if (!attach()) {
            timer = setInterval(() => attach() && clearInterval(timer), 500);
        }

        return () => {
            clearInterval(timer);
            hubs[side]?.watchers.delete(watch);
        };
    }, [side]);

    return connected;
}
