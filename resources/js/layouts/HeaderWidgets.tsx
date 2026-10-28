import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Building, ChevronDown, ListTodo, MessageCircle, Newspaper, Smartphone } from 'lucide-react';
import { api, companyStore } from '../lib/api';
import { CHAT_CHANGED, TODOS_CHANGED } from '../lib/events';
import { timeAgo } from '../lib/format';
import { useApi } from '../hooks/useApi';
import { useEvent } from '../hooks/useEvent';
import { Avatar, Menu } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { useRealtimeEvent } from '../lib/realtime';
import { disablePush, enablePush, usePushState } from '../lib/pwa';
import type { AppNotification, Paginated } from '../types';

/** The notifications bell, refreshed every minute. */
export function NotificationsBell() {
    const navigate = useNavigate();
    const { data, reload } = useApi<Paginated<AppNotification> & { meta: { unread: number } }>('/notifications');

    useRealtimeEvent('staff', 'notification', reload);
    useEffect(() => {
        const interval = setInterval(reload, 60000);

        return () => clearInterval(interval);
    }, [reload]);

    async function openNotification(n: AppNotification, close: () => void) {
        close();
        if (!n.read_at) {
            await api.post(`/notifications/${n.id}/read`).catch(() => {});
            reload();
        }
        if (n.link) {
            navigate(n.link);
        }
    }

    const unread = data?.meta.unread ?? 0;

    return (
        <Menu
            trigger={(toggle) => (
                <button type="button" onClick={toggle} className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100" title="Notifications">
                    <Bell className="h-5 w-5" />
                    {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
                </button>
            )}
        >
            {(close) => (
                <div className="w-80 sm:w-96">
                    <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
                        <span className="text-xs font-semibold uppercase text-gray-500">Notifications</span>
                        {unread > 0 && (
                            <button type="button" onClick={() => api.post('/notifications/read-all').then(reload)} className="text-xs font-medium text-blue-700 hover:underline">
                                Mark all as read
                            </button>
                        )}
                    </div>
                    <ul className="max-h-96 overflow-y-auto">
                        {(data?.data ?? []).map((n) => (
                            <li key={n.id}>
                                <button type="button" onClick={() => openNotification(n, close)} className={`flex w-full gap-2.5 px-3 py-2.5 text-left hover:bg-gray-50 ${n.read_at ? '' : 'bg-blue-50/50'}`}>
                                    <Avatar id={n.from_user?.id} name={n.from_user?.full_name ?? 'System'} size="sm" />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm">
                                            <span className="font-semibold">{n.from_user?.full_name ?? 'Reminder'}</span> {n.description}
                                        </span>
                                        <span className="text-xs text-gray-400">{timeAgo(n.created_at)}</span>
                                    </span>
                                    {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />}
                                </button>
                            </li>
                        ))}
                        {data && data.data.length === 0 && <li className="px-3 py-6 text-center text-sm text-gray-500">No notifications.</li>}
                    </ul>
                    <PhoneNotifications />
                </div>
            )}
        </Menu>
    );
}

/** This device's phone / browser notifications (PWA Web Push), switched on or off. */
export function PhoneNotifications() {
    const toast = useToast();
    const [state, setState] = usePushState();
    const [busy, setBusy] = useState(false);
    if (state === null || state === 'unsupported') {
        return null;
    }

    async function toggle() {
        setBusy(true);
        try {
            const next = state === 'on' ? await disablePush() : await enablePush();
            setState(next);
            toast(next === 'on' ? 'Notifications are on for this device.' : next === 'blocked' ? 'Notifications are blocked — allow them in the browser settings for this site.' : 'Notifications are off for this device.', next === 'blocked' ? 'error' : undefined);
        } catch (e) {
            toast(e instanceof Error ? e.message : 'Could not change notifications.', 'error');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="flex items-center gap-3 border-t border-slate-100 px-3 py-2.5">
            <Smartphone className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="min-w-0 flex-1 text-[12.5px] leading-tight text-slate-600">
                <b className="block font-semibold text-slate-700">Notifications on this device</b>
                {state === 'blocked' ? 'Blocked in the browser settings' : state === 'on' ? 'You get alerts even when the CRM is closed' : 'Get alerts on your phone or desktop'}
            </span>
            {state !== 'blocked' && (
                <button
                    type="button"
                    role="switch"
                    aria-checked={state === 'on'}
                    disabled={busy}
                    onClick={toggle}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition ${state === 'on' ? 'bg-brand' : 'bg-slate-300'} disabled:opacity-60`}
                >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${state === 'on' ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
            )}
        </div>
    );
}

/** Perfex header "To Do" icon with the number of unfinished items. */
export function TodosIcon() {
    const { data, reload } = useApi<{ data: { unfinished: number } }>('/todos/count');
    useEvent([TODOS_CHANGED], reload);
    const count = data?.data.unfinished ?? 0;

    return (
        <Link to="/todos" className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100" title="To Do Items">
            <ListTodo className="h-5 w-5" />
            {count > 0 && <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">{count > 9 ? '9+' : count}</span>}
        </Link>
    );
}

/**
 * Chat shortcut with the unread count. While you are elsewhere in the app, a new message pops up
 * as a notice you can click.
 */
export function ChatIcon() {
    const toast = useToast();
    const navigate = useNavigate();
    const location = useLocation();
    const [unread, setUnread] = useState<{ total: number; latest: { id: number; sender: string | null; text: string } | null } | null>(null);
    const lastSeen = useRef<number | null>(null);

    const load = useCallback(() => {
        api.get('/chat/unread')
            .then((r) => setUnread(r.data.data))
            .catch(() => undefined);
    }, []);
    useEffect(() => {
        load();
        const id = setInterval(() => document.visibilityState === 'visible' && load(), 15000);

        return () => clearInterval(id);
    }, [load]);
    useEvent([CHAT_CHANGED], load);
    useRealtimeEvent('staff', 'chat', load);

    useEffect(() => {
        const latest = unread?.latest;
        if (latest && lastSeen.current !== null && latest.id > lastSeen.current && !location.pathname.startsWith('/chat')) {
            toast(`💬 ${latest.sender}: ${latest.text}`);
        }
        if (latest) {
            lastSeen.current = Math.max(lastSeen.current ?? 0, latest.id);
        } else if (lastSeen.current === null && unread) {
            lastSeen.current = 0;
        }
    }, [unread, location.pathname, toast]);

    const count = unread?.total ?? 0;

    return (
        <button type="button" onClick={() => navigate('/chat')} className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100" title="Chat">
            <MessageCircle className="h-5 w-5" />
            {count > 0 && <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{count > 99 ? '99+' : count}</span>}
        </button>
    );
}

/** Perfex header newsfeed shortcut. */
export function NewsfeedIcon() {
    return (
        <Link to="/newsfeed" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" title="Newsfeed">
            <Newspaper className="h-5 w-5" />
        </Link>
    );
}

/**
 * Super admins (HRMS platform staff) pick the company to work in, like HRMS's "Login as".
 * The choice is kept in this browser and the app reloads in that company.
 */
export function CompanySwitcher({ currentName, acting }: { currentName: string; acting: boolean }) {
    const { data } = useApi<{ data: { id: number; name: string; status: string }[] }>('/companies');
    const [search, setSearch] = useState('');
    const current = companyStore.get();

    const choose = (id: number | null) => {
        companyStore.set(id);
        window.location.href = '/';
    };

    return (
        <Menu
            align="left"
            trigger={(toggle) => (
                <button type="button" onClick={toggle} className={`inline-flex max-w-[16rem] items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[13px] font-medium ${acting ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`} title="Switch company">
                    <Building className="h-4 w-4 shrink-0" />
                    <span className="truncate">{currentName}</span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                </button>
            )}
        >
            {(close) => (
                <div className="w-72">
                    <p className="border-b border-gray-100 px-3 py-2 text-xs font-semibold uppercase text-gray-500">Switch company</p>
                    <div className="p-2">
                        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company..." className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-blue-500" autoFocus />
                    </div>
                    <ul className="max-h-80 overflow-y-auto pb-1">
                        {acting && (
                            <li>
                                <button type="button" onClick={() => (close(), choose(null))} className="w-full px-3 py-2 text-left text-[13px] font-medium text-blue-700 hover:bg-gray-50">
                                    ← Back to my own company
                                </button>
                            </li>
                        )}
                        {(data?.data ?? [])
                            .filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()))
                            .map((c) => (
                                <li key={c.id}>
                                    <button
                                        type="button"
                                        onClick={() => (close(), choose(c.id))}
                                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-gray-50 ${String(c.id) === current ? 'bg-blue-50 font-semibold' : ''}`}
                                    >
                                        <span className="flex-1 truncate">{c.name}</span>
                                        {c.status !== 'active' && <span className="text-[10px] uppercase text-gray-400">{c.status}</span>}
                                    </button>
                                </li>
                            ))}
                    </ul>
                </div>
            )}
        </Menu>
    );
}
