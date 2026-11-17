import { useEffect, useState, type DragEvent } from 'react';
import { ArrowDown, ArrowUp, ChevronRight, Eye, EyeOff, GripVertical, Lock, RotateCcw } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { ALWAYS_SHOWN, MENU_ICONS, SIDEBAR_DEFAULT, arrange, type MenuEntry } from '../../lib/menuSetup';
import { reloadAppOptions } from '../../hooks/useAppOptions';
import { Button, Input, Menu, Spinner, Tabs } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

/** A menu entry with its default, as given to the editor. */
export interface MenuDefault {
    id: string;
    label: string;
    icon?: string;
    children?: { id: string; label: string }[];
}

/** A row being edited. */
interface Row {
    id: string;
    defaultLabel: string;
    defaultIcon?: string;
    label: string;
    icon?: string;
    hidden: boolean;
    children?: Row[];
}

type Which = 'sidebar' | 'setup';

const SIDEBAR: MenuDefault[] = SIDEBAR_DEFAULT.map((d) => ({ id: d.id, label: d.label, icon: d.icon, children: d.children?.map((c) => ({ id: c.id, label: c.label })) }));

/** The defaults in the saved order, with the saved names, icons and hidden flags. */
function rows(defaults: MenuDefault[], saved: MenuEntry[] | null): Row[] {
    return arrange(defaults, saved).map(({ item, entry }) => ({
        id: item.id,
        defaultLabel: item.label,
        defaultIcon: item.icon,
        label: entry?.label ?? '',
        icon: entry?.icon,
        hidden: !!entry?.hidden,
        children: item.children ? arrange(item.children, entry?.children).map(({ item: c, entry: e }) => ({ id: c.id, defaultLabel: c.label, label: e?.label ?? '', hidden: !!e?.hidden })) : undefined,
    }));
}

/** What is saved: only what differs from the default, in the chosen order. */
function entries(list: Row[]): MenuEntry[] {
    return list.map((r) => ({
        id: r.id,
        ...(r.hidden ? { hidden: true } : {}),
        ...(r.label.trim() && r.label.trim() !== r.defaultLabel ? { label: r.label.trim() } : {}),
        ...(r.icon && r.icon !== r.defaultIcon ? { icon: r.icon } : {}),
        ...(r.children ? { children: entries(r.children) } : {}),
    }));
}

const move = <T,>(list: T[], from: number, to: number): T[] => {
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
};

/**
 * Setup → Menu Setup: drag (or the arrows) to reorder, rename, change a section's icon, hide what
 * the company does not use, or go back to the default. It only changes how the menu looks; who may
 * open a page still comes from Staff Permissions.
 */
