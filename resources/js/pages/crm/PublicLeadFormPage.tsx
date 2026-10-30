import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { CheckCircle2 } from 'lucide-react';
import type { FormField } from '../estimate-requests/types';

type PublicForm = { name: string; fields: FormField[]; submit_btn_name: string; submit_btn_bg_color: string; submit_btn_text_color: string };

const inputClass =
    'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none transition placeholder:text-slate-400 focus:border-[#0b2c56]/60 focus:ring-4 focus:ring-[#0b2c56]/10';

/** The public Web to Lead form (no login), e.g. embedded on the company website. */
export default function PublicLeadFormPage() {
    const { key } = useParams();
    const [form, setForm] = useState<PublicForm | null>(null);
    const [missing, setMissing] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [done, setDone] = useState<string | null>(null);
    const [sending, setSending] = useState(false);

    useEffect(() => {
        axios
            .get<{ data: PublicForm }>(`/api/public/lead-forms/${key}`)
            .then((r) => setForm(r.data.data))
            .catch(() => setMissing(true));
    }, [key]);

    async function submit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setSending(true);
        setErrors({});
        try {
            const res = await axios.post<{ message: string; redirect_url: string | null }>(`/api/public/lead-forms/${key}`, new FormData(e.currentTarget), { headers: { Accept: 'application/json' } });
            if (res.data.redirect_url) {
                // Leave the iframe too when the form is embedded.
                (window.top ?? window).location.href = res.data.redirect_url;
                return;
            }
            setDone(res.data.message);
        } catch (err) {
            const data = (err as { response?: { data?: { errors?: Record<string, string[]>; message?: string } } }).response?.data;
            const fieldErrors = Object.fromEntries(Object.entries(data?.errors ?? {}).map(([k, v]) => [k.split('.')[0], v[0]]));
            setErrors(Object.keys(fieldErrors).length ? fieldErrors : { _: data?.message ?? 'Something went wrong, please try again.' });
        } finally {
            setSending(false);
        }
    }

    if (missing) {
        return <p className="p-8 text-center text-slate-500">This form is not available.</p>;
    }
    if (!form) {
        return <p className="p-8 text-center text-slate-400">Loading…</p>;
    }

    return (
        <div className="min-h-screen bg-slate-50 px-4 py-8">
            <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_28px_-14px_rgba(11,44,86,0.25)] sm:p-8">
                <h1 className="mb-5 text-xl font-bold text-slate-900">{form.name}</h1>
                {done ? (
                    <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-4 text-[14px] text-emerald-800">
                        <CheckCircle2 className="h-5 w-5 shrink-0" />
                        <p className="whitespace-pre-wrap">{done}</p>
                    </div>
                ) : (
                    <form onSubmit={submit} className="space-y-4" noValidate>
                        {form.fields.map((f) => (
                            <div key={f.name}>
                                <label className="mb-1.5 block text-[13px] font-semibold text-slate-600">
                                    {f.label} {f.required && <span className="text-red-500">*</span>}
                                </label>
                                <FieldInput field={f} />
                                {errors[f.name] && <p className="mt-1 text-xs text-red-600">{errors[f.name]}</p>}
                            </div>
                        ))}
                        {errors._ && <p className="text-sm text-red-600">{errors._}</p>}
                        <button
                            type="submit"
                            disabled={sending}
                            className="w-full rounded-xl px-4 py-3 text-sm font-semibold shadow-sm transition hover:brightness-110 disabled:opacity-60"
                            style={{ backgroundColor: form.submit_btn_bg_color, color: form.submit_btn_text_color }}
                        >
                            {sending ? 'Sending…' : form.submit_btn_name}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}

function FieldInput({ field: f }: { field: FormField }) {
    switch (f.type) {
        case 'textarea':
            return <textarea name={f.name} rows={4} required={f.required} placeholder={f.placeholder ?? ''} className={inputClass} />;
        case 'select':
            return (
                <select name={f.name} required={f.required} className={inputClass} defaultValue={f.name === 'country' ? 'India' : ''}>
                    <option value="">—</option>
                    {(f.options ?? []).map((o) => (
                        <option key={o}>{o}</option>
                    ))}
                </select>
            );
        case 'radio':
        case 'checkbox':
            return (
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[14px] text-slate-700">
                    {(f.options ?? []).map((o) => (
                        <label key={o} className="flex items-center gap-1.5">
                            <input type={f.type} name={f.type === 'checkbox' ? `${f.name}[]` : f.name} value={o} /> {o}
                        </label>
                    ))}
                </div>
            );
        case 'file':
            return <input type="file" name={`${f.name}[]`} multiple className="block w-full text-sm text-slate-600" />;
        default:
            return <input type={f.type} name={f.name} required={f.required} placeholder={f.placeholder ?? ''} className={inputClass} />;
    }
}
