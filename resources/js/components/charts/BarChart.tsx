import { useState } from 'react';

/**
 * Categorical palette in fixed order (dataviz slots 1–8, validated for colour-vision deficiency on
 * light and dark); never cycled. CSS variables, so dark mode gets its own steps.
 */
export const SERIES_COLORS = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)', 'var(--viz-4)', 'var(--viz-5)', 'var(--viz-6)', 'var(--viz-7)', 'var(--viz-8)'];

export type Series = { name: string; values: number[]; color?: string };

/** A round axis top that splits into 4 steps; whole steps when the data are counts. */
function niceMax(value: number, whole: boolean): number {
    if (value <= 0) {
        return whole ? 4 : 1;
    }
    if (whole && value <= 4) {
        return 4;
    }
    const raw = value / 4;
    const exp = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * exp).find((s) => s >= raw && (!whole || Number.isInteger(s))) ?? 10 * exp;

    return step * 4;
}

function compact(value: number): string {
    const abs = Math.abs(value);
    if (abs >= 1e7) {
        return `${+(value / 1e7).toFixed(1)}Cr`;
    }
    if (abs >= 1e5) {
        return `${+(value / 1e5).toFixed(1)}L`;
    }
    if (abs >= 1e3) {
        return `${+(value / 1e3).toFixed(1)}K`;
    }

    return String(+value.toFixed(2));
}

/** Legend with each series' total; shown for two or more series (one series is named by the title). */
export function Legend({ series, format = compact }: { series: Series[]; format?: (value: number) => string }) {
    if (series.length < 2) {
        return null;
    }

    return (
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-slate-600">
            {series.map((s, i) => (
                <span key={s.name} className="inline-flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color ?? SERIES_COLORS[i] }} />
                    {s.name}
                    <b className="font-semibold tabular-nums text-slate-800">{format(s.values.reduce((a, b) => a + b, 0))}</b>
                </span>
            ))}
        </div>
    );
}

/**
 * Vertical bars on one y-axis: grouped (side by side, 2px apart) or stacked. Thin bars with a
 * rounded data end on a dashed, recessive grid; hovering a column shows its tooltip; the same
 * numbers are one click away as a table.
 */
