import { useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import { todayIso } from '../../lib/format';
import { CREDIT_NOTE_STATUSES, ESTIMATE_STATUSES, INVOICE_STATUSES, PROPOSAL_STATUSES } from '../../lib/sales';
import { Button, Field, Input, Select } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

const TYPES = {
    invoices: { label: 'Invoices', statuses: INVOICE_STATUSES },
    estimates: { label: 'Estimates', statuses: ESTIMATE_STATUSES },
    proposals: { label: 'Proposals', statuses: PROPOSAL_STATUSES },
    credit_notes: { label: 'Credit Notes', statuses: CREDIT_NOTE_STATUSES },
} as const;

/** Utilities → Bulk PDF Export: a zip of PDFs for a date range. */
export default function BulkPdfPage() {
    const toast = useToast();
    const firstOfMonth = `${todayIso().slice(0, 8)}01`;
    const [form, setForm] = useState<{ type: keyof typeof TYPES; from: string; to: string; status: string }>({ type: 'invoices', from: firstOfMonth, to: todayIso(), status: '' });
    const [busy, setBusy] = useState(false);

    async function exportZip() {
        setBusy(true);
        try {
            const response = await api.post('/bulk-pdf', { ...form, status: form.status ? Number(form.status) : null }, { responseType: 'blob' });
            const url = URL.createObjectURL(response.data as Blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${form.type}-${form.from}-${form.to}.zip`;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (e) {
            const blob = (e as { response?: { data?: Blob } }).response?.data;
            toast(blob instanceof Blob ? JSON.parse(await blob.text()).message ?? errorMessage(e) : errorMessage(e), 'error');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="max-w-2xl space-y-4">
            <h4 className="page-title">Bulk PDF Export</h4>
            <div className="panel_s">
                <div className="panel-body grid gap-4 sm:grid-cols-2">
                    <Field label="Select Type" className="sm:col-span-2">
                        <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as keyof typeof TYPES, status: '' })}>
                            {Object.entries(TYPES).map(([key, t]) => (
                                <option key={key} value={key}>
                                    {t.label}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="From Date">
                        <Input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
                    </Field>
                    <Field label="To Date">
                        <Input type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
                    </Field>
                    <Field label="Status" className="sm:col-span-2">
                        <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                            <option value="">All</option>
                            {TYPES[form.type].statuses.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.name}
                                </option>
                            ))}
                        </Select>
                    </Field>
                </div>
                <div className="flex justify-end rounded-b-lg border-t border-gray-200 bg-gray-50 px-6 py-3">
                    <Button onClick={exportZip} loading={busy}>
                        Export
                    </Button>
                </div>
            </div>
        </div>
    );
}
