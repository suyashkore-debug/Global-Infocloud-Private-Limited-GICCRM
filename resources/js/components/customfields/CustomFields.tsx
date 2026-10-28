import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { formatDate, formatDateTime } from '../../lib/format';
import { Field, Input, Select, Textarea } from '../ui';

export type FieldTo = 'leads' | 'customers' | 'contacts' | 'contracts' | 'tasks' | 'expenses' | 'invoice' | 'credit_note' | 'estimate' | 'proposal' | 'projects' | 'tickets' | 'items';

export type CustomFieldDef = {
    id: number;
    field_to: FieldTo;
    name: string;
    slug: string;
    type: 'input' | 'number' | 'textarea' | 'select' | 'multiselect' | 'checkbox' | 'date_picker' | 'date_picker_time' | 'colorpicker' | 'link';
    options: string[] | null;
    default_value: string | null;
    required: boolean;
    active: boolean;
    only_admin: boolean;
    show_on_table: boolean;
    show_on_pdf: boolean;
    field_order: number;
    bs_column: number;
    values_count?: number;
};

const definitionsCache = new Map<FieldTo, Promise<CustomFieldDef[]>>();

/** The active custom fields of a module (fetched once per page load). */
export function fetchDefinitions(to: FieldTo): Promise<CustomFieldDef[]> {
    if (!definitionsCache.has(to)) {
        definitionsCache.set(
            to,
            api.get<{ data: CustomFieldDef[] }>(`/custom-fields/for/${to}`).then((r) => r.data.data).catch(() => {
                definitionsCache.delete(to);
                return [];
            }),
        );
    }

    return definitionsCache.get(to)!;
}

export function clearCustomFieldCache(): void {
    definitionsCache.clear();
}

const splitMulti = (value: string | null | undefined) => (value ? value.split(',').map((v) => v.trim()).filter(Boolean) : []);

/**
 * Custom field state for a create / edit form: load the definitions (and the record's values
 * when editing), validate required fields, and save the values once the record has an id.
 */
export function useCustomFields(to: FieldTo, recordId?: number | null) {
    const [fields, setFields] = useState<CustomFieldDef[]>([]);
    const [values, setValues] = useState<Record<number, string>>({});
    const [errors, setErrors] = useState<Record<number, string>>({});

    useEffect(() => {
        let active = true;
        (async () => {
            const defs = await fetchDefinitions(to);
            let saved: Record<number, string | null> = {};
            if (recordId && defs.length) {
                const r = await api.get<{ data: Record<number, Record<number, string | null>> }>(`/custom-field-values/${to}`, { params: { id: recordId } }).catch(() => null);
                saved = r?.data.data[recordId] ?? {};
            }
            if (!active) {
                return;
            }
            setFields(defs);
            setValues(Object.fromEntries(defs.map((f) => [f.id, recordId ? (saved[f.id] ?? '') : (f.default_value ?? '')])));
        })();

        return () => {
            active = false;
        };
    }, [to, recordId]);

    const set = useCallback((id: number, value: string) => {
        setValues((v) => ({ ...v, [id]: value }));
        setErrors((e) => ({ ...e, [id]: '' }));
    }, []);

    /** Required fields filled in? Marks the empty ones. */
    const validate = useCallback((): boolean => {
        const missing = Object.fromEntries(fields.filter((f) => f.required && !String(values[f.id] ?? '').trim()).map((f) => [f.id, `${f.name} is required.`]));
        setErrors(missing);

        return Object.keys(missing).length === 0;
    }, [fields, values]);

    /** Save the values for the record (after the record itself was saved). */
    const save = useCallback(
        async (id: number): Promise<void> => {
            if (!fields.length) {
                return;
            }
            try {
                await api.put(`/custom-field-values/${to}/${id}`, { custom_fields: values });
            } catch (e) {
                const errs = (e as { response?: { data?: { errors?: Record<string, string[]> } } }).response?.data?.errors ?? {};
                setErrors(Object.fromEntries(Object.entries(errs).map(([k, v]) => [Number(k.split('.')[1]), v[0]])));
                throw e;
            }
        },
        [fields.length, to, values],
    );

    return { fields, values, errors, set, validate, save };
}

export type CustomFieldsState = ReturnType<typeof useCustomFields>;

const colSpan: Record<number, string> = { 3: 'sm:col-span-3', 4: 'sm:col-span-4', 6: 'sm:col-span-6', 12: 'sm:col-span-12' };

