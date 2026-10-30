import { useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import { useStaff } from '../../hooks/useStaff';
import { Button, Checkbox, Field, Input, Modal, Select, TagInput } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import type { LeadStatus } from '../../types';

/**
 * Perfex leads "Bulk Actions" for the ticked rows: mark as lost, change status / source, last
 * contact, assign, tags, public or private; or mass delete (people allowed to delete leads).
 */
export default function LeadBulkActions({
    ids,
    statuses,
    sources,
    canDelete,
    onClose,
    onDone,
}: {
    ids: number[];
    statuses: LeadStatus[];
    sources: { id: number; name: string }[];
    canDelete: boolean;
    onClose: () => void;
    onDone: () => void;
}) {
    const toast = useToast();
    const staff = useStaff();
    const [form, setForm] = useState({ lost: false, lead_status_id: '', lead_source_id: '', last_contact_at: '', assigned_id: '', tags: [] as string[], visibility: '', mass_delete: false });
    const [saving, setSaving] = useState(false);
    const nothing = !form.mass_delete && !form.lost && !form.lead_status_id && !form.lead_source_id && !form.last_contact_at && !form.assigned_id && form.tags.length === 0 && !form.visibility;

    async function confirm() {
        if (form.mass_delete && !window.confirm(`Delete ${ids.length} lead${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) {
            return;
        }
        setSaving(true);
        try {
            const body = form.mass_delete
                ? { ids, mass_delete: true }
                : {
                      ids,
                      lost: form.lost,
                      lead_status_id: form.lead_status_id ? Number(form.lead_status_id) : null,
                      lead_source_id: form.lead_source_id ? Number(form.lead_source_id) : null,
                      assigned_id: form.assigned_id ? Number(form.assigned_id) : null,
                      last_contact_at: form.last_contact_at ? new Date(form.last_contact_at).toISOString() : null,
                      tags: form.tags,
                      visibility: form.visibility || null,
                  };
            const { data } = await api.post<{ message: string }>('/leads/bulk', body);
            toast(data.message);
            onDone();
        } catch (e) {
            toast(errorMessage(e), 'error');
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal
            open
            title={`Bulk Actions · ${ids.length} lead${ids.length === 1 ? '' : 's'}`}
            onClose={onClose}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Close
                    </Button>
                    <Button variant={form.mass_delete ? 'danger' : 'primary'} onClick={confirm} loading={saving} disabled={nothing}>
                        Confirm
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                {canDelete && (
                    <div className="rounded-xl border border-red-200 bg-red-50/60 p-3">
                        <Checkbox label={<span className="font-semibold text-red-700">Mass Delete</span>} checked={form.mass_delete} onChange={(v) => setForm({ ...form, mass_delete: v })} />
                    </div>
                )}
                <fieldset disabled={form.mass_delete} className={`space-y-4 ${form.mass_delete ? 'pointer-events-none opacity-40' : ''}`}>
                    <Checkbox label="Mark as lost" checked={form.lost} onChange={(v) => setForm({ ...form, lost: v })} />
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Change Status">
                            <Select value={form.lead_status_id} onChange={(e) => setForm({ ...form, lead_status_id: e.target.value })}>
                                <option value="">Don't change</option>
                                {statuses.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.name}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                        <Field label="Source">
                            <Select value={form.lead_source_id} onChange={(e) => setForm({ ...form, lead_source_id: e.target.value })}>
                                <option value="">Don't change</option>
                                {sources.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.name}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                        <Field label="Last Contact">
                            <Input type="datetime-local" value={form.last_contact_at} onChange={(e) => setForm({ ...form, last_contact_at: e.target.value })} />
                        </Field>
                        <Field label="Assigned">
                            <Select value={form.assigned_id} onChange={(e) => setForm({ ...form, assigned_id: e.target.value })}>
                                <option value="">Don't change</option>
                                {staff.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.full_name}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                    </div>
                    <Field label="Tags" hint="Replaces the tags of the selected leads.">
                        <TagInput value={form.tags} onChange={(tags) => setForm({ ...form, tags })} />
                    </Field>
                    <div>
                        <span className="mb-1.5 block text-[12.5px] font-semibold text-slate-600">Visibility</span>
                        <div className="flex gap-5">
                            {[
                                ['', "Don't change"],
                                ['public', 'Public'],
                                ['private', 'Private'],
                            ].map(([value, label]) => (
                                <label key={value} className="inline-flex cursor-pointer items-center gap-2 text-[13.5px] font-medium text-slate-700">
                                    <input type="radio" name="bulk_visibility" checked={form.visibility === value} onChange={() => setForm({ ...form, visibility: value })} />
                                    {label}
                                </label>
                            ))}
                        </div>
                    </div>
                </fieldset>
            </div>
        </Modal>
    );
}
