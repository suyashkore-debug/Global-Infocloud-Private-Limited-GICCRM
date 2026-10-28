import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, BarChart3, Copy, Plus, Send, Trash2, X } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useApi } from '../../hooks/useApi';
import { usePermission } from '../../hooks/usePermission';
import { Button, Checkbox, ErrorNote, Field, Input, Select, Spinner, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { QUESTION_TYPES, type QuestionType, type SurveyDetail, type SurveyQuestion } from './types';

type Form = Pick<SurveyDetail, 'subject' | 'ip_restrict' | 'only_for_logged_in' | 'active'> & { description: string; view_description: string; from_name: string; redirect_url: string; questions: SurveyQuestion[] };

const blank: Form = { subject: '', description: '', view_description: '', from_name: '', redirect_url: '', ip_restrict: false, only_for_logged_in: false, active: true, questions: [] };

/** Create / edit a survey: details, the question builder, and (once saved) sending it. */
export default function SurveyFormPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const canEdit = usePermission(id ? 'surveys.edit' : 'surveys.create');
    const canDelete = usePermission('surveys.delete');
    const [survey, setSurvey] = useState<SurveyDetail | null>(null);
    const [form, setForm] = useState<Form>(blank);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!id) {
            return;
        }
        api.get<{ data: SurveyDetail }>(`/surveys/${id}`).then((r) => load(r.data.data)).catch((e) => setError(errorMessage(e)));
    }, [id]);

    function load(s: SurveyDetail) {
        setSurvey(s);
        setForm({
            subject: s.subject,
            description: s.description ?? '',
            view_description: s.view_description ?? '',
            from_name: s.from_name ?? '',
            redirect_url: s.redirect_url ?? '',
            ip_restrict: s.ip_restrict,
            only_for_logged_in: s.only_for_logged_in,
            active: s.active,
            questions: s.questions,
        });
    }

    const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
    const setQuestion = (i: number, patch: Partial<SurveyQuestion>) => set({ questions: form.questions.map((q, qi) => (qi === i ? { ...q, ...patch } : q)) });
    const moveQuestion = (i: number, dir: -1 | 1) => {
        const next = [...form.questions];
        [next[i], next[i + dir]] = [next[i + dir], next[i]];
        set({ questions: next });
    };
    const addQuestion = (type: QuestionType) =>
        set({ questions: [...form.questions, { type, question: '', required: false, options: type === 'checkbox' || type === 'radio' ? [{ description: '' }] : [] }] });

    async function save() {
        setSaving(true);
        setError(null);
        const body = { ...form, redirect_url: form.redirect_url || null, from_name: form.from_name || null };
        try {
            const res = id ? await api.put<{ data: SurveyDetail }>(`/surveys/${id}`, body) : await api.post<{ data: SurveyDetail }>('/surveys', body);
            toast('Survey saved.');
            if (id) {
                load(res.data.data);
            } else {
                navigate(`/utilities/surveys/${res.data.data.id}`, { replace: true });
            }
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setSaving(false);
        }
    }

    async function remove() {
        if (!confirm('Delete this survey and all its results?')) {
            return;
        }
        await api.delete(`/surveys/${id}`);
        navigate('/utilities/surveys');
    }

    if (id && !survey && !error) {
        return <Spinner />;
    }

    return (
        <div className="w-full space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <Link to="/utilities/surveys" className="text-gray-500 hover:text-gray-800">
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <h4 className="page-title mr-auto">{survey ? survey.subject : 'New Survey'}</h4>
                {survey && (
                    <>
                        <Link to={`/utilities/surveys/${survey.id}/results`} className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50">
                            <BarChart3 className="h-4 w-4" /> Results ({survey.participants})
                        </Link>
                        <a href={survey.path} target="_blank" rel="noreferrer" className="rounded-md border border-gray-300 bg-white px-3 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50">
                            Preview
                        </a>
                        {canDelete && (
                            <Button variant="danger" onClick={remove} title="Delete">
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        )}
                    </>
                )}
            </div>
            <ErrorNote message={error} />

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-4">
                    <div className="panel_s">
                        <div className="panel-body space-y-3">
                            <Field label="Subject" required>
                                <Input value={form.subject} onChange={(e) => set({ subject: e.target.value })} />
                            </Field>
                            <Field label="Survey short description (shown to participants)">
                                <Textarea rows={3} value={form.view_description} onChange={(e) => set({ view_description: e.target.value })} />
                            </Field>
                            <Field label="Survey description (e-mail text)">
                                <Textarea rows={4} value={form.description} onChange={(e) => set({ description: e.target.value })} />
                            </Field>
                        </div>
                    </div>

                    <div className="panel_s">
                        <div className="panel-body space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h5 className="text-[15px] font-semibold">Questions</h5>
                                <div className="flex flex-wrap gap-1.5">
                                    {QUESTION_TYPES.map((t) => (
                                        <Button key={t.id} size="sm" variant="secondary" onClick={() => addQuestion(t.id)} disabled={!canEdit}>
                                            <Plus className="h-3.5 w-3.5" /> {t.label}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                            {form.questions.length === 0 && <p className="py-4 text-center text-[13px] text-gray-500">Add a question with the buttons above.</p>}
                            {form.questions.map((q, i) => (
                                <div key={q.id ?? `new-${i}`} className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3">
                                    <div className="flex items-start gap-2">
                                        <span className="mt-2 text-xs font-semibold text-gray-500">{i + 1}.</span>
                                        <Input value={q.question} placeholder="Question" onChange={(e) => setQuestion(i, { question: e.target.value })} />
                                        <Select value={q.type} disabled={!!q.id} onChange={(e) => setQuestion(i, { type: e.target.value as QuestionType })} className="w-40">
                                            {QUESTION_TYPES.map((t) => (
                                                <option key={t.id} value={t.id}>
                                                    {t.label}
                                                </option>
                                            ))}
                                        </Select>
                                    </div>
                                    {(q.type === 'checkbox' || q.type === 'radio') && (
                                        <div className="space-y-1.5 pl-5">
                                            {q.options.map((o, oi) => (
                                                <div key={o.id ?? `o-${oi}`} className="flex items-center gap-2">
                                                    <input type={q.type} disabled />
                                                    <Input
                                                        value={o.description}
                                                        placeholder={`Option ${oi + 1}`}
                                                        onChange={(e) => setQuestion(i, { options: q.options.map((x, xi) => (xi === oi ? { ...x, description: e.target.value } : x)) })}
                                                    />
                                                    <button type="button" onClick={() => setQuestion(i, { options: q.options.filter((_, xi) => xi !== oi) })} className="p-1 text-gray-400 hover:text-red-600" title="Remove option">
                                                        <X className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            ))}
                                            <button type="button" onClick={() => setQuestion(i, { options: [...q.options, { description: '' }] })} className="text-xs font-medium text-blue-600 hover:underline">
                                                + Add option
                                            </button>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2 pl-5">
                                        <Checkbox label="Required" checked={q.required} onChange={(v) => setQuestion(i, { required: v })} />
                                        <div className="ml-auto flex gap-1">
                                            <button type="button" disabled={i === 0} onClick={() => moveQuestion(i, -1)} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" title="Up">
                                                <ArrowUp className="h-4 w-4" />
                                            </button>
                                            <button type="button" disabled={i === form.questions.length - 1} onClick={() => moveQuestion(i, 1)} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" title="Down">
                                                <ArrowDown className="h-4 w-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => confirm('Remove this question (and its answers)?') && set({ questions: form.questions.filter((_, qi) => qi !== i) })}
                                                className="p-1 text-gray-400 hover:text-red-600"
                                                title="Remove question"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="panel_s">
                        <div className="panel-body space-y-3">
                            <Field label="From name (e-mails)">
                                <Input value={form.from_name} onChange={(e) => set({ from_name: e.target.value })} />
                            </Field>
                            <Field label="Redirect URL" hint="Where participants go after submitting (optional).">
                                <Input value={form.redirect_url} placeholder="https://" onChange={(e) => set({ redirect_url: e.target.value })} />
                            </Field>
                            <div><Checkbox label="Disabled" checked={!form.active} onChange={(v) => set({ active: !v })} /></div>
                            <div><Checkbox label="Only for logged in participants" checked={form.only_for_logged_in} onChange={(v) => set({ only_for_logged_in: v })} /></div>
                            <div><Checkbox label="Restrict 1 vote per IP" checked={form.ip_restrict} onChange={(v) => set({ ip_restrict: v })} /></div>
                            {canEdit && (
                                <Button className="w-full" onClick={save} loading={saving} disabled={!form.subject.trim()}>
                                    Save
                                </Button>
                            )}
                            {survey && (
                                <div className="rounded-md bg-gray-50 p-2 text-xs text-gray-600">
                                    <p className="mb-1 font-medium">Survey link</p>
                                    <div className="flex items-center gap-2">
                                        <span className="min-w-0 flex-1 truncate">{survey.url}</span>
                                        <button type="button" onClick={() => navigator.clipboard.writeText(survey.url).then(() => toast('Survey link copied.'))} title="Copy">
                                            <Copy className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    {survey && canEdit && <SendPanel survey={survey} onSent={load} />}
                </div>
            </div>
        </div>
    );
}

/** Perfex "Send survey to": staff, customers (all or groups), leads (all or statuses), mail lists. */
function SendPanel({ survey, onSent }: { survey: SurveyDetail; onSent: (s: SurveyDetail) => void }) {
    const toast = useToast();
    const groups = useApi<{ data: { id: number; name: string }[] }>('/setup/customer-groups');
    const statuses = useApi<{ data: { id: number; name: string }[] }>('/setup/lead-statuses');
    const lists = useApi<{ data: { id: number; name: string; emails_count: number }[] }>('/mail-lists');
    const [to, setTo] = useState({ staff: false, customers: false, customer_group_ids: [] as number[], leads: false, lead_status_ids: [] as number[], mail_list_ids: [] as number[] });
    const [sending, setSending] = useState(false);
    const toggle = (key: 'customer_group_ids' | 'lead_status_ids' | 'mail_list_ids', id: number) =>
        setTo((t) => ({ ...t, [key]: t[key].includes(id) ? t[key].filter((x) => x !== id) : [...t[key], id] }));

    async function send() {
        setSending(true);
        try {
            const res = await api.post<{ message: string; data: SurveyDetail }>(`/surveys/${survey.id}/send`, to);
            toast(res.data.message);
            onSent(res.data.data);
        } catch (e) {
            toast(errorMessage(e), 'error');
        } finally {
            setSending(false);
        }
    }

    async function removeLog(logId: number) {
        await api.delete(`/surveys/${survey.id}/send-logs/${logId}`);
        const r = await api.get<{ data: SurveyDetail }>(`/surveys/${survey.id}`);
        onSent(r.data.data);
    }

    const chips = (items: { id: number; name: string }[] | undefined, key: 'customer_group_ids' | 'lead_status_ids' | 'mail_list_ids') => (
        <div className="flex flex-wrap gap-1.5 pl-6">
            {(items ?? []).map((i) => (
                <label key={i.id} className={`cursor-pointer rounded-full border px-2 py-0.5 text-xs ${to[key].includes(i.id) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600'}`}>
                    <input type="checkbox" className="hidden" checked={to[key].includes(i.id)} onChange={() => toggle(key, i.id)} />
                    {i.name}
                </label>
            ))}
        </div>
    );

    return (
        <div className="panel_s">
            <div className="panel-body space-y-3 text-[13px]">
                <h5 className="text-[15px] font-semibold">Send Survey</h5>
                <div><Checkbox label="Staff" checked={to.staff} onChange={(v) => setTo({ ...to, staff: v })} /></div>
                <div><Checkbox label="Customers (contacts)" checked={to.customers} onChange={(v) => setTo({ ...to, customers: v })} /></div>
                {to.customers && (
                    <>
                        <p className="pl-6 text-xs text-gray-500">All customers, or only these groups:</p>
                        {chips(groups.data?.data, 'customer_group_ids')}
                    </>
                )}
                <div><Checkbox label="Leads" checked={to.leads} onChange={(v) => setTo({ ...to, leads: v })} /></div>
                {to.leads && (
                    <>
                        <p className="pl-6 text-xs text-gray-500">All leads, or only these statuses:</p>
                        {chips(statuses.data?.data, 'lead_status_ids')}
                    </>
                )}
                {(lists.data?.data.length ?? 0) > 0 && (
                    <>
                        <p className="font-medium text-gray-700">Mail lists</p>
                        {chips(lists.data?.data.map((l) => ({ id: l.id, name: `${l.name} (${l.emails_count})` })), 'mail_list_ids')}
                    </>
                )}
                <Button className="w-full" onClick={send} loading={sending} disabled={!to.staff && !to.customers && !to.leads && to.mail_list_ids.length === 0}>
                    <Send className="h-4 w-4" /> Send
                </Button>
                {survey.send_logs.length > 0 && (
                    <div className="space-y-1.5 border-t border-gray-100 pt-3">
                        <p className="font-medium text-gray-700">Sent</p>
                        {survey.send_logs.map((l) => (
                            <div key={l.id} className="flex items-start gap-2 text-xs text-gray-600">
                                <span className="flex-1">
                                    {formatDateTime(l.created_at)} · {l.lists.join(', ')} · {l.sent}/{l.total} {l.finished ? 'sent' : 'sending…'}
                                </span>
                                <button type="button" onClick={() => removeLog(l.id)} className="text-gray-400 hover:text-red-600" title="Remove">
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
