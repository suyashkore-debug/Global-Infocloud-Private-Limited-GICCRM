import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, MoreHorizontal, Plus, Users } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { Button, Checkbox, Field, Input, MenuItem, Modal } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import type { FilterRule, LeadSort } from './LeadFilters';
import { confirmDialog } from '../../components/ui/Dialogs';

/**
 * A dropdown drawn over the page (like Menu), so the scrolling tabs row does not cut it off.
 */
function FloatMenu({ trigger, children, align = 'right' }: { trigger: (toggle: () => void) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right' }) {
    const anchor = useRef<HTMLSpanElement>(null);
    const box = useRef<HTMLDivElement>(null);
    const [at, setAt] = useState<{ top: number; left?: number; right?: number } | null>(null);
    const close = () => setAt(null);
    const toggle = () => {
        if (at) {
            return close();
        }
        const r = anchor.current!.getBoundingClientRect();
        setAt(align === 'left' ? { top: r.bottom + 6, left: Math.max(8, r.left) } : { top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    };

    useEffect(() => {
        if (!at) {
            return;
        }
        const outside = (e: MouseEvent) => !box.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node) && close();
        const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
        document.addEventListener('mousedown', outside);
        document.addEventListener('keydown', key);
        window.addEventListener('resize', close);

        return () => {
            document.removeEventListener('mousedown', outside);
            document.removeEventListener('keydown', key);
            window.removeEventListener('resize', close);
        };
    }, [at]);

    return (
        <span ref={anchor} className="inline-flex">
            {trigger(toggle)}
            {at &&
                createPortal(
                    <div ref={box} className="pop-in fixed z-50 min-w-[12rem] rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-[0_20px_44px_-16px_rgba(8,33,63,0.35)]" style={at}>
                        {children(close)}
                    </div>,
                    document.body,
                )}
        </span>
    );
}

/** What a view shows: its filter rules and sort. */
export type ViewState = { rules: FilterRule[]; sort: LeadSort };

export type LeadView = { id: string; name: string; state: ViewState; saved?: SavedView };

type SavedView = { id: number; name: string; filters: Record<string, unknown>; is_shared: boolean; can_manage: boolean; author: string | null };

export const DEFAULT_SORT: LeadSort = { sort: 'created_at', dir: 'desc' };

/** Older saved filters (status chips, staff and source pickers, quick filters) read as rules. */
function toState(filters: Record<string, unknown>, meId: number): ViewState {
    const rules: FilterRule[] = Array.isArray(filters.rules) ? [...(filters.rules as FilterRule[])] : [];
    const sort = (filters.sort as LeadSort | undefined)?.sort ? (filters.sort as LeadSort) : DEFAULT_SORT;
    if (filters.assigned) {
        rules.push({ field: 'assigned_id', op: 'is', value: [String(filters.assigned)] });
    }
    if (filters.source) {
        rules.push({ field: 'lead_source_id', op: 'in', value: [String(filters.source)] });
    }
    if (Array.isArray(filters.statuses) && filters.statuses.length) {
        rules.push({ field: 'lead_status_id', op: 'in', value: filters.statuses.map(String) });
    }
    const quick: Record<string, FilterRule> = {
        my_leads: { field: 'assigned_id', op: 'is', value: [String(meId)] },
        not_assigned: { field: 'assigned_id', op: 'empty' },
        public: { field: 'is_public', op: 'is', value: '1' },
        contacted_today: { field: 'last_contact_at', op: 'today' },
        created_today: { field: 'created_at', op: 'today' },
        lost: { field: 'lost', op: 'is', value: '1' },
        junk: { field: 'junk', op: 'is', value: '1' },
    };
    if (typeof filters.filter === 'string' && quick[filters.filter]) {
        rules.push(quick[filters.filter]);
    }

    return { rules, sort };
}

/** The ready-made views, then the saved ones (mine and the team's shared ones). */
export function useLeadViews(meId: number, wonStatusId: number | null) {
    const saved = useApi<{ data: SavedView[] }>('/saved-filters', { identifier: 'leads' });
    const builtIn: LeadView[] = [
        { id: 'all', name: 'All Leads', state: { rules: [], sort: DEFAULT_SORT } },
        {
            id: 'active',
            name: 'All Active Leads',
            state: { rules: wonStatusId ? [{ field: 'lead_status_id', op: 'not_in', value: [String(wonStatusId)] }] : [], sort: DEFAULT_SORT },
        },
        { id: 'assigned_me', name: 'Leads Assigned To Me', state: { rules: [{ field: 'assigned_id', op: 'is', value: [String(meId)] }], sort: DEFAULT_SORT } },
        { id: 'mine', name: 'My Leads', state: { rules: [{ field: 'created_by', op: 'is', value: [String(meId)] }], sort: DEFAULT_SORT } },
    ];
    const views = [...builtIn, ...(saved.data?.data ?? []).map((s) => ({ id: `saved-${s.id}`, name: s.name, state: toState(s.filters ?? {}, meId), saved: s }))];

    return { views, loaded: !!saved.data || !!saved.error, reload: saved.reload };
}

const asFilters = (state: ViewState) => ({ rules: state.rules, sort: state.sort });

/**
 * The views bar: built-in and saved views as tabs (the first few, the rest under "+N more"), a
 * "⋯" menu on the open saved view (save changes, rename, share, delete) and "+" for a new view.
 */
export function ViewTabs({
    views,
    active,
    current,
    dirty,
    saveSignal,
    onSelect,
    onChanged,
}: {
    views: LeadView[];
    active: string;
    current: ViewState;
    dirty: boolean;
    /** Bumped by the toolbar's Save button: save the open view, or name a new one. */
    saveSignal: number;
    onSelect: (view: LeadView) => void;
    onChanged: (selectId?: string) => void;
}) {
    const toast = useToast();
    const [editing, setEditing] = useState<{ view: LeadView | null } | null>(null);
    const inline = 7;
    const activeIndex = views.findIndex((v) => v.id === active);
    // The open view stays visible even when it would fall under "+N more".
    const shown = views.slice(0, inline).concat(activeIndex >= inline ? [views[activeIndex]] : []);
    const hidden = views.filter((v, i) => i >= inline && i !== activeIndex);

    async function update(view: LeadView, body: Record<string, unknown>, message: string) {
        try {
            await api.put(`/saved-filters/${view.saved!.id}`, body);
            toast(message);
            onChanged(view.id);
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    useEffect(() => {
        if (saveSignal === 0) {
            return;
        }
        const view = views[activeIndex];
        if (view?.saved?.can_manage) {
            update(view, { filters: asFilters(current) }, 'View saved.');
        } else {
            setEditing({ view: null });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [saveSignal]);

    async function remove(view: LeadView) {
        if (!(await confirmDialog(`Delete the view "${view.name}"?`))) {
            return;
        }
        try {
            await api.delete(`/saved-filters/${view.saved!.id}`);
            toast('View deleted.');
            onChanged('all');
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    return (
        <div className="flex items-end gap-1 overflow-x-auto border-b border-slate-200 scrollbar-none">
            {shown.map((view) => {
                const on = view.id === active;
                return (
                    <div key={view.id} className={`relative flex shrink-0 items-center gap-1 border-b-2 px-3 pb-2.5 pt-1.5 ${on ? 'border-brand' : 'border-transparent'}`}>
                        <button
                            type="button"
                            onClick={() => onSelect(view)}
                            className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[13.5px] font-semibold ${on ? 'text-brand' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            <Users className="h-3.5 w-3.5" />
                            {view.name}
                            {on && dirty && <span className="h-1.5 w-1.5 rounded-full bg-accent" title="Changed, not saved" />}
                        </button>
                        {on && view.saved?.can_manage && (
                            <FloatMenu
                                align="left"
                                trigger={(toggle) => (
                                    <button type="button" onClick={toggle} className="rounded-md bg-brand-50 p-0.5 text-brand hover:bg-brand-100" aria-label="View options">
                                        <MoreHorizontal className="h-4 w-4" />
                                    </button>
                                )}
                            >
                                {(close) => (
                                    <>
                                        {dirty && (
                                            <MenuItem onClick={() => (close(), update(view, { filters: asFilters(current) }, 'View saved.'))}>Save changes to this view</MenuItem>
                                        )}
                                        <MenuItem onClick={() => (close(), setEditing({ view }))}>Rename / share</MenuItem>
                                        <MenuItem
                                            onClick={() => (
                                                close(),
                                                update(view, { is_shared: !view.saved!.is_shared }, view.saved!.is_shared ? 'View is now private.' : 'View shared with the team.')
                                            )}
                                        >
                                            {view.saved!.is_shared ? 'Stop sharing' : 'Share with the team'}
                                        </MenuItem>
                                        <MenuItem danger onClick={() => (close(), remove(view))}>
                                            Delete view
                                        </MenuItem>
                                    </>
                                )}
                            </FloatMenu>
                        )}
                    </div>
                );
            })}
            {hidden.length > 0 && (
                <div className="mb-1.5 shrink-0">
                    <FloatMenu
                        trigger={(toggle) => (
                            <button
                                type="button"
                                onClick={toggle}
                                className="inline-flex items-center gap-1 rounded-lg border border-brand/30 px-2.5 py-1 text-[13px] font-semibold text-brand hover:bg-brand-50"
                            >
                                +{hidden.length} more <ChevronDown className="h-3.5 w-3.5" />
                            </button>
                        )}
                    >
                        {(close) => (
                            <div className="max-h-72 overflow-y-auto">
                                {hidden.map((v) => (
                                    <MenuItem key={v.id} onClick={() => (close(), onSelect(v))}>
                                        {v.name}
                                        {v.saved?.author && !v.saved.can_manage && <span className="ml-auto text-[11px] text-slate-400">{v.saved.author}</span>}
                                    </MenuItem>
                                ))}
                            </div>
                        )}
                    </FloatMenu>
                </div>
            )}
            <button
                type="button"
                onClick={() => setEditing({ view: null })}
                className="mb-1.5 ml-1 shrink-0 rounded-lg bg-brand-50 p-1.5 text-brand ring-1 ring-brand-100 hover:bg-brand-100"
                title="Save the current filters as a new view"
            >
                <Plus className="h-4 w-4" />
            </button>
            {editing && (
                <ViewForm
                    view={editing.view}
                    current={current}
                    onClose={() => setEditing(null)}
                    onSaved={(id) => {
                        setEditing(null);
                        onChanged(id);
                    }}
                />
            )}
        </div>
    );
}

/** New view (from the current filters), or rename / share a saved one. */
function ViewForm({ view, current, onClose, onSaved }: { view: LeadView | null; current: ViewState; onClose: () => void; onSaved: (id: string) => void }) {
    const toast = useToast();
    const [name, setName] = useState(view?.name ?? '');
    const [shared, setShared] = useState(view?.saved?.is_shared ?? false);
    const [saving, setSaving] = useState(false);

    async function save() {
        setSaving(true);
        try {
            if (view?.saved) {
                await api.put(`/saved-filters/${view.saved.id}`, { name, is_shared: shared });
                toast('View updated.');
                onSaved(view.id);
            } else {
                const { data } = await api.post<{ data: { id: number } }>('/saved-filters', { identifier: 'leads', name, filters: asFilters(current), is_shared: shared });
                toast('View saved.');
                onSaved(`saved-${data.data.id}`);
            }
        } catch (e) {
            toast(errorMessage(e), 'error');
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal
            open
            size="sm"
            title={view ? 'Rename view' : 'New view'}
            onClose={onClose}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={save} loading={saving} disabled={!name.trim()}>
                        Save view
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                {!view && (
                    <p className="text-[13px] text-slate-500">
                        The view keeps the current filter conditions and sort ({current.rules.length} condition{current.rules.length === 1 ? '' : 's'}).
                    </p>
                )}
                <Field label="View name" required>
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Hot leads in Pune"
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && name.trim() && save()}
                    />
                </Field>
                <Checkbox label="Share with the team (everyone sees this view)" checked={shared} onChange={setShared} />
            </div>
        </Modal>
    );
}
