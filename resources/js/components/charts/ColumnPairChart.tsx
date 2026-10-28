import { useEffect, useRef, useState } from 'react';

export type Series = { key: string; label: string; color: string; values: number[] };

const compact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });

/** A "nice" axis top and step for 4 gridlines. */
function niceScale(max: number): { top: number; step: number } {
    if (max <= 0) {
        return { top: 4, step: 1 };
    }
    const raw = max / 4;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;

    return { top: step * 4, step };
}

/**
 * Grouped columns for two (or a few) series over the same categories, e.g. income vs expenses per
 * month. Thin columns with rounded tops on a recessive grid, one hover tooltip per category, a
 * legend with totals, and the same numbers as a table on request.
 */
export default function ColumnPairChart({ categories, series, format, height = 240, integer = false }: { categories: string[]; series: Series[]; format: (n: number) => string; height?: number; integer?: boolean }) {
    const box = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(640);
    const [hover, setHover] = useState<number | null>(null);
    const [table, setTable] = useState(false);

    useEffect(() => {
        const el = box.current;
        if (!el) {
            return;
        }
        const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.floor(entry.contentRect.width))));
        ro.observe(el);

        return () => ro.disconnect();
    }, [table]);

    const pad = { top: 12, right: 8, bottom: 26, left: 48 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const max = Math.max(0, ...series.flatMap((s) => s.values));
    // Counts (leads, tickets) never get fractional gridlines.
    const { top, step } = integer && max <= 4 ? { top: 4, step: 1 } : niceScale(max);
    const band = plotW / Math.max(1, categories.length);
    const gap = 2;
    const barW = Math.max(3, Math.min(18, (band * 0.62 - gap * (series.length - 1)) / series.length));
    const groupW = barW * series.length + gap * (series.length - 1);
    const y = (v: number) => pad.top + plotH - (v / top) * plotH;
    // Month labels need ~44px each: show every 2nd / 3rd when the chart is narrow, always the latest.
    const labelStep = band < 26 ? 3 : band < 44 ? 2 : 1;

    // A column with a 4px rounded data end, square on the baseline.
    const column = (x: number, v: number) => {
        const h = Math.max(0, y(0) - y(v));
        if (h <= 0) {
            return '';
        }
        const r = Math.min(4, barW / 2, h);
        const t = y(v);
        const b = y(0);

        return `M${x},${b} V${t + r} Q${x},${t} ${x + r},${t} H${x + barW - r} Q${x + barW},${t} ${x + barW},${t + r} V${b} Z`;
    };

    const tipLeft = hover === null ? 0 : Math.min(Math.max(pad.left + band * hover + band / 2, 90), width - 90);

    return (
        <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                {series.map((s) => (
                    <span key={s.key} className="inline-flex items-center gap-2 text-[12.5px] text-slate-600">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
                        {s.label}
                        <b className="font-semibold text-slate-800">{format(s.values.reduce((a, b) => a + b, 0))}</b>
                    </span>
                ))}
                <button type="button" onClick={() => setTable(!table)} className="ml-auto rounded-md px-2 py-1 text-[12px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800">
                    {table ? 'Chart' : 'Table'}
                </button>
            </div>

            {table ? (
                <div className="max-h-72 overflow-auto">
                    <table className="table-perfex">
                        <thead>
                            <tr>
                                <th>Month</th>
                                {series.map((s) => (
                                    <th key={s.key} className="text-right">
                                        {s.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {categories.map((c, i) => (
                                <tr key={c}>
                                    <td>{c}</td>
                                    {series.map((s) => (
                                        <td key={s.key} className="text-right tabular-nums">
                                            {format(s.values[i] ?? 0)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div ref={box} className="relative w-full min-w-0 overflow-hidden" onMouseLeave={() => setHover(null)}>
                    <svg width={width} height={height} style={{ maxWidth: '100%' }} role="img" aria-label={`${series.map((s) => s.label).join(' and ')} by month`} className="block">
                        {[0, 1, 2, 3, 4].map((i) => (
                            <g key={i}>
                                <line x1={pad.left} x2={width - pad.right} y1={y(step * i)} y2={y(step * i)} className="stroke-slate-200" strokeWidth={1} strokeDasharray={i === 0 ? undefined : '3 4'} />
                                <text x={pad.left - 8} y={y(step * i)} dy="0.32em" textAnchor="end" className="fill-slate-400 text-[10.5px]">
                                    {compact.format(step * i)}
                                </text>
                            </g>
                        ))}
                        {categories.map((c, i) => {
                            const x0 = pad.left + band * i + (band - groupW) / 2;

                            return (
                                <g key={c}>
                                    {hover === i && <rect x={pad.left + band * i + 2} y={pad.top} width={band - 4} height={plotH} rx={6} className="fill-slate-100" />}
                                    {series.map((s, si) => (
                                        <path key={s.key} d={column(x0 + si * (barW + gap), s.values[i] ?? 0)} fill={s.color} opacity={hover === null || hover === i ? 1 : 0.45} />
                                    ))}
                                    {(categories.length - 1 - i) % labelStep === 0 && (
                                        <text x={pad.left + band * i + band / 2} y={height - 8} textAnchor="middle" className="fill-slate-400 text-[10.5px]">
                                            {c}
                                        </text>
                                    )}
                                    {/* Hit target: the whole month column, bigger than the bars. */}
                                    <rect x={pad.left + band * i} y={pad.top} width={band} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} />
                                </g>
                            );
                        })}
                    </svg>
                    {hover !== null && (
                        <div className="pointer-events-none absolute top-1 z-10 w-44 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] shadow-lg" style={{ left: tipLeft }}>
                            <p className="mb-1 font-semibold text-slate-800">{categories[hover]}</p>
                            {series.map((s) => (
                                <p key={s.key} className="flex items-center justify-between gap-3 text-slate-600">
                                    <span className="inline-flex items-center gap-1.5">
                                        <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: s.color }} />
                                        {s.label}
                                    </span>
                                    <span className="font-semibold tabular-nums text-slate-800">{format(s.values[hover] ?? 0)}</span>
                                </p>
                            ))}
                            {series.length === 2 && (
                                <p className="mt-1 flex justify-between border-t border-slate-100 pt-1 text-slate-500">
                                    Net <span className={`font-semibold tabular-nums ${series[0].values[hover] - series[1].values[hover] < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{format(series[0].values[hover] - series[1].values[hover])}</span>
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
