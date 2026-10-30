import { isValidElement, useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { BriefcaseBusiness, Building2, Check, ChevronDown, Clock, Globe, Hash, Inbox, IndianRupee, Loader2, Lock, Mail, MapPin, PenLine, Phone, Search, UserRound, X, type LucideIcon } from 'lucide-react';
import type { Option } from '../../lib/constants';
import type { Staff } from '../../types';
import { useStaff } from '../../hooks/useStaff';
import { createPortal } from 'react-dom';
import DatePicker from './DatePicker';
import SearchSelect, { readOptions } from './SearchSelect';

/* ── Buttons ─────────────────────────────────────────────────────────── */

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const variants: Record<Variant, string> = {
    primary:
        'border border-brand bg-[linear-gradient(180deg,var(--color-brand-light),var(--color-brand))] text-white shadow-[0_6px_16px_-8px_rgba(11,44,86,0.8),inset_0_1px_0_rgba(255,255,255,0.14)] hover:-translate-y-px hover:shadow-[0_10px_22px_-10px_rgba(11,44,86,0.9),inset_0_1px_0_rgba(255,255,255,0.14)] focus:ring-brand/25',
    secondary: 'border border-slate-200 bg-white text-slate-700 shadow-[0_1px_2px_rgba(16,24,40,0.06)] hover:-translate-y-px hover:border-slate-300 hover:bg-slate-50 hover:shadow-md focus:ring-brand/15',
    danger: 'border border-red-600 bg-red-600 text-white shadow-[0_6px_16px_-8px_rgba(220,38,38,0.7)] hover:-translate-y-px hover:bg-red-700 focus:ring-red-200',
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
    const sizes = size === 'sm' ? 'px-2.5 py-1 text-[12.5px] rounded-lg' : 'px-4 py-2 text-[13.5px] leading-5 rounded-xl';

    return (
        <button
            type="button"
            {...props}
            disabled={disabled || loading}
            className={`inline-flex items-center justify-center gap-1.5 font-semibold transition duration-150 focus:outline-none focus:ring-4 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 ${sizes} ${variants[variant]} ${className}`}
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
            className={`inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 ${className}`}
        >
            {children}
        </button>
    );
}

/* ── Form fields ─────────────────────────────────────────────────────── */

export const inputClass =
    'block w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[13.5px] text-slate-800 shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand/60 focus:ring-4 focus:ring-brand/10 disabled:bg-slate-100 disabled:text-slate-500';

/** The icon a plain text field gets from its label (e-mail → envelope, phone → phone…). */
const FIELD_ICONS: [RegExp, LucideIcon][] = [
    [/e-?mail/i, Mail],
    [/phone|mobile|whatsapp/i, Phone],
    [/website|url|domain/i, Globe],
    [/address|street|location/i, MapPin],
    [/company|organi[sz]ation|vendor/i, Building2],
    [/^(name|full name|first name|last name|contact name|your name|contact)$/i, UserRound],
    [/position|designation|job title/i, BriefcaseBusiness],
    [/amount|value|price|rate|total|budget|cost|salary|fee/i, IndianRupee],
    [/password/i, Lock],
    [/\b(gst|vat|pan)\b|tax (id|number)/i, Hash],
    [/hours|minutes|duration/i, Clock],
    [/subject/i, PenLine],
];
const ICON_TYPES = new Set([undefined, 'text', 'email', 'tel', 'url', 'number', 'password']);

/** A plain <Input> child that should carry an icon for this label, or null. */
function fieldIcon(label: string, children: ReactNode): { icon: LucideIcon; input: ReactElement<InputHTMLAttributes<HTMLInputElement>> } | null {
    if (!isValidElement(children) || children.type !== Input) {
        return null;
    }
    const input = children as ReactElement<InputHTMLAttributes<HTMLInputElement>>;
    if (!ICON_TYPES.has(input.props.type) || /(^|\s)pl-/.test(input.props.className ?? '')) {
        return null;
    }
    const icon = FIELD_ICONS.find(([test]) => test.test(label.trim()))?.[1];

    return icon ? { icon, input } : null;
}

export function Field({ label, error, hint, required, children, className = '' }: { label: string; error?: string; hint?: string; required?: boolean; children: ReactNode; className?: string }) {
    const iconised = fieldIcon(label, children);

    return (
        <label className={`block ${className}`}>
            <span className="mb-1.5 block text-[12.5px] font-semibold text-slate-600">
                {label}
                {required && <span className="text-red-500"> *</span>}
            </span>
            {iconised ? <IconInput icon={iconised.icon} {...iconised.input.props} /> : children}
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

/** An input with an icon inside its left edge (mail, phone, money…). */
export function IconInput({ icon: Icon, ...props }: InputHTMLAttributes<HTMLInputElement> & { icon: LucideIcon }) {
    return (
        <div className="group/icon relative">
            <Icon className="pointer-events-none absolute left-3.5 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-slate-400 transition group-focus-within/icon:text-brand" />
            <Input {...props} className={`pl-10 ${props.className ?? ''}`} />
        </div>
    );
}

/** A section's heading: navy icon chip, title and an optional hint. */
export function SectionHeading({ icon: Icon, title, hint, className = 'mb-4' }: { icon: LucideIcon; title: string; hint?: string; className?: string }) {
    return (
        <div className={`flex items-center gap-3 ${className}`}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-light))] text-white shadow-[0_6px_14px_-6px_rgba(11,44,86,0.7)]">
                <Icon className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
                <h3 className="text-[14.5px] font-bold text-slate-800">{title}</h3>
                {hint && <p className="text-[12px] text-slate-500">{hint}</p>}
            </div>
        </div>
    );
}