export default function MenuSetup({ setupGroups }: { setupGroups: MenuDefault[] }) {
    const toast = useToast();
    const [which, setWhich] = useState<Which>('sidebar');
    const [saved, setSaved] = useState<Record<Which, MenuEntry[] | null> | null>(null);
    const [list, setList] = useState<Row[]>([]);
    const [open, setOpen] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const defaults = which === 'sidebar' ? SIDEBAR : setupGroups;

    useEffect(() => {
        api.get<{ data: Record<Which, MenuEntry[] | null> }>('/setup/menu')
            .then((r) => setSaved(r.data.data))
            .catch((e) => toast(errorMessage(e), 'error'));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (saved) {
            setList(rows(defaults, saved[which]));
            setOpen(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [saved, which]);

    if (!saved) {
        return <Spinner />;
    }

    const dirty = JSON.stringify(entries(list)) !== JSON.stringify(entries(rows(defaults, saved[which])));

    async function save(items: MenuEntry[] | null) {
        setSaving(true);
        try {
            const { data } = await api.put<{ message: string; data: MenuEntry[] | null }>(`/setup/menu/${which}`, { items });
            setSaved((s) => ({ ...s!, [which]: data.data }));
            reloadAppOptions();
            toast(data.message);
        } catch (e) {
            toast(errorMessage(e), 'error');
        } finally {
            setSaving(false);
        }
    }

    // Changes a top-level row, or one of its sub-entries when a parent is given.
    const update = (parent: string | null, id: string, change: Partial<Row>) =>
        setList((l) =>
            l.map((r) =>
                parent === null ? (r.id === id ? { ...r, ...change } : r) : r.id === parent ? { ...r, children: r.children!.map((c) => (c.id === id ? { ...c, ...change } : c)) } : r,
            ),
        );
    const reorder = (parent: string | null, from: number, to: number) =>
        setList((l) => (parent === null ? move(l, from, to) : l.map((r) => (r.id === parent ? { ...r, children: move(r.children!, from, to) } : r))));

    return (
        <div className="space-y-4">
            <div className="panel_s !mb-0">
                <div className="panel-body space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <Tabs
                            tabs={[
                                { id: 'sidebar' as Which, label: 'Sidebar menu' },
                                { id: 'setup' as Which, label: 'Setup menu' },
                            ]}
                            active={which}
                            onChange={(w) => (dirty && !confirm('Leave without saving your changes?') ? undefined : setWhich(w))}
                        />
                        <span className="text-[12.5px] text-slate-500">Drag rows (or use the arrows) to reorder · click the eye to hide or show.</span>
                    </div>
                    <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800 ring-1 ring-inset ring-amber-200">
                        This changes how the menu looks for everyone in your company. Hiding an entry does not stop anyone from opening that page: use <b>Staff Permissions</b> for that.
                    </p>

                    <RowList parent={null} items={list} icons={which === 'sidebar'} open={open} setOpen={setOpen} update={update} reorder={reorder} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 bg-slate-50/80 px-6 py-3">
                    <Button variant="secondary" onClick={() => confirm(`Put the ${which === 'sidebar' ? 'sidebar' : 'Setup'} menu back to the default order, names and icons?`) && save(null)} disabled={saving}>
                        <RotateCcw className="h-4 w-4" /> Reset to default
                    </Button>
                    <span className="flex items-center gap-3">
                        {dirty && <span className="text-[12.5px] font-medium text-amber-700">Unsaved changes</span>}
                        <Button onClick={() => save(entries(list))} loading={saving} disabled={!dirty}>
                            Save Menu
                        </Button>
                    </span>
                </div>
            </div>
        </div>
    );
}

function RowList({
    parent,
    items,
    icons,
    open,
    setOpen,
    update,
    reorder,
}: {
    parent: string | null;
    items: Row[];
    icons: boolean;
    open: string | null;
    setOpen: (id: string | null) => void;
    update: (parent: string | null, id: string, change: Partial<Row>) => void;
    reorder: (parent: string | null, from: number, to: number) => void;
}) {
    const [dragging, setDragging] = useState<number | null>(null);
    // Drag within this list only: the row moves as you pass over the others.
    const over = (e: DragEvent, index: number) => {
        if (dragging === null) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (index !== dragging) {
            reorder(parent, dragging, index);
            setDragging(index);
        }
    };

    return (
        <ul className={parent ? 'ml-9 mt-1.5 space-y-1.5 border-l-2 border-slate-100 pl-3' : 'space-y-1.5'}>
            {items.map((row, index) => {
                const locked = ALWAYS_SHOWN.includes(row.id);
                const Icon = icons && !parent ? MENU_ICONS[row.icon ?? row.defaultIcon ?? ''] : null;
                const expanded = open === row.id;

                return (
                    <li key={row.id} onDragOver={(e) => over(e, index)} onDrop={(e) => (e.preventDefault(), e.stopPropagation(), setDragging(null))}>
                        <div
                            draggable
                            onDragStart={(e) => {
                                e.stopPropagation();
                                e.dataTransfer.effectAllowed = 'move';
                                setDragging(index);
                            }}
                            onDragEnd={() => setDragging(null)}
                            className={`flex items-center gap-2 rounded-xl border bg-white px-2 py-1.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition ${dragging === index ? 'border-accent ring-2 ring-accent/30' : 'border-slate-200'} ${row.hidden ? 'opacity-55' : ''}`}
                        >
                            <span className="cursor-grab text-slate-300 active:cursor-grabbing" title="Drag to move">
                                <GripVertical className="h-4 w-4" />
                            </span>
                            <span className="flex flex-col">
                                <button type="button" aria-label="Move up" title="Move up" disabled={index === 0} onClick={() => reorder(parent, index, index - 1)} className="text-slate-400 hover:text-slate-700 disabled:opacity-25">
                                    <ArrowUp className="h-3.5 w-3.5" />
                                </button>
                                <button type="button" aria-label="Move down" title="Move down" disabled={index === items.length - 1} onClick={() => reorder(parent, index, index + 1)} className="text-slate-400 hover:text-slate-700 disabled:opacity-25">
                                    <ArrowDown className="h-3.5 w-3.5" />
                                </button>
                            </span>
                            {Icon && (
                                <Menu
                                    align="left"
                                    trigger={(toggle) => (
                                        <button type="button" onClick={toggle} title="Change the icon" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-200">
                                            <Icon className="h-4 w-4" />
                                        </button>
                                    )}
                                >
                                    {(close) => (
                                        <div className="grid w-64 grid-cols-6 gap-1 p-2">
                                            {Object.entries(MENU_ICONS).map(([name, Choice]) => (
                                                <button
                                                    key={name}
                                                    type="button"
                                                    title={name}
                                                    onClick={() => (update(parent, row.id, { icon: name }), close())}
                                                    className={`flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100 ${(row.icon ?? row.defaultIcon) === name ? 'bg-accent-50 text-accent ring-1 ring-accent/40' : 'text-slate-600'}`}
                                                >
                                                    <Choice className="h-4 w-4" />
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </Menu>
                            )}
                            <Input
                                value={row.label}
                                placeholder={row.defaultLabel}
                                maxLength={60}
                                aria-label={`Name for ${row.defaultLabel}`}
                                onChange={(e) => update(parent, row.id, { label: e.target.value })}
                                className="!h-9 min-w-0 flex-1 !py-1"
                            />
                            {row.label.trim() && row.label.trim() !== row.defaultLabel && <span className="hidden shrink-0 text-[11.5px] text-slate-400 sm:inline">was {row.defaultLabel}</span>}
                            {row.children && (
                                <button
                                    type="button"
                                    onClick={() => setOpen(expanded ? null : row.id)}
                                    className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium text-slate-500 hover:bg-slate-100"
                                    aria-expanded={expanded}
                                >
                                    {row.children.filter((c) => !c.hidden).length}/{row.children.length}
                                    <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                                </button>
                            )}
                            {locked ? (
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center text-slate-300" title="Always shown, so Setup stays reachable">
                                    <Lock className="h-4 w-4" />
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => update(parent, row.id, { hidden: !row.hidden })}
                                    title={row.hidden ? 'Hidden: click to show' : 'Shown: click to hide'}
                                    aria-label={row.hidden ? `Show ${row.defaultLabel}` : `Hide ${row.defaultLabel}`}
                                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${row.hidden ? 'bg-slate-100 text-slate-400' : 'text-emerald-600 hover:bg-emerald-50'}`}
                                >
                                    {row.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            )}
                        </div>
                        {row.children && expanded && <RowList parent={row.id} items={row.children} icons={false} open={null} setOpen={() => undefined} update={update} reorder={reorder} />}
                    </li>
                );
            })}
        </ul>
    );
}
