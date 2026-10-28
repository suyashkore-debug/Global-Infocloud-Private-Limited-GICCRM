import { useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { usePermission } from '../../hooks/usePermission';
import { toIsoDate } from '../../lib/format';
import { Input, Select } from '../../components/ui';

export type Period = { from: string; to: string };

const PRESETS = ['this_month', 'last_month', 'this_year', 'last_year', 'last_3_months', 'last_6_months', 'last_12_months', 'custom'] as const;
type Preset = (typeof PRESETS)[number];
const PRESET_LABELS: Record<Preset, string> = {
    this_month: 'This Month',
    last_month: 'Last Month',
    this_year: 'This Year',
    last_year: 'Last Year',
    last_3_months: 'Last 3 Months',
    last_6_months: 'Last 6 Months',
    last_12_months: 'Last 12 Months',
    custom: 'Period',
};

function presetRange(preset: Preset): Period {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const range = (from: Date, to: Date) => ({ from: toIsoDate(from), to: toIsoDate(to) });
    switch (preset) {
        case 'last_month':
            return range(new Date(y, m - 1, 1), new Date(y, m, 0));
        case 'this_year':
            return range(new Date(y, 0, 1), new Date(y, 11, 31));
        case 'last_year':
            return range(new Date(y - 1, 0, 1), new Date(y - 1, 11, 31));
        case 'last_3_months':
        case 'last_6_months':
        case 'last_12_months':
            return range(new Date(y, m - Number(preset.split('_')[1]) + 1, 1), new Date(y, m + 1, 0));
        default:
            return range(new Date(y, m, 1), new Date(y, m + 1, 0));
    }
}

/** Perfex report period picker: presets plus a custom from / to range. */
export function usePeriod(initial: Preset = 'this_month') {
    const [preset, setPreset] = useState<Preset>(initial);
    const [custom, setCustom] = useState<Period>(presetRange(initial));
    const period = preset === 'custom' ? custom : presetRange(preset);

    const picker = (
        <div className="flex flex-wrap items-center gap-2">
            <Select value={preset} onChange={(e) => setPreset(e.target.value as Preset)} className="w-auto">
                {PRESETS.map((p) => (
                    <option key={p} value={p}>
                        {PRESET_LABELS[p]}
                    </option>
                ))}
            </Select>
            {preset === 'custom' && (
                <>
                    <Input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="w-auto" />
                    <Input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="w-auto" />
                </>
            )}
        </div>
    );

    return { period, picker };
}

export function useYear() {
    const current = new Date().getFullYear();
    const [year, setYear] = useState(current);
    const picker = (
        <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-auto">
            {Array.from({ length: 8 }, (_, i) => current - i).map((y) => (
                <option key={y} value={y}>
                    {y}
                </option>
            ))}
        </Select>
    );

    return { year, picker };
}

/** Page wrapper that keeps people without the reports permission out. */
export function ReportPage({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
    const allowed = usePermission('reports.view');
    if (!allowed) {
        return <Navigate to="/" replace />;
    }

    return (
        <div className="mx-auto max-w-[1400px] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="page-title">{title}</h4>
                {actions}
            </div>
            {children}
        </div>
    );
}

export function Panel({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
    return (
        <div className={`panel_s ${className}`}>
            <div className="panel-body space-y-3">
                {title && <h5 className="text-[15px] font-semibold text-gray-800">{title}</h5>}
                {children}
            </div>
        </div>
    );
}

/** Download the rows of a report table as CSV (Perfex "Export"). */
export function downloadCsv(name: string, headers: string[], rows: (string | number | null | undefined)[][]) {
    const escape = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map((r) => r.map(escape).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `${name}.csv` });
    a.click();
    URL.revokeObjectURL(url);
}