export function BarChart({
    labels,
    series,
    stacked = false,
    format = compact,
    height = 240,
}: {
    labels: string[];
    series: Series[];
    stacked?: boolean;
    format?: (value: number) => string;
    height?: number;
}) {
    const [hover, setHover] = useState<number | null>(null);
    const [table, setTable] = useState(false);
    const colored = series.map((s, i) => ({ ...s, color: s.color ?? SERIES_COLORS[i] }));
    const columnTotals = labels.map((_, i) => colored.reduce((sum, s) => sum + (s.values[i] ?? 0), 0));
    const whole = colored.every((s) => s.values.every((v) => Number.isInteger(v)));
    const max = niceMax(stacked ? Math.max(0, ...columnTotals) : Math.max(0, ...colored.flatMap((s) => s.values)), whole);
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
    // Long ranges (e.g. 31 days): label every nth column so the axis stays readable.
    const labelStep = Math.max(1, Math.ceil(labels.length / 12));

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
                <Legend series={colored} format={format} />
                <button type="button" onClick={() => setTable(!table)} className="ml-auto rounded-md px-2 py-1 text-[12px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800">
                    {table ? 'Chart' : 'Table'}
                </button>
            </div>
            {table ? (
                <div className="max-h-80 overflow-auto">
                    <table className="table-perfex">
                        <thead>
                            <tr>
                                <th />
                                {colored.map((s) => (
                                    <th key={s.name} className="text-right">
                                        {s.name}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {labels.map((label, i) => (
                                <tr key={label}>
                                    <td>{label}</td>
                                    {colored.map((s) => (
                                        <td key={s.name} className="text-right tabular-nums">
                                            {format(s.values[i] ?? 0)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="flex gap-2 pt-2">
                    <div className="relative w-11 shrink-0 text-right text-[10.5px] text-slate-400" style={{ height }}>
                        {ticks.map((t) => (
                            <span key={t} className="absolute right-0 -translate-y-1/2 tabular-nums" style={{ bottom: `${(t / max) * 100}%` }}>
                                {compact(t)}
                            </span>
                        ))}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="relative" style={{ height }} onMouseLeave={() => setHover(null)}>
                            {ticks.map((t) => (
                                <div key={t} className={`absolute inset-x-0 border-t ${t === 0 ? 'border-slate-300' : 'border-dashed border-slate-200'}`} style={{ bottom: `${(t / max) * 100}%` }} />
                            ))}
                            <div className="absolute inset-0 flex">
                                {labels.map((label, i) => (
                                    <div key={label} className="relative flex flex-1 items-end justify-center px-[2px]" onMouseEnter={() => setHover(i)}>
                                        {hover === i && <span className="absolute inset-x-[2px] inset-y-0 rounded-md bg-slate-100" />}
                                        {stacked ? (
                                            <div className="relative flex w-full max-w-[18px] flex-col-reverse gap-[2px]" style={{ height: `${(columnTotals[i] / max) * 100}%` }}>
                                                {colored.map((s, si) => {
                                                    const v = s.values[i] ?? 0;
                                                    const isTop = colored.slice(si + 1).every((o) => !(o.values[i] ?? 0));

                                                    return v > 0 ? <div key={s.name} className={isTop ? 'rounded-t' : ''} style={{ flexGrow: v, flexBasis: 0, backgroundColor: s.color }} /> : null;
                                                })}
                                            </div>
                                        ) : (
                                            <div className="relative flex h-full w-4/5 items-end justify-center gap-[2px]">
                                                {colored.map((s) => (
                                                    <div
                                                        key={s.name}
                                                        className="max-w-[18px] flex-1 rounded-t transition-opacity"
                                                        style={{ height: `${((s.values[i] ?? 0) / max) * 100}%`, backgroundColor: s.color, opacity: hover === null || hover === i ? 1 : 0.5 }}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                        {hover === i && (
                                            <div className={`pointer-events-none absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] shadow-lg ${i > labels.length * 0.7 ? 'right-0' : i < labels.length * 0.3 ? 'left-0' : ''}`}>
                                                <p className="mb-1 font-semibold text-slate-800">{label}</p>
                                                {colored.map((s) => (
                                                    <p key={s.name} className="flex items-center justify-between gap-4 text-slate-600">
                                                        <span className="inline-flex items-center gap-1.5">
                                                            <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: s.color }} />
                                                            {s.name}
                                                        </span>
                                                        <span className="font-semibold tabular-nums text-slate-800">{format(s.values[i] ?? 0)}</span>
                                                    </p>
                                                ))}
                                                {stacked && colored.length > 1 && (
                                                    <p className="mt-1 flex justify-between border-t border-slate-100 pt-1 font-semibold text-slate-800">
                                                        Total <span className="tabular-nums">{format(columnTotals[i])}</span>
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="flex pt-2 text-[10.5px] text-slate-400">
                            {labels.map((label, i) => (
                                <span key={label} className={`flex min-w-0 flex-1 whitespace-nowrap ${i === labels.length - 1 ? 'justify-end' : i === 0 ? 'justify-start' : 'justify-center'}`}>
                                    {(labels.length - 1 - i) % labelStep === 0 ? label : ''}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/** Horizontal single-series bars for a ranked list (e.g. income by customer group). */
export function BarList({ rows, format = compact, color = SERIES_COLORS[0] }: { rows: { label: string; value: number }[]; format?: (value: number) => string; color?: string }) {
    const max = Math.max(0, ...rows.map((r) => r.value)) || 1;

    return (
        <div className="space-y-3">
            {rows.map((r) => (
                <div key={r.label} title={`${r.label}: ${format(r.value)}`}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-[13px]">
                        <span className="truncate text-slate-600">{r.label}</span>
                        <span className="shrink-0 font-semibold tabular-nums text-slate-800">{format(r.value)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value > 0 ? 4 : 0, backgroundColor: color }} />
                    </div>
                </div>
            ))}
            {rows.length === 0 && <p className="text-[13px] text-slate-400">No data.</p>}
        </div>
    );
}
