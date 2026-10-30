import { useEffect, useState } from 'react';
import { Filter, Plus, Trash2 } from 'lucide-react';
import { COUNTRIES } from '../../lib/countries';
import { useStaff } from '../../hooks/useStaff';
import { Button, Input, Modal, Select } from '../../components/ui';
import { fetchDefinitions, type CustomFieldDef } from '../../components/customfields/CustomFields';

export type FilterRule = { field: string; op: string; value?: string | string[]; value2?: string };

type Kind = 'text' | 'boolean' | 'date' | 'number' | 'multi' | 'staff' | 'country';

const OPS: Record<Kind, { value: string; label: string }[]> = {
    text: [
        { value: 'contains', label: 'contains' },
        { value: 'equals', label: 'is' },
        { value: 'starts_with', label: 'starts with' },
        { value: 'ends_with', label: 'ends with' },
        { value: 'not_contains', label: 'does not contain' },
        { value: 'empty', label: 'is empty' },
        { value: 'not_empty', label: 'is not empty' },
    ],
    country: [
        { value: 'equals', label: 'is' },
        { value: 'empty', label: 'is empty' },
        { value: 'not_empty', label: 'is not empty' },
    ],
    boolean: [{ value: 'is', label: 'is' }],
    date: [
        { value: 'on', label: 'is on' },
        { value: 'before', label: 'is before' },
        { value: 'after', label: 'is after' },
        { value: 'between', label: 'is between' },
        { value: 'empty', label: 'is empty' },
        { value: 'not_empty', label: 'is not empty' },
    ],
    number: [
        { value: '=', label: '=' },
        { value: '!=', label: '≠' },
        { value: '>', label: '>' },
        { value: '>=', label: '≥' },
        { value: '<', label: '<' },
        { value: '<=', label: '≤' },
        { value: 'between', label: 'between' },
        { value: 'empty', label: 'is empty' },
    ],
    multi: [
        { value: 'in', label: 'is any of' },
        { value: 'not_in', label: 'is none of' },
    ],
    staff: [
        { value: 'is', label: 'is' },
        { value: 'is_not', label: 'is not' },
        { value: 'empty', label: 'is not assigned' },
    ],
};

/** The fields the Perfex leads filters offer, with their kind. */
const BASE_FIELDS: { field: string; label: string; kind: Kind }[] = [
    { field: 'name', label: 'Name', kind: 'text' },
    { field: 'company', label: 'Company', kind: 'text' },
    { field: 'email', label: 'Email', kind: 'text' },
    { field: 'phone', label: 'Phone', kind: 'text' },
    { field: 'title', label: 'Position', kind: 'text' },
    { field: 'website', label: 'Website', kind: 'text' },
    { field: 'country', label: 'Country', kind: 'country' },
    { field: 'city', label: 'City', kind: 'text' },
    { field: 'state', label: 'State', kind: 'text' },
    { field: 'zip', label: 'Zip Code', kind: 'text' },
    { field: 'lead_status_id', label: 'Status', kind: 'multi' },
    { field: 'lead_source_id', label: 'Source', kind: 'multi' },
    { field: 'assigned_id', label: 'Assigned', kind: 'staff' },
    { field: 'lead_value', label: 'Lead value', kind: 'number' },
    { field: 'last_contact_at', label: 'Last Contact', kind: 'date' },
    { field: 'created_at', label: 'Date Created', kind: 'date' },
    { field: 'assigned_at', label: 'Date Assigned', kind: 'date' },
    { field: 'is_public', label: 'Public', kind: 'boolean' },
    { field: 'lost', label: 'Lost', kind: 'boolean' },
    { field: 'junk', label: 'Junk', kind: 'boolean' },
];

const needsNoValue = (op: string) => op === 'empty' || op === 'not_empty';

/**
 * Perfex leads "Filters": a button showing how many rules apply, opening a panel to add rules
 * (field, operator, value) that every listed lead must meet.
 */