/** A titled group of fields inside a form: the heading, then the fields (laid out by bodyClassName when given). */
export function FormSection({
    icon,
    title,
    hint,
    children,
    className = '',
    bodyClassName,
}: {
    icon: LucideIcon;
    title: string;
    hint?: string;
    children: ReactNode;
    className?: string;
    bodyClassName?: string;
}) {
    return (
        <section className={`rounded-2xl border border-slate-200/70 bg-slate-50/50 p-4 sm:p-5 ${className}`}>
            <SectionHeading icon={icon} title={title} hint={hint} />
            {bodyClassName ? <div className={bodyClassName}>{children}</div> : children}
        </section>
    );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return <textarea rows={4} {...props} className={fieldClass(props.className)} />;
}

/** Lists longer than this get a search box. */
const SEARCHABLE_FROM = 9;

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
    // The app's own dropdown instead of the browser's list; a search box once the list is long.
    const items = props.multiple ? null : readOptions(props.children);
    if (items) {
        return <SearchSelect {...props} items={items} searchable={items.length >= SEARCHABLE_FROM} className={fieldClass(props.className)} />;
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
    drawer = true,
}: {
    open: boolean;
    title: ReactNode;
    onClose: () => void;
    children: ReactNode;
    footer?: ReactNode;
    size?: 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
    /** Slide in from the right as a full-height panel (the default); false for a centred dialog. */
    drawer?: boolean;
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

    const widths = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl', xxl: 'max-w-[1600px]' };
    const head = (
        <div className="relative flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
            <span className="absolute inset-x-0 top-0 h-[3px] bg-[linear-gradient(90deg,var(--color-brand),var(--color-brand-light)_60%,var(--color-accent))]" />
            <h2 className="text-[17px] font-bold tracking-tight text-slate-800">{title}</h2>
            <IconButton label="Close" onClick={onClose} className="-mr-2 -mt-1 rounded-full">
                <X className="h-4 w-4" />
            </IconButton>
        </div>
    );
    const foot = footer && <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-3.5">{footer}</div>;

    if (drawer) {
        // The list stays in view on the left; the panel floats like the sidebar and scrolls inside.
        return createPortal(
            <div data-floating className="fade-in fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
                <div
                    role="dialog"
                    aria-modal="true"
                    className={`slide-in-right absolute bottom-2 right-2 top-2 flex w-[calc(100%-1rem)] flex-col overflow-hidden rounded-[22px] bg-white shadow-[-24px_0_60px_-20px_rgba(8,33,63,0.45)] ring-1 ring-slate-900/5 sm:bottom-3 sm:right-3 sm:top-3 ${widths[size]}`}
                >
                    {head}
                    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
                    {foot}
                </div>
            </div>,
            document.body,
        );
    }

    // Portalled to <body>: a parent with a backdrop filter or transform (the blurred header) would
    // otherwise trap this fixed overlay inside itself. data-floating keeps an opener menu open.
    return createPortal(
        <div data-floating className="fade-in fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/45 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div role="dialog" aria-modal="true" className={`pop-in my-4 w-full ${widths[size]} overflow-clip rounded-[22px] bg-white shadow-[0_30px_80px_-20px_rgba(8,33,63,0.45)] ring-1 ring-slate-900/5`}>
                {head}
                <div className="px-6 py-5">{children}</div>
                {foot}
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
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-xs font-semibold ring-1 ring-inset"
            style={{ color: option.color, backgroundColor: `${option.color}17`, ['--tw-ring-color' as string]: `${option.color}33` }}
        >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: option.color }} />
            {option.name}
        </span>
    );
}