/** The inputs for a form's custom fields (nothing when the module has none). */
export function CustomFieldInputs({ cf, className = '' }: { cf: CustomFieldsState; className?: string }) {
    if (cf.fields.length === 0) {
        return null;
    }

    return (
        <div className={`grid grid-cols-12 gap-3 ${className}`}>
            {cf.fields.map((f) => (
                <div key={f.id} className={`col-span-12 ${colSpan[f.bs_column] ?? 'sm:col-span-12'}`}>
                    <Field label={f.name} required={f.required} error={cf.errors[f.id] || undefined}>
                        <CustomFieldInput field={f} value={cf.values[f.id] ?? ''} onChange={(v) => cf.set(f.id, v)} />
                    </Field>
                </div>
            ))}
        </div>
    );
}

function CustomFieldInput({ field: f, value, onChange }: { field: CustomFieldDef; value: string; onChange: (value: string) => void }) {
    const options = f.options ?? [];
    switch (f.type) {
        case 'textarea':
            return <Textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} />;
        case 'number':
            return <Input type="number" step="any" value={value} onChange={(e) => onChange(e.target.value)} />;
        case 'date_picker':
            return <Input type="date" value={value.slice(0, 10)} onChange={(e) => onChange(e.target.value)} />;
        case 'date_picker_time':
            return <Input type="datetime-local" value={value.replace(' ', 'T').slice(0, 16)} onChange={(e) => onChange(e.target.value)} />;
        case 'colorpicker':
            return <Input type="color" value={value || '#000000'} onChange={(e) => onChange(e.target.value)} className="h-10 w-20 p-1" />;
        case 'link':
            return <Input type="url" value={value} placeholder="https://" onChange={(e) => onChange(e.target.value)} />;
        case 'select':
            return (
                <Select value={value} onChange={(e) => onChange(e.target.value)}>
                    <option value="">—</option>
                    {options.map((o) => (
                        <option key={o}>{o}</option>
                    ))}
                </Select>
            );
        case 'multiselect':
        case 'checkbox': {
            const chosen = splitMulti(value);
            const toggle = (o: string) => onChange((chosen.includes(o) ? chosen.filter((c) => c !== o) : [...chosen, o]).join(', '));

            return (
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
                    {options.map((o) => (
                        <label key={o} className="flex items-center gap-1.5 text-[13px] text-gray-700">
                            <input type="checkbox" checked={chosen.includes(o)} onChange={() => toggle(o)} /> {o}
                        </label>
                    ))}
                </div>
            );
        }
        default:
            return <Input value={value} onChange={(e) => onChange(e.target.value)} />;
    }
}

/** A custom field value for display (tables, view pages). */
export function formatCustomValue(field: CustomFieldDef, value: string | null | undefined) {
    if (!value) {
        return '';
    }
    switch (field.type) {
        case 'date_picker':
            return formatDate(value);
        case 'date_picker_time':
            return formatDateTime(value);
        case 'link':
            return (
                <a href={value} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>
                    {value}
                </a>
            );
        case 'colorpicker':
            return <span className="inline-block h-4 w-8 rounded border border-gray-200 align-middle" style={{ backgroundColor: value }} title={value} />;
        default:
            return value;
    }
}

/** Read-only list of a record's custom fields (for view pages). */
export function CustomFieldsView({ to, id, className = '' }: { to: FieldTo; id: number; className?: string }) {
    const cf = useCustomFields(to, id);
    const filled = cf.fields.filter((f) => cf.values[f.id]);
    if (filled.length === 0) {
        return null;
    }

    return (
        <dl className={`grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2 ${className}`}>
            {filled.map((f) => (
                <div key={f.id}>
                    <dt className="text-gray-500">{f.name}</dt>
                    <dd className="font-medium text-gray-800">{formatCustomValue(f, cf.values[f.id])}</dd>
                </div>
            ))}
        </dl>
    );
}

/**
 * Columns for custom fields marked "Show on table": their definitions and the values of the
 * rows on screen.
 */
export function useCustomFieldColumns(to: FieldTo, ids: number[]) {
    const [columns, setColumns] = useState<CustomFieldDef[]>([]);
    const [values, setValues] = useState<Record<number, Record<number, string | null>>>({});
    const key = ids.join(',');

    useEffect(() => {
        let active = true;
        fetchDefinitions(to).then(async (defs) => {
            const cols = defs.filter((f) => f.show_on_table);
            if (!active) {
                return;
            }
            setColumns(cols);
            if (cols.length && key) {
                const r = await api.get<{ data: Record<number, Record<number, string | null>> }>(`/custom-field-values/${to}`, { params: { ids: key.split(',').map(Number) } }).catch(() => null);
                if (active && r) {
                    setValues(r.data.data);
                }
            }
        });

        return () => {
            active = false;
        };
    }, [to, key]);

    return { columns, cell: (field: CustomFieldDef, rowId: number) => formatCustomValue(field, values[rowId]?.[field.id]) };
}
