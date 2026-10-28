import { useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Check, ChevronDown, Inbox, Loader2, Search, X } from 'lucide-react';
import type { Option } from '../../lib/constants';
import type { Staff } from '../../types';
import { useStaff } from '../../hooks/useStaff';
import { createPortal } from 'react-dom';
import DatePicker from './DatePicker';
import SearchSelect, { readOptions } from './SearchSelect';

/* ── Buttons ─────────────────────────────────────────────────────────── */

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const variants: Record<Variant, string> = {
    primary: 'border border-brand bg-brand text-white hover:bg-brand-light hover:border-brand-light focus:ring-brand/25 shadow-sm shadow-brand/20',
    secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400 focus:ring-brand/15 shadow-sm',
    danger: 'border border-red-600 bg-red-600 text-white hover:bg-red-700 focus:ring-red-200 shadow-sm',
    ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:ring-slate-200',
};

export function Button({
    variant = 'primary',
    size = 'md',
    loading = false,
    className = '',
    children,
    disabled,
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean }) {
    const sizes = size === 'sm' ? 'px-2.5 py-1 text-[12.5px] rounded-md' : 'px-3.5 py-[7px] text-[13.5px] leading-5 rounded-lg';

    return (
        <button
            type="button"
            {...props}
            disabled={disabled || loading}
            className={`inline-flex items-center justify-center gap-1.5 font-semibold transition focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-60 ${sizes} ${variants[variant]} ${className}`}
        >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {children}
        </button>
    );
}

