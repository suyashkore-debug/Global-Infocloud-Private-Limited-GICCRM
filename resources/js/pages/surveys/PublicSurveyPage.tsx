import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { api } from '../../lib/api';
import type { SurveyQuestion } from './types';

type PublicSurvey = { subject: string; view_description: string | null; already_participated: boolean; questions: (SurveyQuestion & { id: number })[] };

const inputClass = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

/** Taking part in a survey (public link). */
export default function PublicSurveyPage() {
    const { id, hash } = useParams();
    const [survey, setSurvey] = useState<PublicSurvey | null>(null);
    const [problem, setProblem] = useState<'missing' | 'login' | null>(null);
    const [answers, setAnswers] = useState<Record<number, string | number[]>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [done, setDone] = useState<string | null>(null);
    const [sending, setSending] = useState(false);

    useEffect(() => {
        api.get<{ data: PublicSurvey }>(`/public/surveys/${id}/${hash}`)
            .then((r) => setSurvey(r.data.data))
            .catch((e) => setProblem(e?.response?.status === 401 ? 'login' : 'missing'));
    }, [id, hash]);

    async function submit(e: FormEvent) {
        e.preventDefault();
        setSending(true);
        setErrors({});
        try {
            const res = await api.post<{ message: string; redirect_url: string | null }>(`/public/surveys/${id}/${hash}`, { answers });
            if (res.data.redirect_url) {
                window.location.href = res.data.redirect_url;
                return;
            }
            setDone(res.data.message);
        } catch (err) {
            const data = (err as { response?: { data?: { errors?: Record<string, string[]>; message?: string } } }).response?.data;
            const fieldErrors = Object.fromEntries(Object.entries(data?.errors ?? {}).map(([k, v]) => [k.split('.')[1], v[0]]));
            setErrors(Object.keys(fieldErrors).length ? fieldErrors : { _: data?.message ?? 'Something went wrong, please try again.' });
        } finally {
            setSending(false);
        }
    }

    const toggle = (qid: number, optionId: number) => {
        const current = (answers[qid] as number[] | undefined) ?? [];
        setAnswers({ ...answers, [qid]: current.includes(optionId) ? current.filter((o) => o !== optionId) : [...current, optionId] });
    };

    if (problem === 'login') {
        return (
            <p className="p-8 text-center text-gray-600">
                Please{' '}
                <Link to="/login" className="text-blue-600 hover:underline">
                    log in
                </Link>{' '}
                to take part in this survey.
            </p>
        );
    }
    if (problem) {
        return <p className="p-8 text-center text-gray-500">This survey is not available.</p>;
    }
    if (!survey) {
        return <p className="p-8 text-center text-gray-400">Loading…</p>;
    }

    return (
        <div className="min-h-screen bg-gray-50 px-4 py-8">
            <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <h1 className="text-xl font-semibold text-gray-900">{survey.subject}</h1>
                {survey.view_description && <p className="mt-2 whitespace-pre-wrap text-[14px] text-gray-600">{survey.view_description}</p>}
                <hr className="my-5 border-gray-200" />
                {done ? (
                    <div className="flex items-start gap-3 rounded-md bg-green-50 p-4 text-[14px] text-green-800">
                        <CheckCircle2 className="h-5 w-5 shrink-0" />
                        <p>{done}</p>
                    </div>
                ) : survey.already_participated ? (
                    <p className="text-center text-[14px] text-gray-600">You have already taken part in this survey. Thank you!</p>
                ) : (
                    <form onSubmit={submit} className="space-y-6" noValidate>
                        {survey.questions.map((q, i) => (
                            <div key={q.id}>
                                <p className="mb-2 text-[14px] font-medium text-gray-800">
                                    {i + 1}. {q.question} {q.required && <span className="text-red-500">*</span>}
                                </p>
                                {q.type === 'textarea' && <textarea rows={4} className={inputClass} value={(answers[q.id] as string) ?? ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />}
                                {q.type === 'input' && <input className={inputClass} value={(answers[q.id] as string) ?? ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />}
                                {(q.type === 'radio' || q.type === 'checkbox') && (
                                    <div className="space-y-1.5">
                                        {q.options.map((o) => (
                                            <label key={o.id} className="flex items-center gap-2 text-[14px] text-gray-700">
                                                <input
                                                    type={q.type}
                                                    name={`q${q.id}`}
                                                    checked={q.type === 'radio' ? (answers[q.id] as number[] | undefined)?.[0] === o.id : ((answers[q.id] as number[] | undefined) ?? []).includes(o.id!)}
                                                    onChange={() => (q.type === 'radio' ? setAnswers({ ...answers, [q.id]: [o.id!] }) : toggle(q.id, o.id!))}
                                                />
                                                {o.description}
                                            </label>
                                        ))}
                                    </div>
                                )}
                                {errors[q.id] && <p className="mt-1 text-xs text-red-600">{errors[q.id]}</p>}
                            </div>
                        ))}
                        {errors._ && <p className="text-sm text-red-600">{errors._}</p>}
                        <button type="submit" disabled={sending} className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-light disabled:opacity-60">
                            {sending ? 'Submitting…' : 'Submit'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
