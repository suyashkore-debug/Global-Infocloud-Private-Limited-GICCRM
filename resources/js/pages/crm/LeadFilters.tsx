import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownUp, Filter, Plus, Search, X } from 'lucide-react';
import { COUNTRIES } from '../../lib/countries';
import { useStaff } from '../../hooks/useStaff';
import { Button, Input, Menu, Select } from '../../components/ui';
import { fetchDefinitions, type CustomFieldDef } from '../../components/customfields/CustomFields';

export type FilterRule = { field: string; op: string; value?: string | string[]; value2?: string };

export type LeadSort = { sort: string; dir: 'asc' | 'desc' };

type Kind = 'text' | 'boolean' | 'date' | 'number' | 'multi' | 'staff' | 'country';

type Option = { id: number; name: string };

export type FilterContext = { statuses: Option[]; sources: Option[] };

const OPS: Record<Kind, { value: string; label: string }[]> = {
    text: [
        { value: 'contains', label: 'Contains' },
        { value: 'equals', label: 'Is' },
        { value: 'starts_with', label: 'Starts with' },
        { value: 'ends_with', label: 'Ends with' },
        { value: 'not_contains', label: 'Does not contain' },
        { value: 'empty', label: 'Is empty' },
        { value: 'not_empty', label: 'Is not empty' },
    ],
    country: [
        { value: 'equals', label: 'Is' },
        { value: 'empty', label: 'Is empty' },
        { value: 'not_empty', label: 'Is not empty' },
    ],
    boolean: [{ value: 'is', label: 'Is' }],
    date: [
        { value: 'overdue', label: 'Overdue (before now)' },
        { value: 'today', label: 'Today' },
        { value: 'tomorrow', label: 'Tomorrow' },
        { value: 'next_7_days', label: 'Next 7 days' },
        { value: 'yesterday', label: 'Yesterday' },
        { value: 'this_week', label: 'This week' },
        { value: 'last_7_days', label: 'Last 7 days' },
        { value: 'this_month', label: 'This month' },
        { value: 'last_30_days', label: 'Last 30 days' },
        { value: 'on', label: 'Is on' },
        { value: 'before', label: 'Is before' },
        { value: 'after', label: 'Is after' },
        { value: 'between', label: 'Is between' },
        { value: 'empty', label: 'Is empty' },
        { value: 'not_empty', label: 'Is not empty' },
    ],
    number: [
        { value: '=', label: '=' },
        { value: '!=', label: '≠' },
        { value: '>', label: '>' },
        { value: '>=', label: '≥' },
        { value: '<', label: '<' },
        { value: '<=', label: '≤' },
        { value: 'between', label: 'Between' },
        { value: 'empty', label: 'Is empty' },
    ],
    multi: [
        { value: 'in', label: 'Is' },
        { value: 'not_in', label: 'Is Not' },
    ],
    staff: [
        { value: 'is', label: 'Is' },
        { value: 'is_not', label: 'Is Not' },
        { value: 'empty', label: 'Is empty' },
        { value: 'not_empty', label: 'Is not empty' },
    ],
};

/** The fields a lead can be filtered by, with their kind. */
const BASE_FIELDS: { field: string; label: string; kind: Kind }[] = [
    { field: 'lead_status_id', label: 'Lead Status', kind: 'multi' },
    { field: 'lead_source_id', label: 'Source', kind: 'multi' },
    { field: 'assigned_id', label: 'Assignee', kind: 'staff' },
    { field: 'created_by', label: 'Created By', kind: 'staff' },
    { field: 'name', label: 'Name', kind: 'text' },
    { field: 'company', label: 'Company', kind: 'text' },
    { field: 'email', label: 'Email', kind: 'text' },
    { field: 'phone', label: 'Phone', kind: 'text' },
    { field: 'title', label: 'Position', kind: 'text' },
    { field: 'website', label: 'Website', kind: 'text' },
    { field: 'city', label: 'City', kind: 'text' },
    { field: 'state', label: 'State', kind: 'text' },
    { field: 'country', label: 'Country', kind: 'country' },
    { field: 'zip', label: 'Zip Code', kind: 'text' },
    { field: 'lead_value', label: 'Lead Value', kind: 'number' },
    { field: 'created_at', label: 'Created On', kind: 'date' },
    { field: 'updated_at', label: 'Updated On', kind: 'date' },
    { field: 'last_contact_at', label: 'Last Contact', kind: 'date' },
    { field: 'next_follow_up_at', label: 'Next Follow-up', kind: 'date' },
    { field: 'last_status_change_at', label: 'Status Changed On', kind: 'date' },
    { field: 'assigned_at', label: 'Date Assigned', kind: 'date' },
    { field: 'is_public', label: 'Public', kind: 'boolean' },
    { field: 'lost', label: 'Lost', kind: 'boolean' },
    { field: 'junk', label: 'Junk', kind: 'boolean' },
];

