import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Check, CheckCheck, Clock, Send } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useRealtimeConnected, useRealtimeEvent } from '../../lib/realtime';
import { Linkified, usePolling } from '../../components/chat/ChatShared';
import { Button, EmptyState, Spinner, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../auth/AuthContext';

type Message = { id: number; direction: 'out' | 'in'; type: string; body: string | null; status: string; error: string | null; user: string | null; created_at: string };
type Meta = { configured: boolean; to: string | null; window_open: boolean; window_ends_at: string | null; template_name: string; can_send: boolean };

/**
 * Lead modal → WhatsApp: the conversation with the lead's phone number. Messages go out through
 * the company's WhatsApp Business number and the lead's replies arrive through the webhook.
 */
export default function LeadWhatsApp({ leadId, onSent }: { leadId: number; onSent: () => void }) {
    const toast = useToast();
    const { user } = useAuth();
    const [messages, setMessages] = useState<Message[] | null>(null);
    const [meta, setMeta] = useState<Meta | null>(null);
    const [text, setText] = useState('');
    const [sending, setSending] = useState(false);
    const scroller = useRef<HTMLDivElement>(null);

    const load = useCallback(() => {
        api.get<{ data: Message[]; meta: Meta }>(`/leads/${leadId}/whatsapp`)
            .then((r) => {
                setMessages(r.data.data);
                setMeta(r.data.meta);
            })
            .catch((e) => toast(errorMessage(e), 'error'));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [leadId]);

    useEffect(load, [load]);
    // Replies arrive at once over the live connection; polling is the fallback.
    const live = useRealtimeConnected('staff');
    usePolling(load, live ? 30000 : 5000);
    useRealtimeEvent('staff', 'whatsapp', (d) => {
        if (!d.lead || Number(d.lead) === leadId) {
            load();
        }
    });

    useLayoutEffect(() => {
        if (scroller.current) {
            scroller.current.scrollTop = scroller.current.scrollHeight;
        }
    }, [messages?.length]);

    async function send(template = false) {
        setSending(true);
        try {
            await api.post(`/leads/${leadId}/whatsapp`, template ? { template: true } : { body: text });
            if (!template) {
                setText('');
            }
            onSent();
        } catch (e) {
            toast(errorMessage(e), 'error');
        } finally {
            setSending(false);
            load();
        }
    }

    function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === 'Enter' && !e.shiftKey && text.trim()) {
            e.preventDefault();
            send();
        }
    }

    if (!messages || !meta) {
        return <Spinner />;
    }

    if (!meta.configured) {
        return (
            <EmptyState
                title="WhatsApp is not set up"
                text="Connect your WhatsApp Business number to send messages to leads and see their replies here."
                action={user?.is_admin ? <Link to="/settings?tab=whatsapp">Set up WhatsApp</Link> : undefined}
            />
        );
    }
    if (!meta.to) {
        return <EmptyState title="No phone number" text="Add the lead's phone number (Edit) to chat with them on WhatsApp." />;
    }

    return (
        <div className="space-y-3">
            <p className="text-xs text-gray-500">
                Chatting with <span className="font-semibold text-gray-700">+{meta.to}</span>
                {meta.window_open && meta.window_ends_at && <> · you can send messages until {formatDateTime(meta.window_ends_at)}</>}
            </p>
            <div ref={scroller} className="max-h-[420px] min-h-[200px] space-y-2 overflow-y-auto rounded-lg bg-[#efeae2] p-3">
                {messages.length === 0 && <p className="py-12 text-center text-[13px] text-gray-500">No messages yet.</p>}
                {messages.map((m) => (
                    <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] rounded-lg px-3 py-1.5 text-[13.5px] shadow-sm ${m.direction === 'out' ? 'bg-[#d9fdd3]' : 'bg-white'}`}>
                            {m.type === 'template' && <div className="text-[11px] font-semibold text-emerald-700">Template message</div>}
                            <div className="whitespace-pre-wrap break-words text-gray-900">
                                <Linkified text={m.body ?? ''} />
                            </div>
                            <div className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-gray-500">
                                {m.direction === 'out' && m.user && <span>{m.user} ·</span>}
                                <span title={formatDateTime(m.created_at)}>{formatDateTime(m.created_at)}</span>
                                {m.direction === 'out' && <StatusIcon status={m.status} />}
                            </div>
                            {m.status === 'failed' && m.error && <div className="mt-1 text-[11.5px] text-red-600">{m.error}</div>}
                        </div>
                    </div>
                ))}
            </div>
            {meta.can_send &&
                (meta.window_open ? (
                    <div className="flex items-end gap-2">
                        <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} placeholder="Type a message (Enter to send, Shift+Enter for a new line)" className="flex-1" />
                        <Button onClick={() => send()} loading={sending} disabled={!text.trim()}>
                            <Send className="h-4 w-4" /> Send
                        </Button>
                    </div>
                ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
                        <span>WhatsApp only allows a free-text message within 24 hours of the lead's last reply. Start the conversation with your approved template; once the lead replies you can type messages.</span>
                        <Button size="sm" onClick={() => send(true)} loading={sending} disabled={!meta.template_name}>
                            Send template ({meta.template_name || 'not set'})
                        </Button>
                    </div>
                ))}
        </div>
    );
}

function StatusIcon({ status }: { status: string }) {
    if (status === 'read') {
        return <CheckCheck className="h-3.5 w-3.5 text-sky-500" aria-label="Read" />;
    }
    if (status === 'delivered') {
        return <CheckCheck className="h-3.5 w-3.5" aria-label="Delivered" />;
    }
    if (status === 'sent') {
        return <Check className="h-3.5 w-3.5" aria-label="Sent" />;
    }
    if (status === 'failed') {
        return <AlertCircle className="h-3.5 w-3.5 text-red-500" aria-label="Failed" />;
    }

    return <Clock className="h-3.5 w-3.5" aria-label="Sending" />;
}
