import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Building2, Check, CheckCheck, FileText, LogOut, Megaphone, MessageCircle, MessageSquarePlus, Palette, Paperclip, Pencil, Plus, Search, Send, Smile, Trash2, UserPlus, Users, X } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { CHAT_CHANGED, emit } from '../../lib/events';
import { useStaff } from '../../hooks/useStaff';
import { Avatar, Button, Field, Input, Modal, Select, StaffMultiSelect, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { AuthImage } from '../../components/comments/AuthImage';
import { downloadAttachment } from '../../components/comments/AttachmentList';
import { useRealtimeConnected, useRealtimeEvent } from '../../lib/realtime';
import { AudioPlayer, chatDay, chatTime, EMOJIS, fileSize, Linkified, usePolling, VoiceRecorder, type ChatFile } from '../../components/chat/ChatShared';
import type { Attachment } from '../../types';

type Preview = { text: string; at: string; own: boolean } | null;
type Status = 'online' | 'away' | 'busy' | 'offline';
type Theme = 'light' | 'dark';
type ChatStaff = { id: number; full_name: string; photo_url: string | null; status: Status; unread: number; last_message: Preview };
type ChatGroupRow = { id: number; name: string; members_count: number; can_manage: boolean; unread: number; last_message: Preview };
type ChatCustomer = { id: number; name: string; customer: string | null; unread: number; last_message: Preview };
type Contacts = {
    me: { id: number; status: Status; theme: Theme; color: string | null };
    can_announce: boolean;
    staff: ChatStaff[];
    groups: ChatGroupRow[];
    customers: ChatCustomer[] | null;
};
type Message = {
    id: number;
    sender_id: number | null;
    sender_name: string | null;
    message: string | null;
    is_own: boolean;
    from_contact: boolean;
    is_announcement: boolean;
    created_at: string;
    files: ChatFile[];
};
type MessagesReply = {
    data: Message[];
    meta: {
        has_more: boolean;
        typing: string[];
        read_up_to?: number;
        members?: number[];
        group?: { id: number; name: string; created_by: number; can_manage: boolean };
        contact?: { id: number; name: string; email: string; customer: { id: number; name: string }; can_log_in: boolean; last_login_at: string | null };
    };
};

const STATUS_COLOR: Record<Status, string> = { online: 'bg-emerald-500', away: 'bg-amber-400', busy: 'bg-red-500', offline: 'bg-gray-300' };
const DEFAULT_COLOR = '#0b2c56';
const COLORS = [DEFAULT_COLOR, '#2563eb', '#0891b2', '#059669', '#65a30d', '#fa6010', '#dc2626', '#db2777', '#7c3aed', '#475569'];
const shortWhen = (iso: string) => (new Date(iso).toDateString() === new Date().toDateString() ? chatTime(iso) : new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' }));
const blob = (url: string) => () => api.get(url.replace(/^\/api/, ''), { responseType: 'blob' }).then((r) => r.data as Blob);

/**
 * Staff chat (GICHRMS "Powerful Chat"): colleagues, groups and customers on the left, the
 * conversation on the right, with files, voice messages, emojis, "is typing…", read receipts,
 * shared files, group members, a light / dark look and admin announcements.
 */
export default function ChatPage() {
    const toast = useToast();
    const [params, setParams] = useSearchParams();
    const active = params.get('with');
    const [contacts, setContacts] = useState<Contacts | null>(null);
    const [tab, setTab] = useState<'staff' | 'groups' | 'customers'>(active?.startsWith('group:') ? 'groups' : active?.startsWith('contact:') ? 'customers' : 'staff');
    const [filter, setFilter] = useState('');
    const [results, setResults] = useState<{ id: number; message: string; sender: string; created_at: string; conversation: { key: string; name: string } }[] | null>(null);
    const [modal, setModal] = useState<'group' | 'customer' | 'announce' | null>(null);
    const [lookOpen, setLookOpen] = useState(false);

    const loadContacts = useCallback(() => {
        api.get<Contacts>('/chat/contacts').then((r) => setContacts(r.data)).catch(() => undefined);
    }, []);
    useEffect(loadContacts, [loadContacts]);
    // Live: the list reloads when a message arrives; online status still refreshes by polling.
    const live = useRealtimeConnected('staff');
    usePolling(loadContacts, live ? 30000 : 5000);
    useRealtimeEvent('staff', 'chat', loadContacts);

    const open = (key: string) => setParams({ with: key });

    async function save(path: string, body: Record<string, unknown>) {
        try {
            await api.post(path, body);
            loadContacts();
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    async function searchMessages() {
        if (filter.trim().length < 2) {
            return;
        }
        try {
            const r = await api.get('/chat/search', { params: { q: filter.trim() } });
            setResults(r.data.data);
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    const q = filter.trim().toLowerCase();
    const staff = (contacts?.staff ?? [])
        .filter((s) => !q || s.full_name?.toLowerCase().includes(q))
        // Recent conversations first, then everyone else by name.
        .sort((a, b) => (b.last_message?.at ?? '').localeCompare(a.last_message?.at ?? '') || (a.full_name ?? '').localeCompare(b.full_name ?? ''));
    const groups = (contacts?.groups ?? []).filter((g) => !q || g.name.toLowerCase().includes(q));
    const customers = (contacts?.customers ?? []).filter((c) => !q || `${c.name} ${c.customer}`.toLowerCase().includes(q));
    const unread = {
        staff: contacts?.staff.reduce((n, s) => n + s.unread, 0) ?? 0,
        groups: contacts?.groups.reduce((n, g) => n + g.unread, 0) ?? 0,
        customers: contacts?.customers?.reduce((n, c) => n + c.unread, 0) ?? 0,
    };
    const tabs = (['staff', 'groups', ...(contacts?.customers ? ['customers'] : [])] as const) as readonly ('staff' | 'groups' | 'customers')[];
    const activeStaff = active?.startsWith('user:') ? contacts?.staff.find((s) => `user:${s.id}` === active) : undefined;
    const activeGroup = active?.startsWith('group:') ? contacts?.groups.find((g) => `group:${g.id}` === active) : undefined;
    const isContact = !!active?.startsWith('contact:') && contacts?.customers !== null;
    const savedTheme = contacts?.me.theme ?? 'light';
    // With the whole CRM in dark mode the light chat classes already render dark.
    const theme = document.documentElement.classList.contains('dark') ? 'light' : savedTheme;
    const color = contacts?.me.color ?? DEFAULT_COLOR;

    return (
        <div className="-mx-4 -mb-10 -mt-6 flex h-[calc(100vh-57px)] overflow-hidden bg-white sm:-mx-6">
            {/* Left: me, search, colleagues, groups, customers */}
            <aside className={`${active ? 'hidden md:flex' : 'flex'} w-full shrink-0 flex-col border-r border-gray-200 md:w-80`}>
                <div className="border-b border-gray-200 p-3">
                    <div className="mb-3 flex items-center gap-1">
                        <h4 className="mr-auto text-[19px] font-bold tracking-tight text-slate-800">Chat</h4>
                        {contacts?.can_announce && (
                            <button type="button" onClick={() => setModal('announce')} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100" title="Send an announcement">
                                <Megaphone className="h-4 w-4" />
                            </button>
                        )}
                        <div className="relative">
                            <button type="button" onClick={() => setLookOpen(!lookOpen)} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100" title="Chat theme and colour">
                                <Palette className="h-4 w-4" />
                            </button>
                            {lookOpen && contacts && (
                                <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
                                    <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Theme</p>
                                    <div className="mb-3 flex gap-1 rounded-lg bg-gray-100 p-1 text-[13px]">
                                        {(['light', 'dark'] as Theme[]).map((t) => (
                                            <button key={t} type="button" onClick={() => save('/chat/settings', { theme: t })} className={`flex-1 rounded-md py-1 ${savedTheme === t ? 'bg-white shadow-sm' : 'text-gray-500'}`}>
                                                {t === 'light' ? 'Light' : 'Dark'}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="mb-2 text-xs font-semibold uppercase text-gray-500">My messages</p>
                                    <div className="grid grid-cols-5 gap-2">
                                        {COLORS.map((c) => (
                                            <button key={c} type="button" onClick={() => save('/chat/settings', { color: c === DEFAULT_COLOR ? null : c })} className={`h-7 w-7 rounded-full ring-offset-2 ${color === c ? 'ring-2 ring-gray-400' : ''}`} style={{ background: c }} aria-label={c} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        {contacts && (
                            <label className="ml-1 flex items-center gap-1 text-[13px] text-gray-600">
                                <span className={`h-2.5 w-2.5 rounded-full ${STATUS_COLOR[contacts.me.status]}`} />
                                <select value={contacts.me.status} onChange={(e) => save('/chat/status', { status: e.target.value })} className="rounded border-0 bg-transparent py-0 pl-0 pr-6 text-[13px] focus:ring-0" aria-label="My status">
                                    {(['online', 'away', 'busy', 'offline'] as Status[]).map((s) => (
                                        <option key={s} value={s}>
                                            {s[0].toUpperCase() + s.slice(1)}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                    </div>
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <Input value={filter} onChange={(e) => (setFilter(e.target.value), setResults(null))} onKeyDown={(e) => e.key === 'Enter' && searchMessages()} placeholder="Search people · Enter searches messages" className="pl-9" />
                    </div>
                    <div className="mt-3 flex gap-1 rounded-lg bg-gray-100 p-1 text-[13px] font-medium">
                        {tabs.map((t) => (
                            <button key={t} type="button" onClick={() => (setTab(t), setResults(null))} className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 ${tab === t ? 'bg-white text-brand shadow-sm' : 'text-gray-500'}`}>
                                {t === 'staff' ? 'Staff' : t === 'groups' ? 'Groups' : 'Customers'}
                                {unread[t] > 0 && <span className="rounded-full bg-accent px-1.5 text-[11px] font-bold text-white">{unread[t]}</span>}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
                    {results ? (
                        <div>
                            <p className="flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase text-gray-500">
                                {results.length} messages found
                                <button type="button" onClick={() => setResults(null)} className="normal-case text-blue-600">
                                    Close
                                </button>
                            </p>
                            {results.map((r) => (
                                <button key={r.id} type="button" onClick={() => open(r.conversation.key)} className="block w-full border-b border-gray-100 px-3 py-2 text-left hover:bg-gray-50">
                                    <p className="text-[13px] font-semibold text-gray-800">
                                        {r.conversation.name} <span className="font-normal text-gray-400">· {shortWhen(r.created_at)}</span>
                                    </p>
                                    <p className="line-clamp-2 text-[13px] text-gray-600">
                                        <span className="text-gray-400">{r.sender}: </span>
                                        {r.message}
                                    </p>
                                </button>
                            ))}
                        </div>
                    ) : tab === 'staff' ? (
                        staff.map((s) => <ContactRow key={s.id} active={active === `user:${s.id}`} onClick={() => open(`user:${s.id}`)} avatar={<StatusAvatar id={s.id} name={s.full_name} photo={s.photo_url} status={s.status} />} title={s.full_name} preview={s.last_message} unread={s.unread} />)
                    ) : tab === 'groups' ? (
                        <>
                            <NewButton label="New group" onClick={() => setModal('group')} />
                            {groups.length === 0 && <p className="px-3 py-6 text-center text-sm text-gray-400">No groups yet.</p>}
                            {groups.map((g) => (
                                <ContactRow key={g.id} active={active === `group:${g.id}`} onClick={() => open(`group:${g.id}`)} avatar={<IconAvatar icon={<Users className="h-4 w-4" />} />} title={g.name} preview={g.last_message} unread={g.unread} />
                            ))}
                        </>
                    ) : (
                        <>
                            <NewButton label="New customer chat" onClick={() => setModal('customer')} />
                            {customers.length === 0 && <p className="px-3 py-6 text-center text-sm text-gray-400">No customer chats yet. Customers write from the customers area.</p>}
                            {customers.map((c) => (
                                <ContactRow
                                    key={c.id}
                                    active={active === `contact:${c.id}`}
                                    onClick={() => open(`contact:${c.id}`)}
                                    avatar={<IconAvatar icon={<Building2 className="h-4 w-4" />} tone="orange" />}
                                    title={`${c.name}${c.customer ? ` · ${c.customer}` : ''}`}
                                    preview={c.last_message}
                                    unread={c.unread}
                                />
                            ))}
                        </>
                    )}
                </div>
            </aside>

            {/* Right: the conversation */}
            <section className={`${active ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col ${theme === 'dark' ? 'bg-slate-900' : 'bg-[#f7f8fa]'}`}>
                {active && contacts && (activeStaff || activeGroup || isContact) ? (
                    <Conversation key={active} conversation={active} staff={activeStaff} group={activeGroup} contacts={contacts} theme={theme} color={color} onBack={() => setParams({})} onChanged={loadContacts} />
                ) : (
                    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                        <span className="relative flex h-24 w-24 items-center justify-center rounded-[28px] bg-gradient-to-br from-[#0b2c56] to-[#1a4f8f] text-white shadow-xl shadow-brand/25">
                            <MessageCircle className="h-11 w-11" />
                            <span className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full bg-accent ring-4 ring-[#f7f8fa]" />
                        </span>
                        <h2 className={`mt-6 text-[19px] font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>Team chat</h2>
                        <p className={`mt-1 max-w-sm text-[13.5px] ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Choose a colleague, a group or a customer on the left to start chatting. Messages update on their own.</p>
                        <div className="mt-5 flex flex-wrap justify-center gap-2">
                            <button type="button" onClick={() => setModal('group')} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-brand-light">
                                <Users className="h-4 w-4" /> New group
                            </button>
                            {contacts?.customers !== null && (
                                <button type="button" onClick={() => setModal('customer')} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-[13px] font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
                                    <Building2 className="h-4 w-4" /> Chat with a customer
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </section>

            {modal === 'group' && <GroupModal onClose={() => setModal(null)} onSaved={(id) => (setModal(null), setTab('groups'), loadContacts(), open(`group:${id}`))} />}
            {modal === 'customer' && <CustomerPicker onClose={() => setModal(null)} onPick={(id) => (setModal(null), setTab('customers'), open(`contact:${id}`))} />}
            {modal === 'announce' && <AnnounceModal hasCustomers={contacts?.customers !== null} onClose={() => setModal(null)} onSent={() => (setModal(null), loadContacts())} />}
        </div>
    );
}

function NewButton({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} className="mx-2 mb-1 flex w-[calc(100%-1rem)] items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-[13px] font-semibold text-brand hover:border-brand/40 hover:bg-brand-50">
            <Plus className="h-4 w-4" /> {label}
        </button>
    );
}

function IconAvatar({ icon, tone = 'navy' }: { icon: ReactNode; tone?: 'navy' | 'orange' }) {
    return <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone === 'navy' ? 'bg-[#0b2c56]/10 text-[#0b2c56]' : 'bg-orange-100 text-orange-600'}`}>{icon}</span>;
}

function StatusAvatar({ id, name, photo, status }: { id: number; name: string | null; photo: string | null; status: Status }) {
    return (
        <span className="relative">
            <Avatar id={id} name={name} photo={photo} />
            <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white ${STATUS_COLOR[status]}`} title={status} />
        </span>
    );
}

function ContactRow({ active, onClick, avatar, title, preview, unread }: { active: boolean; onClick: () => void; avatar: ReactNode; title: string | null; preview: Preview; unread: number }) {
    return (
        <button type="button" onClick={onClick} className={`relative mx-2 my-0.5 flex w-[calc(100%-1rem)] items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition ${active ? 'bg-brand-50' : 'hover:bg-slate-50'}`}>
            {active && <span className="absolute -left-2 top-2 bottom-2 w-[3px] rounded-r-full bg-accent" />}
            {avatar}
            <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                    <span className={`truncate text-[13.5px] ${unread ? 'font-bold text-slate-900' : active ? 'font-semibold text-brand' : 'font-medium text-slate-800'}`}>{title}</span>
                    {preview && <span className="shrink-0 text-[11px] text-gray-400">{shortWhen(preview.at)}</span>}
                </span>
                <span className="flex items-center justify-between gap-2">
                    <span className={`truncate text-[12.5px] ${unread ? 'font-medium text-gray-800' : 'text-gray-500'}`}>{preview ? `${preview.own ? 'You: ' : ''}${preview.text}` : ' '}</span>
                    {unread > 0 && <span className="min-w-[1.25rem] shrink-0 rounded-full bg-accent px-1.5 text-center text-[11px] font-bold text-white">{unread}</span>}
                </span>
            </span>
        </button>
    );
}

function Conversation({ conversation, staff, group, contacts, theme, color, onBack, onChanged }: { conversation: string; staff?: ChatStaff; group?: ChatGroupRow; contacts: Contacts; theme: Theme; color: string; onBack: () => void; onChanged: () => void }) {
    const toast = useToast();
    const allStaff = useStaff();
    const [messages, setMessages] = useState<Message[]>([]);
    const [meta, setMeta] = useState<MessagesReply['meta'] | null>(null);
    const [loading, setLoading] = useState(true);
    const [text, setText] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const [sending, setSending] = useState(false);
    const [emoji, setEmoji] = useState(false);
    const [panel, setPanel] = useState<'files' | 'members' | null>(null);
    const [renaming, setRenaming] = useState(false);
    const scroller = useRef<HTMLDivElement>(null);
    const stick = useRef(true);
    const lastTyping = useRef(0);
    const fileInput = useRef<HTMLInputElement>(null);
    const [kind, id] = conversation.split(':');
    const base = kind === 'user' ? `/chat/direct/${id}` : kind === 'group' ? `/chat/groups/${id}/messages` : `/chat/customer/${id}`;
    const names = useMemo(() => new Map(allStaff.map((s) => [s.id, s])), [allStaff]);
    const dark = theme === 'dark';

    useEffect(() => {
        let alive = true;
        api.get<MessagesReply>(base)
            .then((r) => {
                if (alive) {
                    stick.current = true;
                    setMessages(r.data.data);
                    setMeta(r.data.meta);
                    setLoading(false);
                    onChanged();
                    emit(CHAT_CHANGED);
                }
            })
            .catch((e) => toast(errorMessage(e), 'error'));

        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [base]);

    const pull = () => {
        const after = messages[messages.length - 1]?.id;
        api.get<MessagesReply>(base, { params: after ? { after } : {} }).then((r) => {
            setMeta((m) => ({ ...r.data.meta, has_more: m?.has_more ?? false }));
            if (r.data.data.length && after) {
                setMessages((list) => [...list, ...r.data.data.filter((m) => !list.some((x) => x.id === m.id))]);
                emit(CHAT_CHANGED);
            }
        });
    };
    // Live: new messages, deletions, "Seen" and typing arrive at once; polling is the fallback.
    const live = useRealtimeConnected('staff');
    usePolling(pull, live ? 20000 : 2500);
    const [liveTyping, setLiveTyping] = useState<Record<string, number>>({});
    useRealtimeEvent('staff', 'chat', (d) => {
        if (!d.conversation || d.conversation === conversation) {
            setLiveTyping({}); // the message they were typing has arrived
            pull();
        }
    });
    useRealtimeEvent('staff', 'typing', (d) => {
        if (d.conversation === conversation && typeof d.name === 'string') {
            const name = d.name;
            setLiveTyping((t) => ({ ...t, [name]: Date.now() }));
            setTimeout(() => setLiveTyping((t) => (Date.now() - (t[name] ?? 0) >= 5000 ? Object.fromEntries(Object.entries(t).filter(([n]) => n !== name)) : t)), 5100);
        }
    });
    const typingNames = [...new Set([...(meta?.typing ?? []), ...Object.keys(liveTyping)])];

    useLayoutEffect(() => {
        const el = scroller.current;
        if (el && stick.current) {
            el.scrollTop = el.scrollHeight;
        }
    }, [messages, typingNames.length]);

    async function loadOlder() {
        const el = scroller.current;
        const height = el?.scrollHeight ?? 0;
        const r = await api.get<MessagesReply>(base, { params: { before: messages[0]?.id } });
        stick.current = false;
        setMessages((list) => [...r.data.data, ...list]);
        setMeta((m) => (m ? { ...m, has_more: r.data.meta.has_more } : m));
        requestAnimationFrame(() => el && (el.scrollTop = el.scrollHeight - height));
    }

    async function send(extra: File[] = []) {
        const all = [...files, ...extra];
        if (sending || (!text.trim() && all.length === 0)) {
            return;
        }
        setSending(true);
        const body = new FormData();
        if (text.trim()) {
            body.append('message', text.trim());
        }
        all.forEach((f) => body.append('files[]', f));
        try {
            const r = await api.post<{ data: Message }>(base, body);
            stick.current = true;
            setMessages((list) => [...list, r.data.data]);
            setText('');
            setFiles([]);
            setEmoji(false);
            onChanged();
        } catch (e) {
            toast(errorMessage(e), 'error');
        } finally {
            setSending(false);
        }
    }

    function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
        }
    }

    function typed(value: string) {
        setText(value);
        if (Date.now() - lastTyping.current > 3000 && value.trim()) {
            lastTyping.current = Date.now();
            api.post('/chat/typing', { to: conversation }).catch(() => undefined);
        }
    }

    async function remove(m: Message) {
        if (!confirm('Delete this message?')) {
            return;
        }
        await api.delete(`/chat/messages/${m.id}`);
        setMessages((list) => list.filter((x) => x.id !== m.id));
        onChanged();
    }

    async function groupAction(call: () => Promise<unknown>, message: string, leave = false) {
        try {
            await call();
            toast(message);
            onChanged();
            if (leave) {
                onBack();
            }
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    const contact = meta?.contact;
    const title = staff?.full_name ?? meta?.group?.name ?? group?.name ?? contact?.name ?? '';
    const lastOwn = [...messages].reverse().find((m) => m.is_own);
    const showNames = kind !== 'user';
    const iconBtn = (activeState = false) => `rounded-lg p-2 ${activeState ? (dark ? 'bg-slate-700 text-white' : 'bg-gray-100 text-gray-900') : dark ? 'text-slate-400 hover:bg-slate-800' : 'text-gray-500 hover:bg-gray-100'}`;

    return (
        <>
            <header className={`flex items-center gap-3 border-b px-4 py-2.5 ${dark ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'}`}>
                <button type="button" onClick={onBack} className={`${iconBtn()} md:hidden`} aria-label="Back">
                    <ArrowLeft className="h-5 w-5" />
                </button>
                {staff ? <StatusAvatar id={staff.id} name={staff.full_name} photo={staff.photo_url} status={staff.status} /> : <IconAvatar icon={kind === 'group' ? <Users className="h-4 w-4" /> : <Building2 className="h-4 w-4" />} tone={kind === 'group' ? 'navy' : 'orange'} />}
                <div className="min-w-0 flex-1">
                    <p className={`truncate font-semibold ${dark ? 'text-white' : 'text-gray-800'}`}>{title}</p>
                    <p className={`truncate text-xs ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
                        {typingNames.length ? (
                            <span className="text-emerald-500">{typingNames.join(', ')} typing…</span>
                        ) : staff ? (
                            staff.status
                        ) : contact ? (
                            <>
                                <Link to={`/customers/${contact.customer.id}`} className="hover:underline">
                                    {contact.customer.name}
                                </Link>
                                {' · '}
                                {contact.can_log_in ? (contact.last_login_at ? `last login ${shortWhen(contact.last_login_at)}` : 'has not logged in yet') : 'no customers-area login'}
                            </>
                        ) : (
                            `${meta?.members?.length ?? group?.members_count ?? 0} members`
                        )}
                    </p>
                </div>
                <button type="button" onClick={() => setPanel(panel === 'files' ? null : 'files')} className={iconBtn(panel === 'files')} title="Shared files">
                    <FileText className="h-4 w-4" />
                </button>
                {kind === 'group' && (
                    <>
                        <button type="button" onClick={() => setPanel(panel === 'members' ? null : 'members')} className={iconBtn(panel === 'members')} title="Members">
                            <Users className="h-4 w-4" />
                        </button>
                        {meta?.group?.can_manage && (
                            <>
                                <button type="button" onClick={() => setRenaming(true)} className={iconBtn()} title="Rename group">
                                    <Pencil className="h-4 w-4" />
                                </button>
                                <button type="button" onClick={() => confirm(`Delete the group "${title}" and all its messages?`) && groupAction(() => api.delete(`/chat/groups/${id}`), 'Group deleted.', true)} className={`${iconBtn()} hover:!text-red-600`} title="Delete group">
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </>
                        )}
                        <button type="button" onClick={() => confirm('Leave this group?') && groupAction(() => api.delete(`/chat/groups/${id}/members/${contacts.me.id}`), 'You left the group.', true)} className={iconBtn()} title="Leave group">
                            <LogOut className="h-4 w-4" />
                        </button>
                    </>
                )}
            </header>

            <div className="flex min-h-0 flex-1">
                <div className="flex min-w-0 flex-1 flex-col">
                    <div
                        ref={scroller}
                        onScroll={(e) => {
                            const el = e.currentTarget;
                            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                        }}
                        className="chat-backdrop min-h-0 flex-1 overflow-y-auto px-4 py-4"
                    >
                        {meta?.has_more && (
                            <div className="mb-3 text-center">
                                <button type="button" onClick={loadOlder} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-blue-600 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50">
                                    Load older messages
                                </button>
                            </div>
                        )}
                        {loading && <p className="text-center text-sm text-gray-400">Loading…</p>}
                        {!loading && messages.length === 0 && <p className={`mt-10 text-center text-sm ${dark ? 'text-slate-500' : 'text-gray-400'}`}>No messages yet. Say hello 👋</p>}
                        {messages.map((m, i) => {
                            const prev = messages[i - 1];
                            const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
                            const sameSender = prev && !newDay && prev.sender_id === m.sender_id && prev.from_contact === m.from_contact;
                            const senderName = m.from_contact ? m.sender_name : (m.sender_id && names.get(m.sender_id)?.full_name) || 'Former staff';

                            return (
                                <div key={m.id}>
                                    {newDay && (
                                        <div className="my-3 flex justify-center">
                                            <span className={`rounded-full px-3 py-0.5 text-[11px] font-medium shadow-sm ring-1 ${dark ? 'bg-slate-800 text-slate-400 ring-slate-700' : 'bg-white text-gray-500 ring-gray-200'}`}>{chatDay(m.created_at)}</span>
                                        </div>
                                    )}
                                    <div className={`group flex items-end gap-2 ${m.is_own ? 'justify-end' : ''} ${sameSender ? 'mt-0.5' : 'mt-3'}`}>
                                        {!m.is_own && showNames && <span className="w-8 shrink-0">{!sameSender && (m.from_contact ? <IconAvatar icon={<Building2 className="h-3.5 w-3.5" />} tone="orange" /> : <Avatar id={m.sender_id ?? 0} name={senderName} size="sm" />)}</span>}
                                        {m.is_own && (
                                            <button type="button" onClick={() => remove(m)} className="mb-1 rounded p-1 text-gray-300 opacity-0 hover:text-red-600 group-hover:opacity-100" title="Delete message">
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                        <div
                                            className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-[14px] shadow-sm ${m.is_own ? 'rounded-br-md text-white' : `rounded-bl-md ring-1 ${dark ? 'bg-slate-800 text-slate-100 ring-slate-700' : 'bg-white text-gray-800 ring-gray-200'}`}`}
                                            style={m.is_own ? { background: color } : undefined}
                                        >
                                            {m.is_announcement && <p className={`mb-1 text-[11px] font-bold uppercase tracking-wide ${m.is_own ? 'text-white/80' : 'text-[#fa6010]'}`}>📢 Announcement</p>}
                                            {!m.is_own && showNames && !sameSender && <p className={`mb-0.5 text-[12px] font-semibold ${m.from_contact ? 'text-orange-500' : 'text-[#fa6010]'}`}>{senderName}</p>}
                                            {m.message && (
                                                <p className="whitespace-pre-wrap break-words">
                                                    <Linkified text={m.message} />
                                                </p>
                                            )}
                                            {m.files.map((f) =>
                                                f.is_audio ? (
                                                    <AudioPlayer key={f.id} load={blob(f.download_url)} dark={dark} />
                                                ) : f.is_image ? (
                                                    <AuthImage key={f.id} url={f.download_url} alt={f.original_name} className="mt-1.5 max-h-60 cursor-pointer rounded-lg" onClick={() => downloadAttachment(f as unknown as Attachment)} />
                                                ) : (
                                                    <button
                                                        key={f.id}
                                                        type="button"
                                                        onClick={() => downloadAttachment(f as unknown as Attachment)}
                                                        className={`mt-1.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] ${m.is_own ? 'bg-white/10 hover:bg-white/20' : dark ? 'bg-slate-700 hover:bg-slate-600' : 'bg-gray-50 hover:bg-gray-100'}`}
                                                    >
                                                        <Paperclip className="h-4 w-4 shrink-0" />
                                                        <span className="min-w-0 flex-1 truncate">{f.original_name}</span>
                                                        <span className="shrink-0 opacity-70">{fileSize(f.size)}</span>
                                                    </button>
                                                ),
                                            )}
                                            <p className={`mt-0.5 flex items-center justify-end gap-1 text-[10.5px] ${m.is_own ? 'text-white/70' : dark ? 'text-slate-500' : 'text-gray-400'}`}>
                                                {chatTime(m.created_at)}
                                                {m.is_own && kind !== 'group' && m.id === lastOwn?.id && ((meta?.read_up_to ?? 0) >= m.id ? <CheckCheck className="h-3.5 w-3.5 text-sky-300" aria-label="Seen" /> : <Check className="h-3.5 w-3.5" aria-label="Sent" />)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {typingNames.length ? <p className="mt-2 text-xs italic text-gray-500">{typingNames.join(', ')} typing…</p> : null}
                    </div>

                    {/* Composer */}
                    <div className={`relative border-t p-3 ${dark ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'}`}>
                        {emoji && (
                            <div className="absolute bottom-full left-3 z-10 mb-2 grid w-72 grid-cols-8 gap-1 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
                                {EMOJIS.map((e) => (
                                    <button key={e} type="button" onClick={() => setText((t) => t + e)} className="rounded p-1 text-xl hover:bg-gray-100">
                                        {e}
                                    </button>
                                ))}
                            </div>
                        )}
                        {files.length > 0 && (
                            <div className="mb-2 flex flex-wrap gap-1.5">
                                {files.map((f, i) => (
                                    <span key={i} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">
                                        <Paperclip className="h-3 w-3" /> {f.name}
                                        <button type="button" onClick={() => setFiles(files.filter((_, x) => x !== i))} className="text-gray-400 hover:text-red-600" aria-label="Remove file">
                                            <X className="h-3 w-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                        <div className="flex items-end gap-1.5">
                            <button type="button" onClick={() => setEmoji(!emoji)} className={iconBtn()} title="Emoji">
                                <Smile className="h-5 w-5" />
                            </button>
                            <button type="button" onClick={() => fileInput.current?.click()} className={iconBtn()} title="Attach files">
                                <Paperclip className="h-5 w-5" />
                            </button>
                            <VoiceRecorder onRecorded={(f) => send([f])} onError={(m) => toast(m, 'error')} />
                            <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => (setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 10)), (e.target.value = ''))} />
                            <textarea
                                value={text}
                                onChange={(e) => typed(e.target.value)}
                                onKeyDown={onKey}
                                rows={1}
                                placeholder="Type a message… (Enter to send, Shift+Enter for a new line)"
                                className={`max-h-32 min-h-[40px] flex-1 resize-none rounded-xl border px-3 py-2 text-[14px] outline-none focus:ring-2 ${dark ? 'border-slate-600 bg-slate-900 text-slate-100 placeholder:text-slate-500 focus:ring-slate-500/30' : 'border-gray-300 focus:border-[#0b2c56] focus:ring-[#0b2c56]/10'}`}
                                style={{ height: `${Math.min(128, 40 + (text.split('\n').length - 1) * 20)}px` }}
                            />
                            <button type="button" onClick={() => send()} disabled={sending || (!text.trim() && !files.length)} className="rounded-xl p-2.5 text-white disabled:opacity-40" style={{ background: color }} title="Send">
                                <Send className="h-5 w-5" />
                            </button>
                        </div>
                    </div>
                </div>

                {panel && (
                    <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-gray-200 bg-white p-4 lg:block">
                        {panel === 'files' ? (
                            <SharedFiles conversation={conversation} />
                        ) : (
                            <Members groupId={Number(id)} memberIds={meta?.members ?? []} canManage={!!meta?.group?.can_manage} ownerId={meta?.group?.created_by} meId={contacts.me.id} onChanged={() => api.get<MessagesReply>(base, { params: { after: messages[messages.length - 1]?.id ?? 0 } }).then((r) => setMeta(r.data.meta))} />
                        )}
                    </aside>
                )}
            </div>

            {renaming && group && <RenameModal groupId={group.id} name={title} onClose={() => setRenaming(false)} onSaved={(name) => (setRenaming(false), onChanged(), setMeta((m) => (m && m.group ? { ...m, group: { ...m.group, name } } : m)))} />}
        </>
    );
}

function SharedFiles({ conversation }: { conversation: string }) {
    const [files, setFiles] = useState<Attachment[] | null>(null);
    useEffect(() => {
        api.get<{ data: Attachment[] }>('/chat/files', { params: { with: conversation } }).then((r) => setFiles(r.data.data));
    }, [conversation]);

    return (
        <>
            <h5 className="mb-3 text-sm font-semibold text-gray-800">Shared files</h5>
            {!files ? (
                <p className="text-sm text-gray-400">Loading…</p>
            ) : files.length === 0 ? (
                <p className="text-sm text-gray-400">No files shared yet.</p>
            ) : (
                <ul className="space-y-2">
                    {files.map((f) => (
                        <li key={f.id}>
                            <button type="button" onClick={() => downloadAttachment(f)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-gray-50">
                                <Paperclip className="h-4 w-4 shrink-0 text-gray-400" />
                                <span className="min-w-0 flex-1 truncate text-blue-700">{f.original_name}</span>
                            </button>
                            <p className="pl-8 text-[11px] text-gray-400">
                                {f.user?.full_name ?? 'Customer'} · {f.created_at ? shortWhen(f.created_at) : ''}
                            </p>
                        </li>
                    ))}
                </ul>
            )}
        </>
    );
}

function Members({ groupId, memberIds, canManage, ownerId, meId, onChanged }: { groupId: number; memberIds: number[]; canManage: boolean; ownerId?: number; meId: number; onChanged: () => void }) {
    const toast = useToast();
    const staff = useStaff();
    const [adding, setAdding] = useState<number[]>([]);

    async function run(call: () => Promise<unknown>, message: string) {
        try {
            await call();
            toast(message);
            setAdding([]);
            onChanged();
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    return (
        <>
            <h5 className="mb-3 text-sm font-semibold text-gray-800">Members ({memberIds.length})</h5>
            <ul className="space-y-2">
                {memberIds.map((uid) => {
                    const s = staff.find((x) => x.id === uid);

                    return (
                        <li key={uid} className="flex items-center gap-2 text-[13px]">
                            <Avatar id={uid} name={s?.full_name} size="sm" />
                            <span className="min-w-0 flex-1 truncate">
                                {s?.full_name ?? `User #${uid}`}
                                {uid === ownerId && <span className="ml-1 text-[11px] text-gray-400">(admin)</span>}
                            </span>
                            {canManage && uid !== meId && (
                                <button type="button" onClick={() => run(() => api.delete(`/chat/groups/${groupId}/members/${uid}`), 'Member removed.')} className="text-gray-300 hover:text-red-600" title="Remove">
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </li>
                    );
                })}
            </ul>
            {canManage && (
                <div className="mt-4 space-y-2">
                    <StaffMultiSelect staff={staff.filter((s) => !memberIds.includes(s.id))} value={adding} onChange={setAdding} placeholder="Add members" />
                    <Button size="sm" disabled={!adding.length} onClick={() => run(() => api.post(`/chat/groups/${groupId}/members`, { user_ids: adding }), 'Members added.')}>
                        <UserPlus className="h-4 w-4" /> Add
                    </Button>
                </div>
            )}
        </>
    );
}

function GroupModal({ onClose, onSaved }: { onClose: () => void; onSaved: (id: number) => void }) {
    const staff = useStaff();
    const toast = useToast();
    const [name, setName] = useState('');
    const [members, setMembers] = useState<number[]>([]);

    async function save() {
        try {
            const r = await api.post<{ data: { id: number } }>('/chat/groups', { name, member_ids: members });
            onSaved(r.data.data.id);
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    return (
        <Modal
            open
            title="New group"
            onClose={onClose}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={save} disabled={!name.trim() || !members.length}>
                        Create group
                    </Button>
                </>
            }
        >
            <div className="space-y-3">
                <Field label="Group name" required>
                    <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                </Field>
                <Field label="Members" required>
                    <StaffMultiSelect staff={staff} value={members} onChange={setMembers} />
                </Field>
            </div>
        </Modal>
    );
}

/** Start a chat with a customer contact. */
function CustomerPicker({ onClose, onPick }: { onClose: () => void; onPick: (contactId: number) => void }) {
    const [q, setQ] = useState('');
    const [rows, setRows] = useState<{ id: number; name: string; email: string; customer: string | null; can_log_in: boolean }[] | null>(null);

    useEffect(() => {
        const t = setTimeout(() => api.get('/chat/customer-contacts', { params: { q: q || undefined } }).then((r) => setRows(r.data.data)), 250);

        return () => clearTimeout(t);
    }, [q]);

    return (
        <Modal open title="New customer chat" onClose={onClose}>
            <div className="space-y-3">
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contact, e-mail or customer…" autoFocus />
                <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-200">
                    {rows?.length === 0 && <p className="p-3 text-sm text-gray-500">No contacts found.</p>}
                    {rows?.map((c) => (
                        <button key={c.id} type="button" onClick={() => onPick(c.id)} className="flex w-full items-center gap-3 border-b border-gray-100 px-3 py-2 text-left last:border-0 hover:bg-gray-50">
                            <MessageSquarePlus className="h-4 w-4 shrink-0 text-gray-400" />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13.5px] font-medium">
                                    {c.name} <span className="font-normal text-gray-500">· {c.customer}</span>
                                </span>
                                <span className="block truncate text-xs text-gray-500">
                                    {c.email}
                                    {!c.can_log_in && ' · no customers-area login yet'}
                                </span>
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        </Modal>
    );
}

/** prchat announcement: one message to every colleague or to every customer contact. */
function AnnounceModal({ hasCustomers, onClose, onSent }: { hasCustomers: boolean; onClose: () => void; onSent: () => void }) {
    const toast = useToast();
    const [audience, setAudience] = useState<'staff' | 'customers'>('staff');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);

    async function send() {
        if (!confirm(audience === 'staff' ? 'Send this message to every colleague?' : 'Send this message to every customer contact who can log in to the customers area?')) {
            return;
        }
        setBusy(true);
        try {
            const r = await api.post<{ message: string }>('/chat/announce', { audience, message });
            toast(r.data.message);
            onSent();
        } catch (e) {
            toast(errorMessage(e), 'error');
        } finally {
            setBusy(false);
        }
    }

    return (
        <Modal
            open
            title="Send an announcement"
            onClose={onClose}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={send} loading={busy} disabled={!message.trim()}>
                        <Megaphone className="h-4 w-4" /> Send
                    </Button>
                </>
            }
        >
            <div className="space-y-3">
                <Field label="Send to">
                    <Select value={audience} onChange={(e) => setAudience(e.target.value as 'staff' | 'customers')}>
                        <option value="staff">All staff</option>
                        {hasCustomers && <option value="customers">All customers (customers area)</option>}
                    </Select>
                </Field>
                <Field label="Message" required>
                    <Textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} autoFocus />
                </Field>
                <p className="text-xs text-gray-500">Each person gets it as a chat message marked 📢 Announcement.</p>
            </div>
        </Modal>
    );
}

function RenameModal({ groupId, name, onClose, onSaved }: { groupId: number; name: string; onClose: () => void; onSaved: (name: string) => void }) {
    const toast = useToast();
    const [value, setValue] = useState(name);

    return (
        <Modal
            open
            title="Rename group"
            onClose={onClose}
            footer={
                <Button
                    onClick={() =>
                        api
                            .put(`/chat/groups/${groupId}`, { name: value })
                            .then(() => onSaved(value.trim()))
                            .catch((e) => toast(errorMessage(e), 'error'))
                    }
                    disabled={!value.trim()}
                >
                    Save
                </Button>
            }
        >
            <Input value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        </Modal>
    );
}
