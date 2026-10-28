import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type InputHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { formatDate, parseDate, toIsoDate } from '../../lib/format';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Settings → Calendar "First day of the week" (0 Sunday … 6 Saturday); the staff layout sets it. */
let weekStart = 1;
export const setDatePickerWeekStart = (day: number) => {
    weekStart = day >= 0 && day <= 6 ? day : 1;
};

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value'> & { value?: string | number | readonly string[] };

/**
 * The CRM's date field: shows "20 Oct 2026" and opens a month calendar. It stands in for
 * <input type="date">, so callers keep reading `e.target.value` as "YYYY-MM-DD" ('' when cleared).
 */
export default function DatePicker({ value, onChange, min, max, disabled, className = '', placeholder, id, title }: Props) {
    const iso = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : '';
    const [open, setOpen] = useState(false);
    const [month, setMonth] = useState(() => startOfMonth(iso ? parseDate(iso) : new Date()));
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const button = useRef<HTMLButtonElement>(null);
    const pop = useRef<HTMLDivElement>(null);
    const minIso = typeof min === 'string' ? min.slice(0, 10) : '';
    const maxIso = typeof max === 'string' ? max.slice(0, 10) : '';

    const emit = (next: string) => onChange?.({ target: { value: next }, currentTarget: { value: next } } as unknown as ChangeEvent<HTMLInputElement>);

    useLayoutEffect(() => {
        if (!open || !button.current) {
            return;
        }
        const place = () => {
            const r = button.current!.getBoundingClientRect();
            const width = 288;
            const height = pop.current?.offsetHeight ?? 340;
            const below = r.bottom + 6 + height <= window.innerHeight;
            setPos({ top: below ? r.bottom + 6 : Math.max(8, r.top - 6 - height), left: Math.min(Math.max(8, r.left), window.innerWidth - width - 8) });
        };
        place();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);

        return () => {
            window.removeEventListener('resize', place);
            window.removeEventListener('scroll', place, true);
        };
    }, [open]);

    useEffect(() => {
        if (!open) {
            return;
        }
        const away = (e: MouseEvent) => {
            if (!pop.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        const esc = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), setOpen(false), button.current?.focus());
        document.addEventListener('mousedown', away);
        document.addEventListener('keydown', esc, true);

        return () => {
            document.removeEventListener('mousedown', away);
            document.removeEventListener('keydown', esc, true);
        };
    }, [open]);

    function toggle() {
        if (disabled) {
            return;
        }
        if (!open) {
            setMonth(startOfMonth(iso ? parseDate(iso) : minIso && new Date() < parseDate(minIso) ? parseDate(minIso) : new Date()));
            setPos(null);
        }
        setOpen(!open);
    }

    const allowed = (d: string) => (!minIso || d >= minIso) && (!maxIso || d <= maxIso);
    const pick = (d: string) => {
        if (allowed(d)) {
            emit(d);
            setOpen(false);
        }
    };

    const today = toIsoDate(new Date());
    const lead = (month.getDay() - weekStart + 7) % 7;
    const cells = Array.from({ length: 42 }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i - lead + 1));
    const weeks = cells[35].getMonth() !== month.getMonth() ? cells.slice(0, 35) : cells;
    const weekdays = [...WEEKDAYS.slice(weekStart), ...WEEKDAYS.slice(0, weekStart)];
    const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
    const narrow = /(^|\s)w-(auto|\d)/.test(className);

    return (
        <>
            <button
                ref={button}
                id={id}
                type="button"
                title={title}
                disabled={disabled}
                onClick={toggle}
                aria-haspopup="dialog"
                aria-expanded={open}
                className={`${className} relative flex items-center gap-2 pr-8 text-left ${narrow ? 'min-w-[9.5rem]' : ''} ${open ? 'border-brand ring-4 ring-brand/10' : ''}`}
            >
                <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" />
                <span className={`truncate ${iso ? '' : 'text-slate-400'}`}>{iso ? formatDate(iso) : (placeholder ?? 'Select date')}</span>
                {iso && !disabled && (
                    <span
                        role="button"
                        tabIndex={-1}
                        aria-label="Clear date"
                        onClick={(e) => (e.stopPropagation(), emit(''))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                        <X className="h-3.5 w-3.5" />
                    </span>
                )}
            </button>
            {open &&
                createPortal(
                    <div
                        ref={pop}
                        role="dialog"
                        data-floating
                        aria-label="Choose a date"
                        style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
                        className="fixed z-[200] w-72 rounded-xl border border-slate-200 bg-white p-3 text-slate-800 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="mb-2 flex items-center justify-between">
                            <button type="button" onClick={() => shift(-1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label="Previous month">
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <div className="flex items-center gap-1 text-[14px] font-semibold">
                                <span>{MONTHS[month.getMonth()]}</span>
                                <select
                                    value={month.getFullYear()}
                                    onChange={(e) => setMonth(new Date(Number(e.target.value), month.getMonth(), 1))}
                                    className="cursor-pointer rounded-md bg-transparent px-1 py-0.5 font-semibold outline-none hover:bg-slate-100"
                                    aria-label="Year"
                                >
                                    {Array.from({ length: 21 }, (_, i) => month.getFullYear() - 10 + i).map((y) => (
                                        <option key={y} value={y}>
                                            {y}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <button type="button" onClick={() => shift(1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label="Next month">
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="grid grid-cols-7 text-center text-[11px] font-semibold uppercase text-slate-400">
                            {weekdays.map((d) => (
                                <span key={d} className="py-1">
                                    {d}
                                </span>
                            ))}
                        </div>
                        <div className="grid grid-cols-7 gap-0.5">
                            {weeks.map((d) => {
                                const key = toIsoDate(d);
                                const inMonth = d.getMonth() === month.getMonth();
                                const selected = key === iso;
                                const ok = allowed(key);

                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        disabled={!ok}
                                        onClick={() => pick(key)}
                                        className={`h-9 rounded-lg text-[13px] transition ${
                                            selected
                                                ? 'bg-brand font-semibold text-white shadow-sm'
                                                : !ok
                                                  ? 'cursor-not-allowed text-slate-300'
                                                  : key === today
                                                    ? 'font-bold text-accent ring-1 ring-inset ring-accent/40 hover:bg-accent-50'
                                                    : inMonth
                                                      ? 'text-slate-700 hover:bg-brand-50 hover:text-brand'
                                                      : 'text-slate-300 hover:bg-slate-50'
                                        }`}
                                    >
                                        {d.getDate()}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
                            <button type="button" onClick={() => pick(today)} disabled={!allowed(today)} className="rounded-md px-2 py-1 text-[12.5px] font-semibold text-brand hover:bg-brand-50 disabled:text-slate-300">
                                Today
                            </button>
                            {iso && (
                                <button type="button" onClick={() => (emit(''), setOpen(false))} className="rounded-md px-2 py-1 text-[12.5px] font-semibold text-slate-500 hover:bg-slate-100">
                                    Clear
                                </button>
                            )}
                        </div>
                    </div>,
                    document.body,
                )}
        </>
    );
}

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
