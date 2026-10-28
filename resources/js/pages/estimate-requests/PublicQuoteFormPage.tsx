import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { CheckCircle2 } from 'lucide-react';
import type { FormField } from './types';

type PublicForm = { name: string; fields: FormField[]; submit_btn_name: string };

const inputClass = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

/** The public estimate request form (no login), e.g. embedded on the company website. */
export default function PublicQuoteFormPage() {
    const { key } = useParams();
    const [form, setForm] = useState<PublicForm | null>(null);
    const [missing, setMissing] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [done, setDone] = useState<string | null>(null);
    const [sending, setSending] = useState(false);

    useEffect(() => {
        axios
            .get<{ data: PublicForm }>(`/api/public/quote-forms/${key}`)
            .then((r) => setForm(r.data.data))
            .catch(() => setMissing(true));
    }, [key]);

    async function submit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setSending(true);
        setErrors({});
        try {
            const res = await axios.post<{ message: string }>(`/api/public/quote-forms/${key}`, new FormData(e.currentTarget), { headers: { Accept: 'application/json' } });
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
        return <p className="p-8 text-center text-gray-500">This form is not available.</p>;
    }
    if (!form) {
        return <p className="p-8 text-center text-gray-400">Loading…</p>;
    }

    return (
        <div className="min-h-screen bg-gray-50 px-4 py-8">
            <div className="mx-auto max-w-xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <h1 className="mb-5 text-xl font-semibold text-gray-900">{form.name}</h1>
                {done ? (
                    <div className="flex items-start gap-3 rounded-md bg-green-50 p-4 text-[14px] text-green-800">
                        <CheckCircle2 className="h-5 w-5 shrink-0" />
                        <p className="whitespace-pre-wrap">{done}</p>
                    </div>
                ) : (
                    <form onSubmit={submit} className="space-y-4" noValidate>
                        {form.fields.map((f) => (
                            <div key={f.name}>
                                <label className="mb-1 block text-[13px] font-medium text-gray-700">
                                    {f.label} {f.required && <span className="text-red-500">*</span>}
                                </label>
                                <FieldInput field={f} />
                                {errors[f.name] && <p className="mt-1 text-xs text-red-600">{errors[f.name]}</p>}
                            </div>
                        ))}
                        {errors._ && <p className="text-sm text-red-600">{errors._}</p>}
                        <button type="submit" disabled={sending} className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-light disabled:opacity-60">
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
                <select name={f.name} required={f.required} className={inputClass} defaultValue="">
                    <option value="">—</option>
                    {(f.options ?? []).map((o) => (
                        <option key={o}>{o}</option>
                    ))}
                </select>
            );
        case 'radio':
        case 'checkbox':
            return (
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[14px] text-gray-700">
                    {(f.options ?? []).map((o) => (
                        <label key={o} className="flex items-center gap-1.5">
                            <input type={f.type} name={f.type === 'checkbox' ? `${f.name}[]` : f.name} value={o} /> {o}
                        </label>
                    ))}
                </div>
            );
        case 'file':
            return <input type="file" name={`${f.name}[]`} multiple className="block w-full text-sm text-gray-600" />;
        default:
            return <input type={f.type} name={f.name} required={f.required} placeholder={f.placeholder ?? ''} className={inputClass} />;
    }
}
