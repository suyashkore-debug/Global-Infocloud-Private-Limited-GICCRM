import { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { api, errorMessage, fieldErrors } from '../../lib/api';
import { money } from '../../lib/sales';
import { useApi } from '../../hooks/useApi';
import { usePermission } from '../../hooks/usePermission';
import { Button, EmptyState, Field, Input, Modal, Pagination, Select, Spinner, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import type { Item, Paginated, Tax } from '../../types';
import { CustomFieldInputs, useCustomFields } from '../../components/customfields/CustomFields';
import { useCustomFieldColumns } from '../../components/customfields/CustomFields';

/** Sales → Items (Perfex invoice items). */
export default function ItemsPage() {
    const toast = useToast();
    const canCreate = usePermission('items.create');
    const canEdit = usePermission('items.edit');
    const canDelete = usePermission('items.delete');
    const [search, setSearch] = useState('');
    const [groupId, setGroupId] = useState('');
    const [page, setPage] = useState(1);
    const [editing, setEditing] = useState<Item | null>(null);
    const [open, setOpen] = useState(false);
    const { data, loading, reload } = useApi<Paginated<Item>>('/items', { search, page, group_id: groupId || undefined });
    const cfCols = useCustomFieldColumns('items', (data?.data ?? []).map((r) => r.id));
    const groups = useApi<{ data: { id: number; name: string }[] }>('/setup/item-groups');

    async function remove(item: Item) {
        if (!confirm(`Delete item "${item.description}"?`)) {
            return;
        }
        try {
            await api.delete(`/items/${item.id}`);
            toast('Item deleted.');
            reload();
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    return (
        <div className="w-full space-y-4">
            <h4 className="page-title">Items</h4>
            <div className="flex flex-wrap items-center gap-2">
                {canCreate && (
                    <Button onClick={() => (setEditing(null), setOpen(true))}>
                        <Plus className="h-4 w-4" /> New Item
                    </Button>
                )}
                <Select value={groupId} onChange={(e) => (setGroupId(e.target.value), setPage(1))} className="w-auto">
                    <option value="">All groups</option>
                    {groups.data?.data.map((g) => (
                        <option key={g.id} value={g.id}>
                            {g.name}
                        </option>
                    ))}
                </Select>
                <div className="relative ml-auto w-full sm:w-64">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} placeholder="Search..." className="pl-9" />
                </div>
            </div>
            {loading && !data ? (
                <Spinner />
            ) : !data || data.data.length === 0 ? (
                <EmptyState title="No items yet" text="Items you sell often can be picked into invoices, estimates and proposals." />
            ) : (
                <div className="panel_s overflow-hidden">
                    <div className="table-scroll overflow-x-auto">
                        <table className="table-perfex">
                            <thead>
                                <tr>
                                    <th>Description</th>
                                    <th>Long Description</th>
                                    <th>HSN/SAC</th>
                                    <th className="text-right">Rate</th>
                                    <th>Tax 1</th>
                                    <th>Tax 2</th>
                                    <th>Unit</th>
                                    <th>Group</th>
                                    {cfCols.columns.map((cfc) => (
                                        <th key={`cf${cfc.id}`}>{cfc.name}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.data.map((item) => (
                                    <tr key={item.id}>
                                        <td>
                                            <span className="font-medium">{item.description}</span>
                                            <div className="row-options">
                                                {canEdit && (
                                                    <button type="button" onClick={() => (setEditing(item), setOpen(true))}>
                                                        Edit
                                                    </button>
                                                )}
                                                {canDelete && (
                                                    <>
                                                        <span className="divider">|</span>
                                                        <button type="button" onClick={() => remove(item)} className="!text-red-600">
                                                            Delete
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                        <td className="max-w-xs truncate text-gray-500">{item.long_description}</td>
                                        <td>{item.hsn_code}</td>
                                        <td className="text-right">{money(item.rate)}</td>
                                        <td>{item.tax ? `${item.tax.name} ${Number(item.tax.rate)}%` : ''}</td>
                                        <td>{item.tax2 ? `${item.tax2.name} ${Number(item.tax2.rate)}%` : ''}</td>
                                        <td>{item.unit}</td>
                                        <td>{item.group?.name}</td>
                                        {cfCols.columns.map((cfc) => (
                                            <td key={`cf${cfc.id}`}>{cfCols.cell(cfc, item.id)}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="border-t border-gray-200 px-4 py-3">
                        <Pagination page={data.meta.current_page} lastPage={data.meta.last_page} total={data.meta.total} onChange={setPage} />
                    </div>
                </div>
            )}
            <ItemModal open={open} item={editing} groups={groups.data?.data ?? []} onClose={() => setOpen(false)} onSaved={() => (setOpen(false), reload())} />
        </div>
    );
}

function ItemModal({ open, item, groups, onClose, onSaved }: { open: boolean; item: Item | null; groups: { id: number; name: string }[]; onClose: () => void; onSaved: () => void }) {
    const toast = useToast();
    const [taxes, setTaxes] = useState<Tax[]>([]);
    const [form, setForm] = useState({ description: '', long_description: '', hsn_code: '', rate: '', unit: '', item_group_id: '', tax_id: '', tax2_id: '' });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const cf = useCustomFields('items', item?.id);

    useEffect(() => {
        if (!open) {
            return;
        }
        api.get<{ data: Tax[] }>('/setup/taxes').then((r) => setTaxes(r.data.data));
        setForm({
            description: item?.description ?? '',
            long_description: item?.long_description ?? '',
            hsn_code: item?.hsn_code ?? '',
            rate: item?.rate ?? '',
            unit: item?.unit ?? '',
            item_group_id: String(item?.item_group_id ?? ''),
            tax_id: String(item?.tax_id ?? ''),
            tax2_id: String(item?.tax2_id ?? ''),
        });
        setErrors({});
    }, [open, item]);

    async function save() {
        if (!cf.validate()) {
            return;
        }
        setSaving(true);
        const payload = { ...form, item_group_id: form.item_group_id || null, tax_id: form.tax_id || null, tax2_id: form.tax2_id || null };
        try {
            const { data } = item ? await api.put<{ data: { id: number } }>(`/items/${item.id}`, payload) : await api.post<{ data: { id: number } }>('/items', payload);
            await cf.save(data.data.id);
            toast('Item saved.');
            onSaved();
        } catch (e) {
            setErrors(fieldErrors(e));
            if (!Object.keys(fieldErrors(e)).length) {
                toast(errorMessage(e), 'error');
            }
        } finally {
            setSaving(false);
        }
    }

    const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });
    const taxOptions = (
        <>
            <option value="">No Tax</option>
            {taxes.map((t) => (
                <option key={t.id} value={t.id}>
                    {t.name} {Number(t.rate)}%
                </option>
            ))}
        </>
    );

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={item ? 'Edit Item' : 'Add New Item'}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Close
                    </Button>
                    <Button onClick={save} loading={saving}>
                        Save
                    </Button>
                </>
            }
        >
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Description" required error={errors.description} className="sm:col-span-2">
                    <Input value={form.description} onChange={set('description')} autoFocus />
                </Field>
                <Field label="Long Description" className="sm:col-span-2">
                    <Textarea rows={3} value={form.long_description} onChange={set('long_description')} />
                </Field>
                <CustomFieldInputs cf={cf} className="sm:col-span-2" />
                <Field label="Rate" required error={errors.rate}>
                    <Input type="number" step="any" value={form.rate} onChange={set('rate')} />
                </Field>
                <Field label="HSN/SAC Code" error={errors.hsn_code}>
                    <Input value={form.hsn_code} onChange={set('hsn_code')} />
                </Field>
                <Field label="Tax 1">
                    <Select value={form.tax_id} onChange={set('tax_id')}>
                        {taxOptions}
                    </Select>
                </Field>
                <Field label="Tax 2">
                    <Select value={form.tax2_id} onChange={set('tax2_id')}>
                        {taxOptions}
                    </Select>
                </Field>
                <Field label="Unit">
                    <Input value={form.unit} onChange={set('unit')} />
                </Field>
                <Field label="Item Group">
                    <Select value={form.item_group_id} onChange={set('item_group_id')}>
                        <option value="">None</option>
                        {groups.map((g) => (
                            <option key={g.id} value={g.id}>
                                {g.name}
                            </option>
                        ))}
                    </Select>
                </Field>
            </div>
        </Modal>
    );
}