/** What the list can be sorted by, and how each direction reads. */
export const SORTS: { value: string; label: string; desc: string; asc: string }[] = [
    { value: 'created_at', label: 'Created On', desc: 'Newest First', asc: 'Oldest First' },
    { value: 'updated_at', label: 'Updated On', desc: 'Newest First', asc: 'Oldest First' },
    { value: 'last_contact_at', label: 'Last Contact', desc: 'Newest First', asc: 'Oldest First' },
    { value: 'next_follow_up_at', label: 'Next Follow-up', desc: 'Latest First', asc: 'Soonest First' },
    { value: 'last_status_change_at', label: 'Status Changed On', desc: 'Newest First', asc: 'Oldest First' },
    { value: 'assigned_at', label: 'Date Assigned', desc: 'Newest First', asc: 'Oldest First' },
    { value: 'name', label: 'Name', desc: 'Z → A', asc: 'A → Z' },
    { value: 'company', label: 'Company', desc: 'Z → A', asc: 'A → Z' },
    { value: 'lead_value', label: 'Lead Value', desc: 'Highest First', asc: 'Lowest First' },
];

const needsNoValue = (op: string) => ['empty', 'not_empty', 'today', 'yesterday', 'this_week', 'last_7_days', 'this_month', 'last_30_days', 'overdue', 'tomorrow', 'next_7_days'].includes(op);

const asList = (v: FilterRule['value']) => (Array.isArray(v) ? v : v ? [String(v)] : []);

/** A rule has what it needs to filter. */
export const ruleIsComplete = (r: FilterRule) => needsNoValue(r.op) || (Array.isArray(r.value) ? r.value.length > 0 : String(r.value ?? '').trim() !== '');

/** The lead fields plus the lead custom fields (filtered as text). */
export function useFilterFields() {
    const [custom, setCustom] = useState<CustomFieldDef[]>([]);
    useEffect(() => {
        fetchDefinitions('leads').then(setCustom);
    }, []);

    return useMemo(() => [...BASE_FIELDS, ...custom.map((c) => ({ field: `cf_${c.id}`, label: c.name, kind: 'text' as Kind }))], [custom]);
}

type Fields = ReturnType<typeof useFilterFields>;

const kindIn = (fields: Fields, field: string): Kind => fields.find((f) => f.field === field)?.kind ?? 'text';

/** A new rule for a field, with its first operator. */
export function newRule(fields: Fields, field: string): FilterRule {
    const kind = kindIn(fields, field);
    return { field, op: OPS[kind][0].value, value: kind === 'multi' || kind === 'staff' ? [] : kind === 'boolean' ? '1' : '', value2: '' };
}

/** How a rule's values read on its chip. */
function valueText(rule: FilterRule, kind: Kind, ctx: FilterContext, staffName: (id: string) => string): string {
    if (needsNoValue(rule.op)) {
        return '';
    }
    const list = asList(rule.value);
    if (kind === 'multi') {
        const options = rule.field === 'lead_status_id' ? ctx.statuses : ctx.sources;
        return list.map((id) => options.find((o) => String(o.id) === id)?.name ?? `#${id}`).join(' | ');
    }
    if (kind === 'staff') {
        return list.map(staffName).join(' | ');
    }
    if (kind === 'boolean') {
        return rule.value === '0' ? 'No' : 'Yes';
    }
    return rule.op === 'between' ? `${rule.value ?? ''} – ${rule.value2 ?? ''}` : String(rule.value ?? '');
}

