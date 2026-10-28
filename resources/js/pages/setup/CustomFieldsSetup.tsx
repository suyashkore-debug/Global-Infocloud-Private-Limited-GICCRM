import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { clearCustomFieldCache, type CustomFieldDef, type FieldTo } from '../../components/customfields/CustomFields';
import { Button, Checkbox, ErrorNote, Field, Input, Modal, Select, Spinner, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

const MODULES: { id: FieldTo; label: string; pdf?: boolean }[] = [
    { id: 'leads', label: 'Leads' },
    { id: 'customers', label: 'Customers' },
    { id: 'contacts', label: 'Contacts' },
    { id: 'contracts', label: 'Contracts' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'expenses', label: 'Expenses' },
    { id: 'invoice', label: 'Invoice', pdf: true },
    { id: 'items', label: 'Items' },
    { id: 'credit_note', label: 'Credit Note', pdf: true },
    { id: 'estimate', label: 'Estimate', pdf: true },
    { id: 'proposal', label: 'Proposal', pdf: true },
    { id: 'projects', label: 'Projects' },
    { id: 'tickets', label: 'Tickets' },
];

const TYPES: { id: CustomFieldDef['type']; label: string }[] = [
    { id: 'input', label: 'Input' },
    { id: 'number', label: 'Number' },
    { id: 'textarea', label: 'Textarea' },
    { id: 'select', label: 'Select' },
    { id: 'multiselect', label: 'Multi Select' },
    { id: 'checkbox', label: 'Checkbox' },
    { id: 'date_picker', label: 'Date Picker' },
    { id: 'date_picker_time', label: 'Datetime Picker' },
    { id: 'colorpicker', label: 'Color Picker' },
    { id: 'link', label: 'Hyperlink' },
];

const moduleLabel = (id: string) => MODULES.find((m) => m.id === id)?.label ?? id;

/** Perfex Setup → Custom Fields. */
export default function CustomFieldsSetup() {
    const { data, reload } = useApi<{ data: CustomFieldDef[] }>('/custom-fields');
    const [editing, setEditing] = useState<CustomFieldDef | 'new' | null>(null);

    async function remove(f: CustomFieldDef) {
        if (!confirm(`Delete the custom field "${f.name}" and all its saved values?`)) {
            return;
        }
        await api.delete(`/custom-fields/${f.id}`);
        clearCustomFieldCache();
        reload();
    }

    return (
        <div className="panel_s">
            <div className="panel-body space-y-3">
                <div className="flex items-center justify-between">
                    <h5 className="text-[15px] font-semibold">Custom Fields</h5>
                    <Button onClick={() => setEditing('new')}>
                        <Plus className="h-4 w-4" /> New Custom Field
                    </Button>
                </div>
                {!data ? (
                    <Spinner />
                ) : (
                    <div className="-mx-4 overflow-x-auto">
                        <table className="table-perfex">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Name</th>
                                    <th>Belongs to</th>
                                    <th>Type</th>
                                    <th>Slug</th>
                                    <th>Active</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                {data.data.map((f) => (
                                    <tr key={f.id}>
                                        <td>{f.id}</td>
                                        <td>
                                            <button type="button" onClick={() => setEditing(f)} className="font-medium text-blue-600 hover:underline">
                                                {f.name}
                                            </button>
                                            {f.required && <span className="ml-1 text-red-500">*</span>}
                                        </td>
                                        <td>{moduleLabel(f.field_to)}</td>
                                        <td>{TYPES.find((t) => t.id === f.type)?.label}</td>
                                        <td className="text-xs text-gray-500">{f.slug}</td>
                                        <td>{f.active ? 'Yes' : 'No'}</td>
                                        <td className="text-right">
                                            <button type="button" onClick={() => remove(f)} className="text-xs text-red-600 hover:underline">
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {data.data.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="text-center text-gray-500">
                                            No custom fields yet.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            {editing && (
                <FieldEditor
                    field={editing === 'new' ? null : editing}
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        setEditing(null);
                        clearCustomFieldCache();
                        reload();
                    }}
                />
            )}
        </div>
    );
}

function FieldEditor({ field, onClose, onSaved }: { field: CustomFieldDef | null; onClose: () => void; onSaved: () => void }) {
    const toast = useToast();
    const locked = (field?.values_count ?? 0) > 0;
    const [f, setF] = useState({
        field_to: field?.field_to ?? ('customers' as FieldTo),
        name: field?.name ?? '',
        type: field?.type ?? ('input' as CustomFieldDef['type']),
        options: (field?.options ?? []).join(', '),
        default_value: field?.default_value ?? '',
        field_order: String(field?.field_order ?? 0),
        bs_column: String(field?.bs_column ?? 12),
        required: field?.required ?? false,
        active: field?.active ?? true,
        only_admin: field?.only_admin ?? false,
        show_on_table: field?.show_on_table ?? false,
        show_on_pdf: field?.show_on_pdf ?? false,
    });
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const set = (patch: Partial<typeof f>) => setF((s) => ({ ...s, ...patch }));
    const hasOptions = ['select', 'multiselect', 'checkbox'].includes(f.type);
    const pdfAllowed = MODULES.find((m) => m.id === f.field_to)?.pdf;

    async function save() {
        setSaving(true);
        setError(null);
        const body = {
            ...f,
            options: hasOptions ? f.options.split(',').map((o) => o.trim()).filter(Boolean) : null,
            default_value: f.default_value || null,
            field_order: Number(f.field_order) || 0,
            bs_column: Number(f.bs_column),
            show_on_pdf: pdfAllowed ? f.show_on_pdf : false,
        };
        try {
            await (field ? api.put(`/custom-fields/${field.id}`, body) : api.post('/custom-fields', body));
            toast('Custom field saved.');
            onSaved();
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal
            open
            title={field ? `Edit custom field: ${field.name}` : 'New Custom Field'}
            onClose={onClose}
            size="lg"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={save} loading={saving} disabled={!f.name.trim()}>
                        Save
                    </Button>
                </>
            }
        >
            <div className="space-y-3">
                <ErrorNote message={error} />
                {locked && <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">This field already has values, so "Belongs to" and "Type" can't be changed.</p>}
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Belongs to" required>
                        <Select value={f.field_to} disabled={locked} onChange={(e) => set({ field_to: e.target.value as FieldTo })}>
                            {MODULES.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.label}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="Type" required>
                        <Select value={f.type} disabled={locked} onChange={(e) => set({ type: e.target.value as CustomFieldDef['type'] })}>
                            {TYPES.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.label}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="Field Name" required className="sm:col-span-2">
                        <Input value={f.name} onChange={(e) => set({ name: e.target.value })} />
                    </Field>
                    {hasOptions && (
                        <Field label="Options" hint="Comma separated, e.g. IT, Manufacturing, Retail" required className="sm:col-span-2">
                            <Textarea rows={2} value={f.options} onChange={(e) => set({ options: e.target.value })} />
                        </Field>
                    )}
                    <Field label="Default Value">
                        <Input value={f.default_value} onChange={(e) => set({ default_value: e.target.value })} />
                    </Field>
                    <Field label="Order">
                        <Input type="number" value={f.field_order} onChange={(e) => set({ field_order: e.target.value })} />
                    </Field>
                    <Field label="Grid width">
                        <Select value={f.bs_column} onChange={(e) => set({ bs_column: e.target.value })}>
                            <option value="12">Full width</option>
                            <option value="6">Half</option>
                            <option value="4">One third</option>
                            <option value="3">Quarter</option>
                        </Select>
                    </Field>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                    <Checkbox label="Disabled" checked={!f.active} onChange={(v) => set({ active: !v })} />
                    <Checkbox label="Restrict visibility for administrators only" checked={f.only_admin} onChange={(v) => set({ only_admin: v })} />
                    <Checkbox label="Required" checked={f.required} onChange={(v) => set({ required: v })} />
                    <Checkbox label="Show on table" checked={f.show_on_table} onChange={(v) => set({ show_on_table: v })} />
                    {pdfAllowed && <Checkbox label="Show on PDF" checked={f.show_on_pdf} onChange={(v) => set({ show_on_pdf: v })} />}
                </div>
            </div>
        </Modal>
    );
}
