import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CheckCheck, MessageCircle, Paperclip, Send, Smile, X } from 'lucide-react';
import { startRealtime, useRealtimeConnected, useRealtimeEvent } from '../lib/realtime';
import { useContact } from './PortalLayout';
import { AudioPlayer, chatDay, chatTime, EMOJIS, fileSize, Linkified, usePolling, VoiceRecorder, type ChatFile } from '../components/chat/ChatShared';
import { portalApi, portalError } from './api';

type Message = { id: number; sender_name: string | null; message: string | null; is_own: boolean; is_announcement: boolean; created_at: string; files: ChatFile[] };
type Reply = { data: Message[]; meta: { has_more: boolean; typing: string[]; read_up_to: number } };

const blob = (url: string) => portalApi.get(url.replace(/^\/api\/portal/, ''), { responseType: 'blob' }).then((r) => r.data as Blob);

async function download(f: ChatFile) {
    const data = await blob(f.download_url);
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(data), download: f.original_name });
    link.click();
    URL.revokeObjectURL(link.href);
}

/** An image from the conversation, loaded with the customer's login. */
function PortalImage({ file }: { file: ChatFile }) {
    const [src, setSrc] = useState<string | null>(null);
    useEffect(() => {
        let url: string | null = null;
        blob(file.download_url).then((b) => setSrc((url = URL.createObjectURL(b))));

        return () => {
            if (url) {
                URL.revokeObjectURL(url);
            }
        };
    }, [file.download_url]);

    return src ? <img src={src} alt={file.original_name} onClick={() => download(file)} className="mt-1.5 max-h-48 cursor-pointer rounded-lg" /> : <div className="mt-1.5 h-24 w-40 animate-pulse rounded-lg bg-gray-200" />;
}

/**
 * Customers-area chat (prchat client chat): a bubble in the corner that opens a conversation
 * with the company's team.
 */
