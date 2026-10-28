import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { Button, ErrorNote, Field, Input, Select, Spinner } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

type ExportType = { type: string; name: string; date_label: string };

const PERIODS = [
    ['all_time', 'All time'],
    ['this_month', 'This month'],
    ['last_month', 'Last month'],
    ['this_year', 'This year'],
    ['last_year', 'Last year'],
    ['last_3_months', 'Last 3 months'],
    ['last_6_months', 'Last 6 months'],
    ['last_12_months', 'Last 12 months'],
    ['custom', 'Period (from – to)'],
] as const;

/**
 * Utilities → CSV Export (GICHRMS "CSV Export Manager"): pick a list and a period, download it
 * as a CSV file (opens in Excel, Marathi / Hindi included, with custom fields).
 */
export default function CsvExportPage() {
    const toast = useToast();
    const [types, setTypes] = useState<ExportType[] | null>(null);
    const [type, setType] = useState('');
    const [period, setPeriod] = useState('all_time');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        api.get<{ data: ExportType[] }>('/exports').then((r) => (setTypes(r.data.data), setType(r.data.data[0]?.type ?? '')));
    }, []);

    async function download() {
        setBusy(true);
        setError(null);
        try {
            const r = await api.get(`/exports/${type}`, { params: { period, ...(period === 'custom' ? { from, to } : {}) }, responseType: 'blob' });
            const name = /filename="?([^";]+)"?/.exec(String(r.headers['content-disposition'] ?? ''))?.[1] ?? `${type}.csv`;
            const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(r.data as Blob), download: name });
            link.click();
            URL.revokeObjectURL(link.href);
            toast(`${name} downloaded.`);
        } catch (e) {
            // A failed blob request carries its JSON error as a Blob.
            const data = (e as { response?: { data?: Blob } }).response?.data;
            setError(data instanceof Blob ? (JSON.parse(await data.text()).message ?? errorMessage(e)) : errorMessage(e));
        } finally {
            setBusy(false);
        }
    }

    const selected = types?.find((t) => t.type === type);

    return (
        <div className="max-w-3xl space-y-4">
            <h4 className="page-title">CSV Export</h4>
            <div className="panel_s">
                <div className="panel-body space-y-4">
                    {!types ? (
                        <Spinner />
                    ) : (
                        <>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label="Export">
                                    <Select value={type} onChange={(e) => setType(e.target.value)}>
                                        {types.map((t) => (
                                            <option key={t.type} value={t.type}>
                                                {t.name}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>
                                <Field label={`Period${selected ? ` (by ${selected.date_label.toLowerCase()})` : ''}`}>
                                    <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
                                        {PERIODS.map(([value, label]) => (
                                            <option key={value} value={value}>
                                                {label}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>
                                {period === 'custom' && (
                                    <>
                                        <Field label="From" required>
                                            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                                        </Field>
                                        <Field label="To" required>
                                            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                                        </Field>
                                    </>
                                )}
                            </div>
                            <ErrorNote message={error} />
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-xs text-gray-500">Only the records you may see are exported, with their custom fields. Opens in Excel.</p>
                                <Button onClick={download} loading={busy} disabled={!type || (period === 'custom' && (!from || !to))}>
                                    <Download className="h-4 w-4" /> Export
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