export function Tag({ children }: { children: ReactNode }) {
    return <span className="inline-flex items-center rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200/70">{children}</span>;
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

/** Loading placeholder: shimmering rows in the shape of the list or panel that is on its way. */
export function Spinner({ className = '', rows = 5 }: { className?: string; rows?: number }) {
    return (
        <div role="status" aria-busy="true" className={`space-y-4 py-4 ${className}`}>
            <span className="sr-only">Loading…</span>
            {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="flex items-center gap-3" style={{ opacity: 1 - i * 0.12 }}>
                    <span className="skeleton h-9 w-9 shrink-0 rounded-xl" />
                    <div className="flex-1 space-y-2">
                        <span className={`skeleton block h-2.5 rounded-full ${SKELETON_WIDTHS[i % SKELETON_WIDTHS.length]}`} />
                        <span className="skeleton block h-2 w-1/3 rounded-full" />
                    </div>
                    <span className="skeleton hidden h-6 w-20 shrink-0 rounded-full sm:block" />
                </div>
            ))}
        </div>
    );
}

/** Shimmering grey block for custom loading layouts (cards, tiles). */
export function Skeleton({ className = '' }: { className?: string }) {
    return <span className={`skeleton block rounded-lg ${className}`} />;
}

/** A small inline busy indicator (buttons, one-line spots). */
export function InlineSpinner({ className = '' }: { className?: string }) {
    return <Loader2 className={`h-4 w-4 animate-spin text-brand/60 ${className}`} />;
}

/**
 * Nothing to show yet: a small brand illustration (a stack of cards with the page's icon on top,
 * orange sparkles), a title, a line of guidance and an optional first action.
 */