export default function PortalChat({ companyName }: { companyName: string }) {
    const [open, setOpen] = useState(false);
    const [unread, setUnread] = useState(0);
    const [messages, setMessages] = useState<Message[]>([]);
    const [meta, setMeta] = useState<Reply['meta'] | null>(null);
    const [text, setText] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const [emoji, setEmoji] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sending, setSending] = useState(false);
    const scroller = useRef<HTMLDivElement>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    const lastTyping = useRef(0);
    const { contact } = useContact();
    // Live: staff replies, "Seen" and "is typing…" arrive at once; polling is the fallback.
    useEffect(() => startRealtime('portal', [`projects.contact.${contact.id}`], (body) => portalApi.post('/realtime/auth', body)), [contact.id]);
    const live = useRealtimeConnected('portal');
    const [liveTyping, setLiveTyping] = useState<string | null>(null);
    useRealtimeEvent('portal', 'typing', (d) => {
        if (typeof d.name === 'string') {
            setLiveTyping(d.name);
            setTimeout(() => setLiveTyping(null), 5000);
        }
    });

    const loadUnread = () => portalApi.get<{ data: { total: number } }>('/chat/unread').then((r) => setUnread(r.data.data.total)).catch(() => undefined);
    useEffect(() => {
        loadUnread();
    }, []);
    usePolling(loadUnread, live ? 60000 : 15000, !open);

    useEffect(() => {
        if (!open) {
            return;
        }
        portalApi.get<Reply>('/chat').then((r) => (setMessages(r.data.data), setMeta(r.data.meta), setUnread(0)));
    }, [open]);

    const pull = () => {
        const after = messages[messages.length - 1]?.id;
        portalApi.get<Reply>('/chat', { params: after ? { after } : {} }).then((r) => {
            setMeta((m) => ({ ...r.data.meta, has_more: m?.has_more ?? false }));
            if (after && r.data.data.length) {
                setMessages((list) => [...list, ...r.data.data.filter((m) => !list.some((x) => x.id === m.id))]);
            }
        });
    };
    usePolling(pull, live ? 20000 : 3000, open);
    useRealtimeEvent('portal', 'chat', () => {
        setLiveTyping(null);
        if (open) {
            pull();
        } else {
            loadUnread();
        }
    });
    const typingName = meta?.typing?.[0] ?? liveTyping;

    useLayoutEffect(() => {
        scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
    }, [messages, open, typingName]);

    async function loadOlder() {
        const r = await portalApi.get<Reply>('/chat', { params: { before: messages[0]?.id } });
        setMessages((list) => [...r.data.data, ...list]);
        setMeta((m) => (m ? { ...m, has_more: r.data.meta.has_more } : m));
    }

    async function send(extra: File[] = []) {
        const all = [...files, ...extra];
        if (sending || (!text.trim() && !all.length)) {
            return;
        }
        setSending(true);
        setError(null);
        const body = new FormData();
        if (text.trim()) {
            body.append('message', text.trim());
        }
        all.forEach((f) => body.append('files[]', f));
        try {
            const r = await portalApi.post<{ data: Message }>('/chat', body);
            setMessages((list) => [...list, r.data.data]);
            setText('');
            setFiles([]);
            setEmoji(false);
        } catch (e) {
            setError(portalError(e));
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
        if (value.trim() && Date.now() - lastTyping.current > 3000) {
            lastTyping.current = Date.now();
            portalApi.post('/chat/typing').catch(() => undefined);
        }
    }

    const lastOwn = [...messages].reverse().find((m) => m.is_own);

    return (
        <>
            {open && (
                <div className="fixed inset-x-2 bottom-20 z-40 flex h-[70vh] max-h-[560px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-gray-900/10 sm:inset-x-auto sm:right-5 sm:w-[380px]">
                    <div className="flex items-center gap-3 bg-[#0b2c56] px-4 py-3 text-white">
                        <MessageCircle className="h-5 w-5" />
                        <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold">Chat with {companyName}</p>
                            <p className="text-xs text-blue-100/80">{typingName ? `${typingName} is typing…` : 'We usually reply within working hours'}</p>
                        </div>
                        <button type="button" onClick={() => setOpen(false)} className="rounded p-1 hover:bg-white/10" aria-label="Close chat">
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto bg-[#f7f8fa] px-3 py-3">
                        {meta?.has_more && (
                            <button type="button" onClick={loadOlder} className="mx-auto mb-2 block rounded-full bg-white px-3 py-1 text-xs text-blue-600 ring-1 ring-gray-200">
                                Load older messages
                            </button>
                        )}
                        {messages.length === 0 && <p className="mt-12 text-center text-sm text-gray-400">Hello 👋 How can we help you?</p>}
                        {messages.map((m, i) => {
                            const prev = messages[i - 1];
                            const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();

                            return (
                                <div key={m.id}>
                                    {newDay && <p className="my-2 text-center text-[11px] text-gray-400">{chatDay(m.created_at)}</p>}
                                    <div className={`mt-2 flex ${m.is_own ? 'justify-end' : ''}`}>
                                        <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-[13.5px] shadow-sm ${m.is_own ? 'rounded-br-md bg-[#0b2c56] text-white' : 'rounded-bl-md bg-white text-gray-800 ring-1 ring-gray-200'}`}>
                                            {m.is_announcement && <p className="mb-1 text-[11px] font-bold uppercase text-[#fa6010]">📢 Announcement</p>}
                                            {!m.is_own && <p className="mb-0.5 text-[11.5px] font-semibold text-[#fa6010]">{m.sender_name ?? companyName}</p>}
                                            {m.message && (
                                                <p className="whitespace-pre-wrap break-words">
                                                    <Linkified text={m.message} />
                                                </p>
                                            )}
                                            {m.files.map((f) =>
                                                f.is_audio ? (
                                                    <AudioPlayer key={f.id} load={() => blob(f.download_url)} />
                                                ) : f.is_image ? (
                                                    <PortalImage key={f.id} file={f} />
                                                ) : (
                                                    <button key={f.id} type="button" onClick={() => download(f)} className={`mt-1.5 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] ${m.is_own ? 'bg-white/10' : 'bg-gray-50'}`}>
                                                        <Paperclip className="h-3.5 w-3.5 shrink-0" />
                                                        <span className="min-w-0 flex-1 truncate">{f.original_name}</span>
                                                        <span className="opacity-70">{fileSize(f.size)}</span>
                                                    </button>
                                                ),
                                            )}
                                            <p className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${m.is_own ? 'text-white/70' : 'text-gray-400'}`}>
                                                {chatTime(m.created_at)}
                                                {m.is_own && m.id === lastOwn?.id && (meta?.read_up_to ?? 0) >= m.id && <CheckCheck className="h-3.5 w-3.5 text-sky-300" aria-label="Seen" />}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="relative border-t border-gray-200 p-2">
                        {emoji && (
                            <div className="absolute bottom-full left-2 mb-2 grid w-64 grid-cols-8 gap-0.5 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
                                {EMOJIS.map((e) => (
                                    <button key={e} type="button" onClick={() => setText((t) => t + e)} className="rounded p-0.5 text-lg hover:bg-gray-100">
                                        {e}
                                    </button>
                                ))}
                            </div>
                        )}
                        {error && <p className="mb-1 px-1 text-xs text-red-600">{error}</p>}
                        {files.length > 0 && (
                            <div className="mb-1.5 flex flex-wrap gap-1">
                                {files.map((f, i) => (
                                    <span key={i} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px]">
                                        {f.name}
                                        <button type="button" onClick={() => setFiles(files.filter((_, x) => x !== i))} aria-label="Remove file">
                                            <X className="h-3 w-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                        <div className="flex items-end gap-1">
                            <button type="button" onClick={() => setEmoji(!emoji)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" title="Emoji">
                                <Smile className="h-5 w-5" />
                            </button>
                            <button type="button" onClick={() => fileInput.current?.click()} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" title="Attach files">
                                <Paperclip className="h-5 w-5" />
                            </button>
                            <VoiceRecorder onRecorded={(f) => send([f])} onError={setError} />
                            <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => (setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 10)), (e.target.value = ''))} />
                            <textarea value={text} onChange={(e) => typed(e.target.value)} onKeyDown={onKey} rows={1} placeholder="Write a message…" className="min-h-[38px] flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2 text-[13.5px] outline-none focus:border-[#0b2c56]" />
                            <button type="button" onClick={() => send()} disabled={sending || (!text.trim() && !files.length)} className="rounded-xl bg-[#0b2c56] p-2 text-white disabled:opacity-40" title="Send">
                                <Send className="h-5 w-5" />
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <button type="button" onClick={() => setOpen(!open)} className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#0b2c56] text-white shadow-lg hover:bg-[#123d73]" aria-label={open ? 'Close chat' : 'Open chat'} title="Chat with us">
                {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
                {!open && unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#fa6010] px-1 text-[11px] font-bold">{unread}</span>}
            </button>
        </>
    );
}
