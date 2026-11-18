import { useEffect, useRef, useState } from 'react';
import { Bell, Check, Mail, MessageCircle, Send } from 'lucide-react';
import { api, errorMessage, fieldErrors } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { Button, Field, Input, inputClass, Spinner } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import RichTextEditor, { type RichTextEditorHandle } from '../../components/editor/RichTextEditor';

type Status = {
    id: number;
    name: string;
    color: string;
    notify_lead: boolean;
    is_default: boolean;
    pipeline_name?: string | null;
};
type Settings = {
    lead_status_notify_staff: boolean;
    lead_status_email_lead: boolean;
    lead_status_whatsapp_lead: boolean;
    whatsapp_message: string;
    email_subject: string;
    email_message: string;
    statuses: Status[];
    sample: {
        companyname: string;
        email_signature: string;
        lead_assigned: string;
    };
};

/** The fields a draft can use, as buttons that add them where the cursor is. */
const FIELDS: { key: string; label: string; emailOnly?: boolean }[] = [
    { key: 'lead_name', label: 'Lead name' },
    { key: 'lead_status', label: 'New status' },
    { key: 'lead_company', label: 'Lead company' },
    { key: 'lead_assigned', label: 'Assigned staff' },
    { key: 'companyname', label: 'Your company' },
    { key: 'email_signature', label: 'E-mail signature', emailOnly: true },
];

function fill(text: string, values: Record<string, string>): string {
    return text.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** WhatsApp formatting for the preview: *bold*, _italic_, ~strike~, line breaks. */
function whatsappHtml(text: string): string {
    return escape(text)
        .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
        .replace(/_([^_\n]+)_/g, '<em>$1</em>')
        .replace(/~([^~\n]+)~/g, '<s>$1</s>')
        .replace(/\n/g, '<br>');
}

/** Admin-written HTML shown without scripts or event handlers. */
function sanitize(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script, iframe, object, embed, style, link, meta').forEach((n) => n.remove());
    doc.querySelectorAll('*').forEach((el) => {
        for (const attr of Array.from(el.attributes)) {
            if (attr.name.startsWith('on') || /^\s*javascript:/i.test(attr.value)) {
                el.removeAttribute(attr.name);
            }
        }
    });

    return doc.body.innerHTML;
}

function FieldButtons({ email, onPick }: { email?: boolean; onPick: (key: string) => void }) {
    return (
        <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11.5px] font-medium text-slate-500">Add:</span>
            {FIELDS.filter((f) => email || !f.emailOnly).map((f) => (
                <button
                    key={f.key}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onPick(f.key)}
                    title={`{${f.key}}`}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11.5px] font-semibold text-slate-600 transition hover:border-brand hover:bg-brand-50 hover:text-brand"
                >
                    + {f.label}
                </button>
            ))}
        </div>
    );
}

/**
 * Setup → Leads: the e-mail and WhatsApp message a lead gets when its status changes — on / off,
 * the statuses that send them, and both drafts with a preview, all saved together.
 */
