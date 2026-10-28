/** Horizontal bars: one row per category, longest = full width, the number at the end. */
export default function BarList({ rows, unit, format = String }: { rows: { label: string; value: number; color?: string | null; hint?: string }[]; unit?: string; format?: (v: number) => string }) {
    const max = Math.max(1, ...rows.map((r) => r.value));
    if (rows.length === 0) {
        return <p className="py-6 text-center text-sm text-slate-400">Nothing yet.</p>;
    }

    return (
        <ul className="space-y-3">
            {rows.map((r) => (
                <li key={r.label} title={`${r.label}: ${format(r.value)}${unit ? ` ${unit}` : ''}${r.hint ? ` · ${r.hint}` : ''}`}>
                    <span className="mb-1 flex items-center justify-between gap-2 text-[13px]">
                        <span className="flex min-w-0 items-center gap-2 text-slate-600">
                            {r.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />}
                            <span className="truncate">{r.label}</span>
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums text-slate-800">
                            {format(r.value)}
                            {r.hint && <span className="ml-1.5 text-[11.5px] font-normal text-slate-400">{r.hint}</span>}
                        </span>
                    </span>
                    <span className="block h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <span className="block h-full rounded-full transition-all" style={{ width: `${(r.value / max) * 100}%`, backgroundColor: r.color ?? 'var(--color-brand)', opacity: r.value ? 1 : 0 }} />
                    </span>
                </li>
            ))}
        </ul>
    );
}
