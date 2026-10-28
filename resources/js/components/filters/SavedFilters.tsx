import { useEffect, useRef, useState } from 'react';
import { Bookmark, Check, ChevronDown, Pencil, Star, Trash2, Users } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { Button, Checkbox, Field, Input, Menu, Modal } from '../ui';
import { useToast } from '../ui/Toast';

export type FilterValues = Record<string, unknown>;
type Saved = { id: number; name: string; filters: FilterValues; is_shared: boolean; is_own: boolean; is_default: boolean; can_manage: boolean; author: string | null };

/** Same filters? Empty and missing count as equal (the server stores empty text as null). */
const normalise = (f: FilterValues) =>
    JSON.stringify(
        Object.keys(f)
            .sort()
            .filter((k) => f[k] !== null && f[k] !== undefined && f[k] !== '')
            .map((k) => [k, f[k]]),
    );
const same = (a: FilterValues, b: FilterValues) => normalise(a) === normalise(b);

/**
 * Perfex saved filters for a list: apply one of mine or the team's shared ones, save the list's
 * current filters under a name, share them, and pick a default that applies when the list opens.
 */
export default function SavedFilters({ identifier, current, onApply }: { identifier: string; current: FilterValues; onApply: (filters: FilterValues) => void }) {
    const toast = useToast();
    const [rows, setRows] = useState<Saved[]>([]);
    const [active, setActive] = useState<Saved | null>(null);
    const [form, setForm] = useState<{ id?: number; name: string; is_shared: boolean; is_default: boolean; useCurrent: boolean } | null>(null);
    const appliedDefault = useRef(false);

    const load = () =>
        api.get<{ data: Saved[] }>('/saved-filters', { params: { identifier } }).then((r) => {
            setRows(r.data.data);
            const def = r.data.data.find((f) => f.is_default);
            if (def && !appliedDefault.current) {
                appliedDefault.current = true;
                apply(def);
            }
            return r.data.data;
        });

    useEffect(() => {
        load().catch(() => undefined);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [identifier]);

    function apply(f: Saved) {
        setActive(f);
        onApply(f.filters);
    }

    async function save() {
        if (!form) {
            return;
        }
        try {
            const body = { name: form.name, is_shared: form.is_shared, is_default: form.is_default, ...(form.useCurrent ? { filters: current } : {}) };
            const r = form.id ? await api.put<{ data: Saved }>(`/saved-filters/${form.id}`, body) : await api.post<{ data: Saved }>('/saved-filters', { ...body, identifier, filters: current });
            toast(form.id ? 'Filter updated.' : 'Filter saved.');
            setForm(null);
            setActive(r.data.data);
            await load();
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    async function toggleDefault(f: Saved) {
        try {
            await api.put(`/saved-filters/${f.id}`, { is_default: !f.is_default });
            toast(f.is_default ? 'No default filter for this list.' : `"${f.name}" opens by default.`);
            await load();
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    async function remove(f: Saved) {
        if (!confirm(`Delete the filter "${f.name}"?`)) {
            return;
        }
        await api.delete(`/saved-filters/${f.id}`);
        if (active?.id === f.id) {
            setActive(null);
        }
        await load();
    }

    const isActive = active && same(active.filters, current);

    return (
        <>
            <Menu
                align="right"
                trigger={(toggle) => (
                    <Button variant="secondary" onClick={toggle} className={isActive ? '!border-brand !text-brand' : ''}>
                        <Bookmark className={`h-4 w-4 ${isActive ? 'fill-accent text-accent' : ''}`} />
                        <span className="max-w-[10rem] truncate">{isActive ? active.name : 'Saved filters'}</span>
                        <ChevronDown className="h-4 w-4" />
                    </Button>
                )}
            >
                {(close) => (
                    <div className="w-72 py-1">
                        {rows.length === 0 && <p className="px-3 py-2 text-[13px] text-gray-500">No saved filters yet.</p>}
                        {rows.map((f) => (
                            <div key={f.id} className="group flex items-center gap-1 px-2 hover:bg-gray-50">
                                <button type="button" onClick={() => (close(), apply(f))} className="flex min-w-0 flex-1 items-center gap-2 py-2 pl-1 text-left text-[13.5px]">
                                    <Check className={`h-3.5 w-3.5 shrink-0 ${isActive && active?.id === f.id ? 'text-blue-600' : 'text-transparent'}`} />
                                    <span className="min-w-0">
                                        <span className="block truncate">{f.name}</span>
                                        {!f.is_own && <span className="block truncate text-[11px] text-gray-400">shared by {f.author}</span>}
                                    </span>
                                    {f.is_shared && f.is_own && <Users className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-label="Shared with the team" />}
                                </button>
                                <button type="button" onClick={() => toggleDefault(f)} className={`rounded p-1 ${f.is_default ? 'text-amber-500' : 'text-gray-300 hover:text-amber-500'}`} title={f.is_default ? 'Default (click to remove)' : 'Open this list with this filter'}>
                                    <Star className={`h-3.5 w-3.5 ${f.is_default ? 'fill-current' : ''}`} />
                                </button>
                                {f.can_manage && (
                                    <>
                                        <button type="button" onClick={() => (close(), setForm({ id: f.id, name: f.name, is_shared: f.is_shared, is_default: f.is_default, useCurrent: false }))} className="rounded p-1 text-gray-300 hover:text-gray-700" title="Edit">
                                            <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                        <button type="button" onClick={() => (close(), remove(f))} className="rounded p-1 text-gray-300 hover:text-red-600" title="Delete">
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </>
                                )}
                            </div>
                        ))}
                        <div className="mt-1 border-t border-gray-100 pt-1">
                            <button type="button" onClick={() => (close(), setForm({ name: '', is_shared: false, is_default: false, useCurrent: true }))} className="block w-full px-3 py-2 text-left text-[13.5px] font-medium text-blue-600 hover:bg-gray-50">
                                + Save current filters…
                            </button>
                            {active && !isActive && active.can_manage && (
                                <button type="button" onClick={() => (close(), setForm({ id: active.id, name: active.name, is_shared: active.is_shared, is_default: active.is_default, useCurrent: true }))} className="block w-full px-3 py-2 text-left text-[13.5px] text-gray-700 hover:bg-gray-50">
                                    Update “{active.name}” with current filters
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </Menu>

            {form && (
                <Modal
                    open
                    title={form.id ? 'Edit filter' : 'Save filter'}
                    onClose={() => setForm(null)}
                    footer={
                        <>
                            <Button variant="secondary" onClick={() => setForm(null)}>
                                Cancel
                            </Button>
                            <Button onClick={save} disabled={!form.name.trim()}>
                                Save
                            </Button>
                        </>
                    }
                >
                    <div className="space-y-3">
                        <Field label="Name" required>
                            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. My open tasks" autoFocus />
                        </Field>
                        <div className="flex flex-col gap-2">
                            <Checkbox label="Share with the team" checked={form.is_shared} onChange={(v) => setForm({ ...form, is_shared: v })} />
                            <Checkbox label="Open this list with this filter (default)" checked={form.is_default} onChange={(v) => setForm({ ...form, is_default: v })} />
                        </div>
                        {form.useCurrent && <p className="text-xs text-gray-500">Saves the list's current filters, status choices and search.</p>}
                    </div>
                </Modal>
            )}
        </>
    );
}

/** Reading saved values back (old saves may miss newer fields). */
export const savedText = (v: unknown) => (v === null || v === undefined ? '' : String(v));
export const savedIds = (v: unknown, fallback: number[] = []) => (Array.isArray(v) ? v.map(Number) : fallback);