export default function LeadStatusMessages() {
    const toast = useToast();
    const { data } = useApi<{ data: Settings }>('/settings/lead-status-messages');
    const [form, setForm] = useState<Settings | null>(null);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const editor = useRef<RichTextEditorHandle>(null);
    const textarea = useRef<HTMLTextAreaElement>(null);
    // Until the box has been clicked into, a field goes at the end of the message.
    const waTouched = useRef(false);

    useEffect(() => {
        if (data) {
            setForm(data.data);
        }
    }, [data]);

    if (!form) {
        return <Spinner />;
    }

    const set = (patch: Partial<Settings>) => setForm({ ...form, ...patch });
    const ticked = form.statuses.filter((s) => s.notify_lead);
    const manyPipelines = new Set(form.statuses.map((s) => s.pipeline_name)).size > 1;
    const sample: Record<string, string> = {
        lead_name: 'Ravi Patil',
        lead_status: ticked[0]?.name ?? form.statuses[0]?.name ?? 'Proposal Sent',
        lead_company: 'Patil Traders',
        lead_email: 'ravi@example.com',
        lead_phonenumber: '98765 43210',
        lead_position: 'Owner',
        lead_link: '#',
        lead_assigned: form.sample.lead_assigned,
        companyname: form.sample.companyname,
        // As the e-mail has it: a typed (not HTML) signature keeps its lines.
        email_signature: /<[a-z][^>]*>/i.test(form.sample.email_signature) ? form.sample.email_signature : escape(form.sample.email_signature).replace(/\n/g, '<br>'),
    };

    function addToWhatsApp(key: string) {
        const box = textarea.current;
        const token = `{${key}}`;
        const at = box && waTouched.current ? box.selectionStart : form!.whatsapp_message.length;
        const end = box && waTouched.current ? box.selectionEnd : at;
        set({
            whatsapp_message: form!.whatsapp_message.slice(0, at) + token + form!.whatsapp_message.slice(end),
        });
        waTouched.current = true;
        requestAnimationFrame(() => {
            box?.focus();
            box?.setSelectionRange(at + token.length, at + token.length);
        });
    }

    async function save() {
        setSaving(true);
        setErrors({});
        try {
            const res = await api.put<{ data: Settings }>('/settings/lead-status-messages', {
                lead_status_notify_staff: form!.lead_status_notify_staff,
                lead_status_email_lead: form!.lead_status_email_lead,
                lead_status_whatsapp_lead: form!.lead_status_whatsapp_lead,
                whatsapp_message: form!.whatsapp_message,
                email_subject: form!.email_subject,
                email_message: form!.email_message,
                notify_status_ids: ticked.map((s) => s.id),
            });
            setForm(res.data.data);
            toast('Messages saved.');
        } catch (e) {
            setErrors(fieldErrors(e));
            toast(errorMessage(e), 'error');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="panel_s !mb-0 overflow-hidden">
            <div className="panel-body space-y-6">
                <div>
                    <h5 className="flex items-center gap-2 text-[15px] font-semibold text-gray-800">
                        <Send className="h-4 w-4 text-accent" /> Messages to the lead on status change
                    </h5>
                    <p className="mt-1 text-[12.5px] text-slate-500">
                        When a lead moves to another status (edit, kanban or bulk action), the lead gets this e-mail and WhatsApp message 2 minutes later — moved back in the meantime (a wrong drop), nothing is sent. Change the drafts here and press Save.
                    </p>
                </div>

                {/* On / off */}
                <div className="grid gap-3 sm:grid-cols-3">
                    {(
                        [
                            ['lead_status_email_lead', Mail, 'E-mail the lead', 'Only to leads with an e-mail address.'],
                            ['lead_status_whatsapp_lead', MessageCircle, 'WhatsApp the lead', 'Needs Setup → WhatsApp.'],
                            ['lead_status_notify_staff', Bell, 'Notify the staff', 'A bell notification to the assigned staff member and the one who added the lead.'],
                        ] as const
                    ).map(([key, Icon, label, hint]) => (
                        <label
                            key={key}
                            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${form[key] ? 'border-brand/40 bg-brand-50/60' : 'border-slate-200 bg-white'}`}
                        >
                            <input
                                type="checkbox"
                                className="mt-1 h-4 w-4 accent-[var(--color-brand)]"
                                checked={form[key]}
                                onChange={(e) =>
                                    set({
                                        [key]: e.target.checked,
                                    } as Partial<Settings>)
                                }
                            />
                            <span className="min-w-0">
                                <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-slate-800">
                                    <Icon className="h-4 w-4 text-brand" /> {label}
                                </span>
                                <span className="mt-0.5 block text-[11.5px] text-slate-500">{hint}</span>
                            </span>
                        </label>
                    ))}
                </div>

                {/* Which statuses */}
                <div>
                    <p className="mb-2 text-[13px] font-semibold text-slate-700">Send to the lead when it moves to:</p>
                    <div className="flex flex-wrap gap-2">
                        {form.statuses.map((s) => (
                            <button
                                key={s.id}
                                type="button"
                                onClick={() =>
                                    set({
                                        statuses: form.statuses.map((x) =>
                                            x.id === s.id
                                                ? {
                                                      ...x,
                                                      notify_lead: !x.notify_lead,
                                                  }
                                                : x,
                                        ),
                                    })
                                }
                                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-semibold transition ${s.notify_lead ? 'border-brand bg-brand text-white' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}
                            >
                                {s.notify_lead ? <Check className="h-3.5 w-3.5" /> : <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />}
                                {manyPipelines && s.pipeline_name ? <span className="font-normal opacity-75">{s.pipeline_name} ·</span> : null}
                                {s.name}
                            </button>
                        ))}
                    </div>
                    {ticked.length === 0 && <p className="mt-1.5 text-[12px] font-medium text-amber-600">No status ticked: the lead gets no message.</p>}
                </div>

                <div className="grid gap-6 xl:grid-cols-2">
                    {/* E-mail */}
                    <div className={`space-y-3 ${form.lead_status_email_lead ? '' : 'opacity-60'}`}>
                        <p className="flex items-center gap-2 text-[14px] font-semibold text-slate-800">
                            <Mail className="h-4 w-4 text-brand" /> E-mail draft
                        </p>
                        <Field label="Subject" required error={errors.email_subject}>
                            <Input value={form.email_subject} onChange={(e) => set({ email_subject: e.target.value })} />
                        </Field>
                        <Field label="Message" required error={errors.email_message}>
                            <RichTextEditor ref={editor} value={form.email_message} onChange={(html) => set({ email_message: html })} minHeight={200} />
                        </Field>
                        <FieldButtons email onPick={(k) => editor.current?.insertHtml(`{${k}}`)} />
                        <div>
                            <p className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">Preview</p>
                            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                                <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-[12.5px]">
                                    <span className="text-slate-500">Subject: </span>
                                    <span className="font-semibold text-slate-800">{fill(form.email_subject, sample)}</span>
                                </div>
                                <div
                                    className="max-h-72 overflow-y-auto px-3 py-2 text-[13px] text-slate-700 [&_p]:mb-2"
                                    dangerouslySetInnerHTML={{
                                        __html: sanitize(fill(form.email_message, sample)),
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* WhatsApp */}
                    <div className={`space-y-3 ${form.lead_status_whatsapp_lead ? '' : 'opacity-60'}`}>
                        <p className="flex items-center gap-2 text-[14px] font-semibold text-slate-800">
                            <MessageCircle className="h-4 w-4 text-emerald-600" /> WhatsApp draft
                        </p>
                        <Field label="Message" required error={errors.whatsapp_message} hint="*bold*, _italic_ work on WhatsApp.">
                            <textarea ref={textarea} onFocus={() => (waTouched.current = true)} rows={9} value={form.whatsapp_message} onChange={(e) => set({ whatsapp_message: e.target.value })} className={inputClass} />
                        </Field>
                        <FieldButtons onPick={addToWhatsApp} />
                        <div>
                            <p className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">Preview</p>
                            <div className="rounded-xl p-4" style={{ background: '#efeae2' }}>
                                <div className="ml-auto max-w-[85%] rounded-xl rounded-tr-sm px-3 py-2 text-[13px] leading-relaxed text-slate-800 shadow-sm" style={{ background: '#d9fdd3' }}>
                                    <span
                                        dangerouslySetInnerHTML={{
                                            __html: whatsappHtml(fill(form.whatsapp_message, sample)),
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
                            WhatsApp delivers this text only if the lead messaged you in the last 24 hours. For the others, the approved “Status Update Template” in Setup → WhatsApp is sent instead.
                        </p>
                    </div>
                </div>
            </div>
            <div className="flex justify-end border-t border-slate-200/80 bg-slate-50/80 px-6 py-3">
                <Button onClick={save} loading={saving}>
                    Save messages
                </Button>
            </div>
        </div>
    );
}
