import { CheckCircle2, Mail, XCircle } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { formatDateTime } from '../../lib/format';
import { EmptyState, Spinner } from '../../components/ui';

type LeadEmail = { id: number; subject: string; to: string; template: string | null; status: string; error: string | null; sent_by: string | null; created_at: string };

/** Perfex lead "Email activity": the e-mails the CRM sent to this lead, newest first. */
export default function LeadEmails({ leadId }: { leadId: number }) {
    const { data, loading } = useApi<{ data: LeadEmail[] }>(`/leads/${leadId}/emails`);

    if (loading && !data) {
        return <Spinner />;
    }
    if (!data?.data.length) {
        return <EmptyState icon={Mail} title="No e-mails yet" text="E-mails the CRM sends to this lead (web form replies, proposals, notifications) show here." />;
    }

    return (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {data.data.map((m) => {
                const sent = m.status === 'sent';
                return (
                    <li key={m.id} className="flex items-start gap-3 px-4 py-3">
                        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${sent ? 'bg-emerald-50 text-emerald-600' : m.status === 'failed' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                            {sent ? <CheckCircle2 className="h-4 w-4" /> : m.status === 'failed' ? <XCircle className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[13.5px] font-semibold text-slate-800">{m.subject || '(no subject)'}</p>
                            <p className="text-[12px] text-slate-500">
                                To {m.to}
                                {m.sent_by ? ` · by ${m.sent_by}` : ''} · {formatDateTime(m.created_at)}
                            </p>
                            {m.error && <p className="mt-1 text-[12px] text-red-600">{m.error}</p>}
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold capitalize ${sent ? 'bg-emerald-50 text-emerald-700' : m.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                            {m.status}
                        </span>
                    </li>
                );
            })}
        </ul>
    );
}
