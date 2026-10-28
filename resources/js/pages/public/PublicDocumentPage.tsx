import { useCallback, useEffect, useState } from 'react';
import { RichContent } from '../../components/editor/RichTextEditor';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Download, XCircle } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { formatDate, formatDateTime } from '../../lib/format';
import { money } from '../../lib/sales';
import DocumentPreview, { AddressLines } from '../../components/sales/DocumentPreview';
import type { Address, SalesDocumentBase } from '../../types';

type DocType = 'invoice' | 'estimate' | 'proposal' | 'contract';
type PublicDoc = SalesDocumentBase & Record<string, unknown> & { billing?: Address; shipping?: Address };
type Reply = {
    data: {
        type: DocType;
        document: PublicDoc;
        company: Record<string, string>;
        actions: { respond: boolean; sign: boolean };
    };
};

const TITLES: Record<DocType, string> = { invoice: 'Invoice', estimate: 'Estimate', proposal: 'Proposal', contract: 'Contract' };
const STATUS: Record<DocType, Record<number, string>> = {
    invoice: { 1: 'Unpaid', 2: 'Paid', 3: 'Partially Paid', 4: 'Overdue', 5: 'Cancelled' },
    estimate: { 1: 'Draft', 2: 'Sent', 3: 'Declined', 4: 'Accepted', 5: 'Expired' },
    proposal: { 1: 'Open', 2: 'Declined', 3: 'Accepted', 4: 'Sent', 5: 'Revised', 6: 'Draft' },
    contract: {},
};