export default function LeadFilters({
    rules,
    onApply,
    statuses,
    sources,
}: {
    rules: FilterRule[];
    onApply: (rules: FilterRule[]) => void;
    statuses: { id: number; name: string }[];
    sources: { id: number; name: string }[];
}) {
    const staff = useStaff();
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<FilterRule[]>(rules);
    const [custom, setCustom] = useState<CustomFieldDef[]>([]);

    useEffect(() => {
        fetchDefinitions('leads').then(setCustom);
    }, []);

    const fields = [...BASE_FIELDS, ...custom.map((c) => ({ field: `cf_${c.id}`, label: c.name, kind: 'text' as Kind }))];
    const kindOf = (field: string) => fields.find((f) => f.field === field)?.kind ?? 'text';
    const setRule = (i: number, patch: Partial<FilterRule>) => setDraft((d) => d.map((r, ri) => (ri === i ? { ...r, ...patch } : r)));
    const changeField = (i: number, field: string) => {
        const kind = kindOf(field);
        setRule(i, { field, op: OPS[kind][0].value, value: kind === 'multi' ? [] : kind === 'boolean' ? '1' : '', value2: '' });
    };

    function valueInput(rule: FilterRule, i: number) {
        const kind = kindOf(rule.field);
        if (needsNoValue(rule.op)) {
            return null;
        }
        if (kind === 'boolean') {
            return (
                <Select value={String(rule.value ?? '1')} onChange={(e) => setRule(i, { value: e.target.value })}>
                    <option value="1">Yes</option>
                    <option value="0">No</option>
                </Select>
            );
        }
        if (kind === 'multi') {
            const options = rule.field === 'lead_status_id' ? statuses : sources;
            const chosen = (rule.value as string[] | undefined) ?? [];
            return (
                <div className="flex flex-wrap gap-1.5">
                    {options.map((o) => {
                        const on = chosen.includes(String(o.id));
                        return (
                            <button
                                key={o.id}
                                type="button"
                                onClick={() => setRule(i, { value: on ? chosen.filter((v) => v !== String(o.id)) : [...chosen, String(o.id)] })}
                                className={`rounded-lg px-2 py-1 text-[12.5px] font-semibold ring-1 transition ${on ? 'bg-brand text-white ring-brand' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300'}`}
                            >
                                {o.name}
                            </button>
                        );
                    })}
                </div>
            );
        }
        if (kind === 'staff') {
            return (
                <Select value={String(rule.value ?? '')} onChange={(e) => setRule(i, { value: e.target.value })}>
                    <option value="">Choose…</option>
                    {staff.map((s) => (
                        <option key={s.id} value={s.id}>
                            {s.full_name}
                        </option>
                    ))}
                </Select>
            );
        }
        if (kind === 'country') {
            return (
                <Select value={String(rule.value ?? '')} onChange={(e) => setRule(i, { value: e.target.value })}>
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
            <div className="flex items-center gap-2">
                <Input type={type} value={String(rule.value ?? '')} onChange={(e) => setRule(i, { value: e.target.value })} placeholder={kind === 'text' ? 'Value' : undefined} />
                {rule.op === 'between' && (
                    <>
                        <span className="text-[12.5px] text-slate-500">and</span>
                        <Input type={type} value={rule.value2 ?? ''} onChange={(e) => setRule(i, { value2: e.target.value })} />
                    </>
                )}
            </div>
        );
    }

    return (
        <>
            <Button variant="secondary" onClick={() => (setDraft(rules.length ? rules : [{ field: 'name', op: 'contains', value: '' }]), setOpen(true))} className={rules.length ? '!border-brand !text-brand' : ''}>
                <Filter className={`h-4 w-4 ${rules.length ? 'text-accent' : ''}`} />
                Filters
                {rules.length > 0 && <span className="rounded-full bg-accent px-1.5 text-[11px] font-bold text-white">{rules.length}</span>}
            </Button>
            {open && (
                <Modal
                    open
                    size="lg"
                    title="Filters"
                    onClose={() => setOpen(false)}
                    footer={
                        <>
                            <Button variant="ghost" onClick={() => (onApply([]), setOpen(false))}>
                                Clear all
                            </Button>
                            <Button variant="secondary" onClick={() => setOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                onClick={() => {
                                    onApply(draft.filter((r) => needsNoValue(r.op) || (Array.isArray(r.value) ? r.value.length > 0 : String(r.value ?? '').trim() !== '')));
                                    setOpen(false);
                                }}
                            >
                                Apply
                            </Button>
                        </>
                    }
                >
                    <div className="space-y-3">
                        <p className="text-[13px] text-slate-500">Leads that meet every rule below are shown.</p>
                        {draft.map((rule, i) => (
                            <div key={i} className="grid items-start gap-2 rounded-2xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-[180px_150px_minmax(0,1fr)_auto]">
                                <Select value={rule.field} onChange={(e) => changeField(i, e.target.value)}>
                                    {fields.map((f) => (
                                        <option key={f.field} value={f.field}>
                                            {f.label}
                                        </option>
                                    ))}
                                </Select>
                                <Select value={rule.op} onChange={(e) => setRule(i, { op: e.target.value })}>
                                    {OPS[kindOf(rule.field)].map((o) => (
                                        <option key={o.value} value={o.value}>
                                            {o.label}
                                        </option>
                                    ))}
                                </Select>
                                <div className="min-w-0">{valueInput(rule, i)}</div>
                                <button type="button" onClick={() => setDraft((d) => d.filter((_, ri) => ri !== i))} className="mt-2 text-slate-400 hover:text-red-600" title="Remove rule">
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                        <Button variant="secondary" size="sm" onClick={() => setDraft((d) => [...d, { field: 'name', op: 'contains', value: '' }])}>
                            <Plus className="h-4 w-4" /> Add rule
                        </Button>
                    </div>
                </Modal>
            )}
        </>
    );
}
