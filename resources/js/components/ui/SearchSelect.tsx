import { Children, Fragment, isValidElement, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type ReactElement, type ReactNode, type SelectHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';

export type SelectItem = { value: string; label: string; disabled: boolean; group?: string };

const text = (node: ReactNode): string =>
    node === null || node === undefined || typeof node === 'boolean'
        ? ''
        : typeof node === 'string' || typeof node === 'number'
          ? String(node)
          : Array.isArray(node)
            ? node.map(text).join('')
            : isValidElement(node)
              ? text((node.props as { children?: ReactNode }).children)
              : '';

/**
 * The <option>s (also inside <optgroup> and fragments) of a <select>'s children; null when it holds
 * anything else, so the caller keeps the native select.
 */
export function readOptions(children: ReactNode, group?: string): SelectItem[] | null {
    const items: SelectItem[] = [];
    for (const child of Children.toArray(children)) {
        if (!isValidElement(child)) {
            continue;
        }
        const el = child as ReactElement<{ value?: unknown; children?: ReactNode; disabled?: boolean; label?: string }>;
        if (el.type === 'option') {
            const label = text(el.props.children);
            items.push({ value: el.props.value === undefined ? label : String(el.props.value), label, disabled: !!el.props.disabled, group });
        } else if (el.type === 'optgroup' || el.type === Fragment) {
            const inner = readOptions(el.props.children, el.type === 'optgroup' ? el.props.label : group);
            if (!inner) {
                return null;
            }
            items.push(...inner);
        } else {
            return null;
        }
    }

    return items;
}

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & { items: SelectItem[] };

/**
 * A select with a search box, for long lists (customers, projects, staff, countries…). It stands in
 * for <select>, so callers keep reading `e.target.value`.
 */
export default function SearchSelect({ items, value, onChange, disabled, className = '', id, title }: Props) {
    const current = value === undefined || value === null ? '' : String(value);
    const selected = items.find((i) => i.value === current);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
    const button = useRef<HTMLButtonElement>(null);
    const pop = useRef<HTMLDivElement>(null);
    const search = useRef<HTMLInputElement>(null);
    const list = useRef<HTMLDivElement>(null);

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();

        return q ? items.filter((i) => i.label.toLowerCase().includes(q) || i.group?.toLowerCase().includes(q)) : items;
    }, [items, query]);

    const emit = (next: string) => onChange?.({ target: { value: next }, currentTarget: { value: next } } as unknown as ChangeEvent<HTMLSelectElement>);

    useLayoutEffect(() => {
        if (!open || !button.current) {
            return;
        }
        const place = () => {
            const r = button.current!.getBoundingClientRect();
            const width = Math.max(r.width, 240);
            const spaceBelow = window.innerHeight - r.bottom - 12;
            const below = spaceBelow >= 260 || spaceBelow >= r.top - 12;
            const maxHeight = Math.min(360, below ? spaceBelow : r.top - 12);
            setPos({ top: below ? r.bottom + 6 : r.top - 6 - Math.min(maxHeight, pop.current?.offsetHeight ?? maxHeight), left: Math.min(Math.max(8, r.left), window.innerWidth - width - 8), width, maxHeight });
        };
        place();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);

        return () => {
            window.removeEventListener('resize', place);
            window.removeEventListener('scroll', place, true);
        };
    }, [open, shown.length]);

    useEffect(() => {
        if (!open) {
            return;
        }
        const away = (e: MouseEvent) => !pop.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node) && setOpen(false);
        // Escape closes this list only, not the modal it sits in.
        const esc = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), setOpen(false), button.current?.focus());
        document.addEventListener('mousedown', away);
        document.addEventListener('keydown', esc, true);
        setTimeout(() => search.current?.focus(), 0);

        return () => {
            document.removeEventListener('mousedown', away);
            document.removeEventListener('keydown', esc, true);
        };
    }, [open]);

    useEffect(() => {
        list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [active, open]);

    function show(initial = '') {
        if (disabled) {
            return;
        }
        setQuery(initial);
        const at = initial ? 0 : Math.max(0, items.findIndex((i) => i.value === current));
        setActive(at);
        setPos(null);
        setOpen(true);
    }

    function close(refocus = true) {
        setOpen(false);
        if (refocus) {
            button.current?.focus();
        }
    }

    function pick(item: SelectItem | undefined) {
        if (!item || item.disabled) {
            return;
        }
        if (item.value !== current) {
            emit(item.value);
        }
        close();
    }

    function onListKey(e: React.KeyboardEvent) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(shown.length - 1, i + 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            pick(shown[active]);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            close();
        } else if (e.key === 'Tab') {
            close(false);
        }
    }

    function onButtonKey(e: React.KeyboardEvent) {
        if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            show();
        } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            show(e.key);
        }
    }

    let lastGroup: string | undefined;

    return (
        <>
            <button
                ref={button}
                id={id}
                type="button"
                title={title ?? selected?.label}
                disabled={disabled}
                onClick={() => (open ? close() : show())}
                onKeyDown={onButtonKey}
                aria-haspopup="listbox"
                aria-expanded={open}
                className={`${className} relative flex items-center pr-8 text-left ${open ? 'border-brand ring-4 ring-brand/10' : ''}`}
            >
                <span className={`block truncate ${selected && selected.value !== '' ? '' : 'text-slate-500'}`}>{selected?.label || ' '}</span>
                <ChevronDown className={`absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition ${open ? 'rotate-180' : ''}`} />
            </button>
            {open &&
                createPortal(
                    <div
                        ref={pop}
                        data-floating
                        onKeyDown={onListKey}
                        onClick={(e) => e.stopPropagation()}
                        style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: pos?.width, maxHeight: pos?.maxHeight }}
                        className="fixed z-[200] flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
                    >
                        <div className="relative border-b border-slate-100 p-2">
                            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                                ref={search}
                                value={query}
                                onChange={(e) => (setQuery(e.target.value), setActive(0))}
                                placeholder="Search…"
                                className="w-full rounded-lg bg-slate-50 py-1.5 pl-8 pr-2 text-[13.5px] text-slate-800 outline-none ring-1 ring-slate-200 focus:bg-white focus:ring-brand/40"
                                role="combobox"
                                aria-expanded="true"
                                aria-autocomplete="list"
                            />
                        </div>
                        <div ref={list} role="listbox" className="min-h-0 flex-1 overflow-y-auto p-1">
                            {shown.length === 0 && <p className="px-3 py-2.5 text-[13px] text-slate-500">No matches</p>}
                            {shown.map((item, i) => {
                                const heading = item.group && item.group !== lastGroup ? item.group : null;
                                lastGroup = item.group;
                                const isSelected = item.value === current;

                                return (
                                    <Fragment key={`${item.group ?? ''}-${item.value}-${i}`}>
                                        {heading && <p className="px-2.5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">{heading}</p>}
                                        <button
                                            type="button"
                                            data-index={i}
                                            role="option"
                                            aria-selected={isSelected}
                                            disabled={item.disabled}
                                            onMouseMove={() => i !== active && setActive(i)}
                                            onClick={() => pick(item)}
                                            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13.5px] ${item.disabled ? 'cursor-not-allowed text-slate-300' : i === active ? 'bg-brand-50 text-brand' : 'text-slate-700'} ${isSelected ? 'font-semibold' : ''}`}
                                        >
                                            <span className={`min-w-0 flex-1 truncate ${item.value === '' ? 'text-slate-500' : ''}`}>{item.label || ' '}</span>
                                            {isSelected && <Check className="h-4 w-4 shrink-0 text-brand" />}
                                        </button>
                                    </Fragment>
                                );
                            })}
                        </div>
                    </div>,
                    document.body,
                )}
        </>
    );
}