/** What a customer sees from an e-mail link: the document, its PDF, and accept / decline / sign. */
export default function PublicDocumentPage({ type }: { type: DocType }) {
    const { id, hash } = useParams();
    const [reply, setReply] = useState<Reply['data'] | null>(null);
    const [missing, setMissing] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [signer, setSigner] = useState('');
    const base = `/public/documents/${type}/${id}/${hash}`;

    const load = useCallback(() => {
        api.get<Reply>(base)
            .then((r) => setReply(r.data.data))
            .catch(() => setMissing(true));
    }, [base]);

    useEffect(load, [load]);

    async function respond(action: 'accept' | 'decline' | 'sign') {
        if (action === 'decline' && !confirm('Decline this document?')) {
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const res = await api.post<{ message: string }>(`${base}/respond`, { action, signer_name: action === 'sign' ? signer : undefined });
            setMessage(res.data.message);
            load();
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setBusy(false);
        }
    }

    async function pdf() {
        const response = await api.get(`${base}/pdf`, { responseType: 'blob' });
        const url = URL.createObjectURL(new Blob([response.data as BlobPart], { type: 'application/pdf' }));
        window.open(url, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }

    if (missing) {
        return <p className="p-8 text-center text-gray-500">This document is not available.</p>;
    }
    if (!reply) {
        return <p className="p-8 text-center text-gray-400">Loading…</p>;
    }
    const doc = reply.document;
    const company = reply.company;
    const cur = doc.currency ?? null;
    const statusLabel = STATUS[type][doc.status as number];

    return (
        <div className="min-h-screen bg-gray-50 px-4 py-8">
            <div className="mx-auto max-w-5xl space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-lg font-semibold text-gray-900">{company.company_name}</p>
                        <p className="whitespace-pre-wrap text-[13px] text-gray-500">
                            {[company.company_address, [company.company_city, company.company_state].filter(Boolean).join(', '), [company.company_country, company.company_zip].filter(Boolean).join(' ')].filter(Boolean).join('\n')}
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-2xl font-bold text-gray-900">{TITLES[type]}</p>
                        <p className="font-medium text-gray-700">{type === 'contract' ? (doc.subject as string) : doc.formatted_number}</p>
                        {statusLabel && <p className="text-xs font-semibold uppercase text-gray-500">{statusLabel}</p>}
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={pdf} className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50">
                        <Download className="h-4 w-4" /> Download PDF
                    </button>
                    {reply.actions.respond && (
                        <>
                            <button type="button" disabled={busy} onClick={() => respond('accept')} className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-2 text-[13px] font-semibold text-white hover:bg-green-700 disabled:opacity-60">
                                <CheckCircle2 className="h-4 w-4" /> Accept
                            </button>
                            <button type="button" disabled={busy} onClick={() => respond('decline')} className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-2 text-[13px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-60">
                                <XCircle className="h-4 w-4" /> Decline
                            </button>
                        </>
                    )}
                </div>
                {message && <p className="rounded-md bg-green-50 p-3 text-[14px] text-green-800">{message}</p>}
                {error && <p className="rounded-md bg-red-50 p-3 text-[14px] text-red-700">{error}</p>}

                {type === 'contract' ? (
                    <div className="panel_s">
                        <div className="panel-body space-y-4 text-[14px]">
                            <div className="grid gap-2 text-[13px] sm:grid-cols-3">
                                <p>
                                    <span className="text-gray-500">Customer:</span> {(doc.customer as { name?: string } | null)?.name}
                                </p>
                                <p>
                                    <span className="text-gray-500">Start Date:</span> {formatDate(doc.start_date as string)}
                                </p>
                                {doc.end_date ? (
                                    <p>
                                        <span className="text-gray-500">End Date:</span> {formatDate(doc.end_date as string)}
                                    </p>
                                ) : null}
                            </div>
                            <RichContent html={doc.content_html as string} className="rounded-md border border-gray-200 bg-white p-5" />
                            {doc.signed ? (
                                <p className="font-medium text-green-700">
                                    Signed{doc.signer_name ? ` by ${doc.signer_name as string}` : ''}
                                    {doc.signed_at ? ` on ${formatDateTime(doc.signed_at as string)}` : ''}
                                </p>
                            ) : reply.actions.sign ? (
                                <div className="flex flex-wrap items-end gap-2 border-t border-gray-100 pt-4">
                                    <label className="text-[13px]">
                                        <span className="mb-1 block font-medium text-gray-700">Your full name</span>
                                        <input value={signer} onChange={(e) => setSigner(e.target.value)} className="w-64 rounded-md border border-gray-300 px-3 py-2 text-sm" />
                                    </label>
                                    <button type="button" disabled={busy || !signer.trim()} onClick={() => respond('sign')} className="rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:bg-brand-light disabled:opacity-60">
                                        Sign
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    </div>
                ) : (
                    <>
                        {type === 'proposal' && typeof doc.content_html === 'string' && doc.content_html && (
                            <div className="panel_s">
                                <RichContent html={doc.content_html} className="panel-body" />
                            </div>
                        )}
                        <DocumentPreview
                            document={doc}
                            to={
                                <div className="text-[13.5px]">
                                    <p className="font-semibold text-gray-800">{type === 'proposal' ? 'To:' : 'Bill To:'}</p>
                                    <p className="font-semibold">{type === 'proposal' ? (doc.proposal_to as string) : doc.customer?.name}</p>
                                    {doc.billing && <AddressLines address={doc.billing} />}
                                    {doc.customer?.vat && <p>GSTIN: {doc.customer.vat}</p>}
                                </div>
                            }
                            info={[
                                [`${TITLES[type]} Date`, formatDate(doc.date)],
                                ['Due Date', doc.due_date ? formatDate(doc.due_date as string) : null],
                                ['Expiry Date', doc.expiry_date ? formatDate(doc.expiry_date as string) : null],
                                ['Open Till', doc.open_till ? formatDate(doc.open_till as string) : null],
                            ]}
                            extraTotals={
                                type === 'invoice'
                                    ? [
                                          ['Total Paid', money(doc.amount_paid as string, cur)],
                                          ['Amount Due', money(doc.amount_due as string, cur), true],
                                      ]
                                    : undefined
                            }
                        />
                    </>
                )}
            </div>
        </div>
    );
}