export function IconButton({ label, className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            {...props}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 ${className}`}
        >
            {children}
        </button>
    );
}

/* ── Form fields ─────────────────────────────────────────────────────── */

export const inputClass =
    'block w-full rounded-lg border border-slate-300 bg-white px-3 py-[7px] text-[13.5px] text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-brand focus:ring-4 focus:ring-brand/10 disabled:bg-slate-100 disabled:text-slate-500';

export function Field({ label, error, hint, required, children, className = '' }: { label: string; error?: string; hint?: string; required?: boolean; children: ReactNode; className?: string }) {
    return (
        <label className={`block ${className}`}>
            <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">
                {label}
                {required && <span className="text-red-500"> *</span>}
            </span>
            {children}
            {hint && !error && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
            {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
        </label>
    );
}

/** The base field classes plus the caller's; a width class from the caller replaces w-full. */
function fieldClass(extra: string | undefined): string {
    const base = /(^|\s)w-/.test(extra ?? '') ? inputClass.replace(/(^|\s)w-full(?=\s|$)/, ' ') : inputClass;

    return `${base} ${extra ?? ''}`;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
    if (props.type === 'date') {
        return <DatePicker {...props} className={fieldClass(props.className)} />;
    }

    return <input {...props} className={fieldClass(props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return <textarea rows={4} {...props} className={fieldClass(props.className)} />;
}

/** Lists longer than this get a search box. */
const SEARCHABLE_FROM = 9;

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
    const items = props.multiple ? null : readOptions(props.children);
    if (items && items.length >= SEARCHABLE_FROM) {
        return <SearchSelect {...props} items={items} className={fieldClass(props.className)} />;
    }

    return <select {...props} className={`${fieldClass(props.className)} field-select pr-8`} />;
}

export function Checkbox({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
    return (
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(e) => onChange(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 accent-brand focus:ring-brand/30"
            />
            {label}
        </label>
    );
}

/* ── Modal ───────────────────────────────────────────────────────────── */

export function Modal({
    open,
    title,
    onClose,
    children,
    footer,
    size = 'md',
}: {
    open: boolean;
    title: ReactNode;
    onClose: () => void;
    children: ReactNode;
    footer?: ReactNode;
    size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
    useEffect(() => {
        if (!open) {
            return;
        }
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
        document.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = '';
        };
    }, [open, onClose]);

    if (!open) {
        return null;
    }

    const widths = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' };

    // Portalled to <body>: a parent with a backdrop filter or transform (the blurred header) would
    // otherwise trap this fixed overlay inside itself. data-floating keeps an opener menu open.
    return createPortal(
        <div data-floating className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-3 backdrop-blur-[2px] sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div role="dialog" aria-modal="true" className={`my-4 w-full ${widths[size]} rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5`}>
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
                    <h2 className="text-[16.5px] font-semibold text-slate-800">{title}</h2>
                    <IconButton label="Close" onClick={onClose} className="-mr-2 -mt-1">
                        <X className="h-4 w-4" />
                    </IconButton>
                </div>
                <div className="px-6 py-5">{children}</div>
                {footer && <div className="flex flex-wrap justify-end gap-2 rounded-b-2xl border-t border-slate-200 bg-slate-50 px-6 py-3.5">{footer}</div>}
            </div>
        </div>,
        document.body,
    );
}

/* ── Badges, avatars, misc ───────────────────────────────────────────── */

export function StatusBadge({ option }: { option: Option | undefined }) {
    if (!option) {
        return null;
    }

    return (
        <span
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold"
            style={{ color: option.color, borderColor: `${option.color}66`, backgroundColor: `${option.color}0d` }}
        >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: option.color }} />
            {option.name}
        </span>
    );
}

export function Tag({ children }: { children: ReactNode }) {
    return <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200/70">{children}</span>;
}

const avatarColors = ['bg-blue-100 text-blue-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700', 'bg-sky-100 text-sky-700', 'bg-violet-100 text-violet-700'];

export function initials(name: string | null | undefined): string {
    return (name ?? '?')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('');
}

/**
 * A staff member's HRMS profile photo, or coloured initials when there is none (or it fails to load).
 */
export function Avatar({ name, id = 0, size = 'md', photo }: { name: string | null | undefined; id?: number; size?: 'sm' | 'md' | 'lg'; photo?: string | null }) {
    const dims = size === 'sm' ? 'h-6 w-6 text-[10px]' : size === 'lg' ? 'h-16 w-16 text-lg' : 'h-8 w-8 text-xs';
    const staff = useStaff();
    const [loaded, setLoaded] = useState<string | null>(null);
    const src = photo ?? staff.find((s) => s.id === id)?.photo_url;

    // Initials show until the photo has actually loaded (a missing photo never leaves a blank circle).
    if (src) {
        return (
            <span title={name ?? ''} className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold ring-2 ring-white ${dims} ${avatarColors[id % avatarColors.length]}`}>
                {loaded !== src && initials(name)}
                <img
                    src={src}
                    alt=""
                    onLoad={(e) => e.currentTarget.naturalWidth > 0 && setLoaded(src)}
                    className={`absolute inset-0 h-full w-full object-cover ${loaded === src ? '' : 'invisible'}`}
                />
            </span>
        );
    }

    return (
        <span title={name ?? ''} className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-white ${dims} ${avatarColors[id % avatarColors.length]}`}>
            {initials(name)}
        </span>
    );
}

export function AvatarStack({ people, max = 4 }: { people: Staff[] | undefined; max?: number }) {
    const list = people ?? [];
    if (list.length === 0) {
        return <span className="text-xs text-gray-400">—</span>;
    }

    return (
        <div className="flex -space-x-1.5">
            {list.slice(0, max).map((person) => (
                <Avatar key={person.id} id={person.id} name={person.full_name} size="sm" />
            ))}
            {list.length > max && (
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-[10px] font-semibold text-gray-600 ring-2 ring-white">
                    +{list.length - max}
                </span>
            )}
        </div>
    );
}

export function ProgressBar({ value, color = '#0b2c56' }: { value: number; color?: string }) {
    return (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color }} />
        </div>
    );
}

const SKELETON_WIDTHS = ['w-11/12', 'w-4/5', 'w-full', 'w-3/4', 'w-5/6'];

/** Loading placeholder: grey rows in the shape of the list or panel that is on its way. */
export function Spinner({ className = '', rows = 5 }: { className?: string; rows?: number }) {
    return (
        <div role="status" aria-busy="true" className={`animate-pulse space-y-4 py-4 ${className}`}>
            <span className="sr-only">Loading…</span>
            {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="flex items-center gap-3">
                    <span className="h-8 w-8 shrink-0 rounded-lg bg-slate-200/80" />
                    <div className="flex-1 space-y-2">
                        <span className={`block h-2.5 rounded-full bg-slate-200 ${SKELETON_WIDTHS[i % SKELETON_WIDTHS.length]}`} />
                        <span className="block h-2 w-1/3 rounded-full bg-slate-200/70" />
                    </div>
                    <span className="hidden h-5 w-16 shrink-0 rounded-full bg-slate-200/70 sm:block" />
                </div>
            ))}
        </div>
    );
}

/** A small inline busy indicator (buttons, one-line spots). */
export function InlineSpinner({ className = '' }: { className?: string }) {
    return <Loader2 className={`h-4 w-4 animate-spin text-brand/60 ${className}`} />;
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
    return (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand/70">
                <Inbox className="h-6 w-6" />
            </span>
            <p className="font-semibold text-slate-700">{title}</p>
            {text && <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}

export function ErrorNote({ message }: { message: string | null }) {
    if (!message) {
        return null;
    }

    return <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{message}</p>;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
    return <div className={`rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)] ${className}`}>{children}</div>;
}

export function Pagination({ page, lastPage, total, onChange }: { page: number; lastPage: number; total: number; onChange: (page: number) => void }) {
    if (lastPage <= 1) {
        return <p className="text-xs text-slate-500">{total} total</p>;
    }

    return (
        <div className="flex items-center justify-between gap-3 text-sm">
            <p className="text-xs text-slate-500">
                Page <b className="text-slate-700">{page}</b> of {lastPage} · {total} total
            </p>
            <div className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
                    Previous
                </Button>
                <Button variant="secondary" size="sm" disabled={page >= lastPage} onClick={() => onChange(page + 1)}>
                    Next
                </Button>
            </div>
        </div>
    );
}

/* ── Tabs ────────────────────────────────────────────────────────────── */

export function Tabs<T extends string>({ tabs, active, onChange }: { tabs: { id: T; label: string; count?: number }[]; active: T; onChange: (id: T) => void }) {
    return (
        <div className="scrollbar-none -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div className="flex min-w-max gap-1 border-b border-slate-200">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => onChange(tab.id)}
                        className={`-mb-px border-b-2 px-3 py-2.5 text-[13.5px] font-semibold transition ${
                            active === tab.id ? 'border-accent text-brand' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
                        }`}
                    >
                        {tab.label}
                        {tab.count !== undefined && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{tab.count}</span>}
                    </button>
                ))}
            </div>
        </div>
    );
}

/* ── Pickers ─────────────────────────────────────────────────────────── */

function usePopover() {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) {
            return;
        }
        // Clicks inside a floating layer (e.g. a date picker's calendar) belong to the popover that opened it.
        const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && !(e.target as Element).closest?.('[data-floating]') && setOpen(false);
        document.addEventListener('mousedown', close);

        return () => document.removeEventListener('mousedown', close);
    }, [open]);

    return { open, setOpen, ref };
}

/** Pick several HRMS employees, with search. */
export function StaffMultiSelect({ staff, value, onChange, placeholder = 'Select staff', disabled }: { staff: Staff[]; value: number[]; onChange: (ids: number[]) => void; placeholder?: string; disabled?: boolean }) {
    const { open, setOpen, ref } = usePopover();
    const [search, setSearch] = useState('');
    const selected = staff.filter((s) => value.includes(s.id));
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();

        return q ? staff.filter((s) => `${s.full_name} ${s.email ?? ''} ${s.employee_code ?? ''}`.toLowerCase().includes(q)) : staff;
    }, [staff, search]);

    const toggle = (id: number) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen(!open)}
                className={`${inputClass} flex min-h-[38px] flex-wrap items-center gap-1 text-left`}
            >
                {selected.length === 0 && <span className="text-gray-400">{placeholder}</span>}
                {selected.map((person) => (
                    <span key={person.id} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand">
                        {person.full_name}
                        <X
                            className="h-3 w-3 cursor-pointer"
                            onClick={(e) => {
                                e.stopPropagation();
                                toggle(person.id);
                            }}
                        />
                    </span>
                ))}
                <ChevronDown className="ml-auto h-4 w-4 text-gray-400" />
            </button>
            {open && (
                <div className="absolute z-30 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
                    <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
                        <Search className="h-4 w-4 text-gray-400" />
                        <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="w-full text-sm outline-none" />
                    </div>
                    <ul className="max-h-60 overflow-y-auto py-1">
                        {filtered.map((person) => (
                            <li key={person.id}>
                                <button type="button" onClick={() => toggle(person.id)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-gray-50">
                                    <Avatar id={person.id} name={person.full_name} size="sm" />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate">{person.full_name}</span>
                                        {person.email && <span className="block truncate text-xs text-gray-500">{person.email}</span>}
                                    </span>
                                    {value.includes(person.id) && <Check className="h-4 w-4 text-brand" />}
                                </button>
                            </li>
                        ))}
                        {filtered.length === 0 && <li className="px-3 py-3 text-sm text-gray-500">No match.</li>}
                    </ul>
                </div>
            )}
        </div>
    );
}

/** Free-text tags: type and press Enter or comma. */
export function TagInput({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
    const [draft, setDraft] = useState('');
    const add = () => {
        const tag = draft.trim().replace(/,$/, '');
        if (tag && !value.includes(tag)) {
            onChange([...value, tag]);
        }
        setDraft('');
    };

    return (
        <div className={`${inputClass} flex min-h-[38px] flex-wrap items-center gap-1`}>
            {value.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700">
                    {tag}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => onChange(value.filter((t) => t !== tag))} />
                </span>
            ))}
            <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        add();
                    } else if (e.key === 'Backspace' && !draft && value.length) {
                        onChange(value.slice(0, -1));
                    }
                }}
                onBlur={add}
                placeholder={value.length ? '' : 'Add tags…'}
                className="min-w-[6rem] flex-1 text-sm outline-none"
            />
        </div>
    );
}

/** A small menu opened from a trigger button. */
export function Menu({ trigger, children, align = 'right', block = false }: { trigger: (toggle: () => void) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; block?: boolean }) {
    const { open, setOpen, ref } = usePopover();

    return (
        <div className={`relative ${block ? 'block w-full' : 'inline-block'}`} ref={ref}>
            {trigger(() => setOpen(!open))}
            {open && (
                <div className={`absolute z-30 mt-1.5 min-w-[12rem] rounded-xl border border-slate-200 bg-white p-1 shadow-xl shadow-slate-900/10 ${align === 'right' ? 'right-0' : 'left-0'}`}>
                    {children(() => setOpen(false))}
                </div>
            )}
        </div>
    );
}

export function MenuItem({ onClick, children, danger }: { onClick: () => void; children: ReactNode; danger?: boolean }) {
    return (
        <button type="button" onClick={onClick} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-100'}`}>
            {children}
        </button>
    );
}

/** A clickable status/summary tile above a list: colour bar + dot + label, the count, an optional sub-line. */
export function SummaryCard({ label, value, color, active, muted, sub, onClick }: { label: string; value: ReactNode; color?: string; active?: boolean; muted?: boolean; sub?: ReactNode; onClick?: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`relative overflow-hidden rounded-xl border bg-white px-4 py-3 text-left shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition hover:-translate-y-0.5 hover:shadow-md ${active ? 'border-brand ring-4 ring-brand/10' : 'border-slate-200/80'} ${muted ? 'opacity-60 hover:opacity-100' : ''}`}
        >
            <span className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: color ?? '#0b2c56' }} />
            <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-500" title={label}>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color ?? '#0b2c56' }} />
                <span className="truncate">{label}</span>
            </p>
            <p className="mt-0.5 text-[24px] font-bold leading-tight text-slate-800">{value}</p>
            {sub && <p className="text-[12px] text-slate-500">{sub}</p>}
        </button>
    );
}