export function EmptyState({ title, text, action, icon: Icon = Inbox }: { title: string; text?: string; action?: ReactNode; icon?: LucideIcon }) {
    return (
        <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-white/80 px-6 py-12 text-center">
            <span className="pointer-events-none absolute -top-24 left-1/2 h-48 w-80 -translate-x-1/2 rounded-full bg-brand-50 opacity-70 blur-3xl" />
            <div className="relative mb-5 h-28 w-40" aria-hidden="true">
                <svg viewBox="0 0 160 112" className="absolute inset-0 h-full w-full">
                    <rect x="34" y="30" width="92" height="66" rx="12" fill="var(--color-brand-100)" transform="rotate(-8 80 63)" />
                    <rect x="30" y="24" width="100" height="72" rx="13" fill="var(--color-white)" stroke="var(--color-slate-200)" strokeWidth="1.5" transform="rotate(5 80 60)" />
                    <rect x="44" y="64" width="52" height="6" rx="3" fill="var(--color-slate-200)" transform="rotate(5 80 60)" />
                    <rect x="44" y="76" width="34" height="6" rx="3" fill="var(--color-slate-100)" transform="rotate(5 80 60)" />
                    <path d="M136 18l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5z" fill="#fa6010" />
                    <path d="M20 70l1.6 3.9 3.9 1.6-3.9 1.6L20 81l-1.6-3.9-3.9-1.6 3.9-1.6z" fill="#ff9a52" />
                    <circle cx="146" cy="58" r="3" fill="var(--color-brand-100)" />
                    <circle cx="14" cy="34" r="4" fill="var(--color-accent-50)" stroke="#ff9a52" strokeWidth="1.5" />
                </svg>
                <span className="absolute left-1/2 top-3 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-light))] text-white shadow-[0_12px_24px_-10px_rgba(11,44,86,0.8)]">
                    <Icon className="h-6 w-6" />
                </span>
            </div>
            <p className="relative text-[15px] font-bold text-slate-800">{title}</p>
            {text && <p className="relative mt-1 max-w-sm text-sm text-slate-500">{text}</p>}
            {action && <div className="relative mt-5">{action}</div>}
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
    return <div className={`rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_-14px_rgba(11,44,86,0.18)] ${className}`}>{children}</div>;
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
            <div className="inline-flex min-w-max gap-1 rounded-2xl bg-slate-100/80 p-1 ring-1 ring-inset ring-slate-200/70">
                {tabs.map((tab) => {
                    const on = active === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={on}
                            onClick={() => onChange(tab.id)}
                            className={`inline-flex items-center rounded-xl px-3.5 py-1.5 text-[13.5px] font-semibold transition ${
                                on ? 'bg-white text-brand shadow-[0_2px_8px_-2px_rgba(16,24,40,0.15)] ring-1 ring-slate-200/80' : 'text-slate-500 hover:bg-white/60 hover:text-slate-800'
                            }`}
                        >
                            {tab.label}
                            {tab.count !== undefined && (
                                <span className={`ml-1.5 rounded-full px-1.5 text-[11.5px] font-bold ${on ? 'bg-accent-50 text-accent' : 'bg-slate-200/70 text-slate-500'}`}>{tab.count}</span>
                            )}
                        </button>
                    );
                })}
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
export function Menu({
    trigger,
    children,
    align = 'right',
    block = false,
    up = false,
}: {
    trigger: (toggle: () => void) => ReactNode;
    children: (close: () => void) => ReactNode;
    align?: 'left' | 'right';
    block?: boolean;
    /** Open above the trigger (for triggers at the bottom of the screen). */
    up?: boolean;
}) {
    const { open, setOpen, ref } = usePopover();

    return (
        <div className={`relative ${block ? 'block w-full' : 'inline-block'}`} ref={ref}>
            {trigger(() => setOpen(!open))}
            {open && (
                <div
                    className={`pop-in absolute z-30 min-w-[12rem] rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-[0_20px_44px_-16px_rgba(8,33,63,0.35)] ${up ? 'bottom-full mb-2' : 'mt-2'} ${align === 'right' ? 'right-0' : 'left-0'}`}
                >
                    {children(() => setOpen(false))}
                </div>
            )}
        </div>
    );
}

export function MenuItem({ onClick, children, danger }: { onClick: () => void; children: ReactNode; danger?: boolean }) {
    return (
        <button type="button" onClick={onClick} className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm font-medium transition ${danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-brand-50 hover:text-brand'}`}>
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
            className={`relative overflow-hidden rounded-2xl border bg-white px-4 py-3.5 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_22px_-14px_rgba(11,44,86,0.2)] transition hover:-translate-y-0.5 hover:shadow-lg ${active ? 'border-brand ring-4 ring-brand/10' : 'border-slate-200/70'} ${muted ? 'opacity-60 hover:opacity-100' : ''}`}
        >
            <span className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: color ?? '#0b2c56' }} />
            <span className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-[0.08]" style={{ backgroundColor: color ?? '#0b2c56' }} />
            <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-500" title={label}>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color ?? '#0b2c56' }} />
                <span className="truncate">{label}</span>
            </p>
            <p className="mt-0.5 font-display text-[24px] font-extrabold leading-tight text-slate-800">{value}</p>
            {sub && <p className="text-[12px] text-slate-500">{sub}</p>}
        </button>
    );
}