/**
 * Edits one rule: operator and values. Changes apply with "Apply" (or Enter in a text box).
 */
function RuleEditor({ rule, fields, ctx, onApply, onRemove }: { rule: FilterRule; fields: Fields; ctx: FilterContext; onApply: (r: FilterRule) => void; onRemove?: () => void }) {
    const staff = useStaff();
    const [draft, setDraft] = useState(rule);
    const [find, setFind] = useState('');
    const kind = kindIn(fields, draft.field);
    const set = (patch: Partial<FilterRule>) => setDraft((d) => ({ ...d, ...patch }));
    const label = fields.find((f) => f.field === draft.field)?.label ?? draft.field;
    const apply = () => ruleIsComplete(draft) && onApply(draft);

    function values(): ReactNode {
        if (needsNoValue(draft.op)) {
            return null;
        }
        if (kind === 'multi' || kind === 'staff') {
            const options = kind === 'staff' ? staff.map((s) => ({ id: s.id, name: s.full_name })) : draft.field === 'lead_status_id' ? ctx.statuses : ctx.sources;
            const chosen = asList(draft.value);
            const q = find.trim().toLowerCase();
            return (
                <div>
                    {options.length > 8 && (
                        <div className="relative mb-2">
                            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                            <Input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search..." className="pl-8" />
                        </div>
                    )}
                    <div className="max-h-56 space-y-0.5 overflow-y-auto">
                        {options
                            .filter((o) => !q || o.name.toLowerCase().includes(q))
                            .map((o) => {
                                const on = chosen.includes(String(o.id));
                                return (
                                    <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-slate-50">
                                        <input
                                            type="checkbox"
                                            checked={on}
                                            onChange={() => set({ value: on ? chosen.filter((v) => v !== String(o.id)) : [...chosen, String(o.id)] })}
                                            className="accent-brand"
                                        />
                                        {o.name}
                                    </label>
                                );
                            })}
                    </div>
                </div>
            );
        }
        if (kind === 'boolean') {
            return (
                <Select value={String(draft.value ?? '1')} onChange={(e) => set({ value: e.target.value })}>
                    <option value="1">Yes</option>
                    <option value="0">No</option>
                </Select>
            );
        }
        if (kind === 'country') {
            return (
                <Select value={String(draft.value ?? '')} onChange={(e) => set({ value: e.target.value })}>
                    <option value="">Choose…</option>
                    {COUNTRIES.map((c) => (
                        <option key={c} value={c}>
                            {c}
                        </option>
                    ))}
                </Select>
            );
        }
        const type = kind === 'date' ? 'date' : kind === 'number' ? 'number' : 'text';
        return (
            <div className="space-y-2">
                <Input
                    type={type}
                    value={String(draft.value ?? '')}
                    onChange={(e) => set({ value: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && apply()}
                    placeholder={kind === 'text' ? 'Value' : undefined}
                    autoFocus
                />
                {draft.op === 'between' && (
                    <Input type={type} value={draft.value2 ?? ''} onChange={(e) => set({ value2: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && apply()} />
                )}
            </div>
        );
    }

    return (
        <div className="w-72 space-y-3 p-1">
            <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
            <Select value={draft.op} onChange={(e) => set({ op: e.target.value })}>
                {OPS[kind].map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </Select>
            {values()}
            <div className="flex items-center justify-between gap-2 pt-1">
                {onRemove ? (
                    <button type="button" onClick={onRemove} className="text-[12.5px] font-semibold text-slate-500 hover:text-red-600">
                        Remove
                    </button>
                ) : (
                    <span />
                )}
                <Button size="sm" onClick={apply} disabled={!ruleIsComplete(draft)}>
                    Apply
                </Button>
            </div>
        </div>
    );
}

/** "+ Add a Condition": pick a field, then set its rule. */
function AddCondition({ fields, ctx, onAdd, children }: { fields: Fields; ctx: FilterContext; onAdd: (r: FilterRule) => void; children: (toggle: () => void) => ReactNode }) {
    const [field, setField] = useState<string | null>(null);
    const [find, setFind] = useState('');
    const q = find.trim().toLowerCase();

    return (
        <Menu align="left" block trigger={(toggle) => children(() => (setField(null), setFind(''), toggle()))}>
            {(close) =>
                field ? (
                    <RuleEditor rule={newRule(fields, field)} fields={fields} ctx={ctx} onApply={(r) => (onAdd(r), close())} />
                ) : (
                    <div className="w-64">
                        <div className="relative mb-1.5">
                            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                            <Input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search fields..." className="pl-8" autoFocus />
                        </div>
                        <div className="max-h-72 overflow-y-auto">
                            {fields
                                .filter((f) => !q || f.label.toLowerCase().includes(q))
                                .map((f) => (
                                    <button
                                        key={f.field}
                                        type="button"
                                        onClick={() => setField(f.field)}
                                        className="block w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] text-slate-700 hover:bg-brand-50"
                                    >
                                        {f.label}
                                    </button>
                                ))}
                        </div>
                    </div>
                )
            }
        </Menu>
    );
}

/**
 * "Edit filters": each rule as a chip (field | operator | values, click to edit, × to remove),
 * "+ Add a Condition" and "Sort by". Every change applies to the list at once.
 */
export function FilterPanel({
    rules,
    onRules,
    sort,
    onSort,
    ctx,
    onClose,
}: {
    rules: FilterRule[];
    onRules: (r: FilterRule[]) => void;
    sort: LeadSort;
    onSort: (s: LeadSort) => void;
    ctx: FilterContext;
    onClose: () => void;
}) {
    const fields = useFilterFields();
    const staff = useStaff();
    const staffName = (id: string) => staff.find((s) => String(s.id) === id)?.full_name ?? `#${id}`;
    const sortDef = SORTS.find((s) => s.value === sort.sort) ?? SORTS[0];

    return (
        <aside className="panel_s self-start overflow-visible">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <h5 className="text-[15px] font-semibold text-slate-800">Edit filters</h5>
                <div className="flex items-center gap-2">
                    {rules.length > 0 && (
                        <button type="button" onClick={() => onRules([])} className="text-[12.5px] font-semibold text-slate-500 hover:text-red-600">
                            Clear all
                        </button>
                    )}
                    <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close filters">
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>
            <div className="space-y-3 p-4">
                <AddCondition fields={fields} ctx={ctx} onAdd={(r) => onRules([...rules, r])}>
                    {(toggle) => (
                        <button
                            type="button"
                            onClick={toggle}
                            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-brand/30 py-2.5 text-[13.5px] font-semibold text-brand hover:bg-brand-50"
                        >
                            <Plus className="h-4 w-4" /> Add a Condition
                        </button>
                    )}
                </AddCondition>

                {rules.map((rule, i) => {
                    const kind = kindIn(fields, rule.field);
                    const label = fields.find((f) => f.field === rule.field)?.label ?? rule.field;
                    const op = OPS[kind].find((o) => o.value === rule.op)?.label ?? rule.op;
                    const values = valueText(rule, kind, ctx, staffName);
                    return (
                        <div key={`${rule.field}-${i}`} className="group relative">
                            <Menu
                                align="left"
                                block
                                trigger={(toggle) => (
                                    <button
                                        type="button"
                                        onClick={toggle}
                                        className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-brand-50 px-3 py-2.5 pr-8 text-left text-[13px] ring-1 ring-brand-100 hover:ring-brand/40"
                                    >
                                        <Filter className="h-3.5 w-3.5 shrink-0 text-brand" />
                                        <span className="font-semibold text-slate-800">{label}</span>
                                        <span className="text-slate-300">|</span>
                                        <span className="text-slate-600">{op}</span>
                                        {values && (
                                            <>
                                                <span className="text-slate-300">|</span>
                                                <span className="min-w-0 break-words font-semibold text-brand">{values}</span>
                                            </>
                                        )}
                                    </button>
                                )}
                            >
                                {(close) => (
                                    <RuleEditor
                                        rule={rule}
                                        fields={fields}
                                        ctx={ctx}
                                        onApply={(r) => (onRules(rules.map((x, xi) => (xi === i ? r : x))), close())}
                                        onRemove={() => (onRules(rules.filter((_, xi) => xi !== i)), close())}
                                    />
                                )}
                            </Menu>
                            <button
                                type="button"
                                onClick={() => onRules(rules.filter((_, xi) => xi !== i))}
                                className="absolute right-2 top-2.5 rounded-full p-0.5 text-slate-400 hover:bg-white hover:text-red-600"
                                aria-label={`Remove ${label} filter`}
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    );
                })}
                {rules.length === 0 && <p className="px-1 text-center text-[12.5px] text-slate-400">No conditions: every lead you can see is listed.</p>}

                <div className="border-t border-slate-100 pt-3 text-[13px]">
                    <span className="mb-2 flex items-center gap-1 font-semibold text-slate-600">
                        <ArrowDownUp className="h-3.5 w-3.5" /> Sort by
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <Select value={sortDef.value} onChange={(e) => onSort({ ...sort, sort: e.target.value })}>
                                {SORTS.map((s) => (
                                    <option key={s.value} value={s.value}>
                                        {s.label}
                                    </option>
                                ))}
                            </Select>
                        </div>
                        <div>
                            <Select value={sort.dir} onChange={(e) => onSort({ ...sort, dir: e.target.value as LeadSort['dir'] })}>
                                <option value="desc">{sortDef.desc}</option>
                                <option value="asc">{sortDef.asc}</option>
                            </Select>
                        </div>
                    </div>
                </div>
            </div>
        </aside>
    );
}

/**
 * The funnel in a column header: filters by that column (edits its rule, or adds one), with a
 * badge counting the column's rules. Its popup is drawn over the page, so the scrolling table does
 * not cut it off.
 */
export function ColumnFilter({ field, rules, onRules, ctx }: { field: string; rules: FilterRule[]; onRules: (r: FilterRule[]) => void; ctx: FilterContext }) {
    const fields = useFilterFields();
    const [at, setAt] = useState<{ top: number; left: number } | null>(null);
    const box = useRef<HTMLDivElement>(null);
    const index = rules.findIndex((r) => r.field === field);
    const count = rules.filter((r) => r.field === field).length;
    const close = () => setAt(null);

    useEffect(() => {
        if (!at) {
            return;
        }
        const outside = (e: MouseEvent) => !box.current?.contains(e.target as Node) && close();
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
        <>
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    const r = e.currentTarget.getBoundingClientRect();
                    setAt(at ? null : { top: r.bottom + 6, left: Math.max(8, Math.min(r.left - 120, window.innerWidth - 320)) });
                }}
                className={`relative ml-1 inline-flex rounded p-0.5 align-middle ${count ? 'text-brand' : 'text-slate-300 hover:text-slate-500'}`}
                title="Filter this column"
            >
                <Filter className="h-3.5 w-3.5" fill={count ? 'currentColor' : 'none'} />
                {count > 0 && <span className="absolute -right-1.5 -top-1.5 rounded-full bg-accent px-1 text-[9.5px] font-bold leading-[14px] text-white">{count}</span>}
            </button>
            {at &&
                createPortal(
                    <div
                        ref={box}
                        className="pop-in fixed z-50 rounded-2xl border border-slate-200/80 bg-white p-1.5 text-left normal-case tracking-normal shadow-[0_20px_44px_-16px_rgba(8,33,63,0.35)]"
                        style={{ top: at.top, left: at.left }}
                    >
                        <RuleEditor
                            rule={index >= 0 ? rules[index] : newRule(fields, field)}
                            fields={fields}
                            ctx={ctx}
                            onApply={(r) => (onRules(index >= 0 ? rules.map((x, xi) => (xi === index ? r : x)) : [...rules, r]), close())}
                            onRemove={index >= 0 ? () => (onRules(rules.filter((_, xi) => xi !== index)), close()) : undefined}
                        />
                    </div>,
                    document.body,
                )}
        </>
    );
}
