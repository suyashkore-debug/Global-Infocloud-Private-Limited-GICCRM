import { useState, type ReactNode } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage, fieldErrors } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { Button, EmptyState, IconButton, Modal, Spinner } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

export interface Column<T> {
    label: string;
    render: (row: T) => ReactNode;
}

/**
 * Table + add / edit modal for one Setup list (taxes, currencies, payment modes, groups).
 */
export default function ListEditor<T extends { id: number }, F extends Record<string, unknown>>({
    list,
    title,
    columns,
    blank,
    toForm,
    renderForm,
}: {
    list: string;
    title: string;
    columns: Column<T>[];
    blank: F;
    toForm: (row: T) => F;
    renderForm: (form: F, set: (patch: Partial<F>) => void, errors: Record<string, string>) => ReactNode;
}) {
    const toast = useToast();
    const { data, reload } = useApi<{ data: T[] }>(`/setup/${list}`);
    const [editing, setEditing] = useState<T | null>(null);
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState<F>(blank);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    function start(row: T | null) {
        setEditing(row);
        setForm(row ? toForm(row) : blank);
        setErrors({});
        setOpen(true);
    }

    async function save() {
        setSaving(true);
        try {
            if (editing) {
                await api.put(`/setup/${list}/${editing.id}`, form);
            } else {
                await api.post(`/setup/${list}`, form);
            }
            toast('Saved.');
            setOpen(false);
            reload();
        } catch (e) {
            setErrors(fieldErrors(e));
            if (!Object.keys(fieldErrors(e)).length) {
                toast(errorMessage(e), 'error');
            }
        } finally {
            setSaving(false);
        }
    }

    async function remove(row: T) {
        if (!confirm('Delete this record?')) {
            return;
        }
        try {
            await api.delete(`/setup/${list}/${row.id}`);
            toast('Deleted.');
            reload();
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    return (
        <div className="space-y-4">
            <Button onClick={() => start(null)}>
                <Plus className="h-4 w-4" /> New {title}
            </Button>
            {!data ? (
                <Spinner />
            ) : data.data.length === 0 ? (
                <EmptyState title={`No ${title.toLowerCase()} yet`} />
            ) : (
                <div className="panel_s overflow-hidden">
                    <table className="table-perfex">
                        <thead>
                            <tr>
                                {columns.map((c) => (
                                    <th key={c.label}>{c.label}</th>
                                ))}
                                <th className="w-24" />
                            </tr>
                        </thead>
                        <tbody>
                            {data.data.map((row) => (
                                <tr key={row.id}>
                                    {columns.map((c) => (
                                        <td key={c.label}>{c.render(row)}</td>
                                    ))}
                                    <td>
                                        <div className="flex justify-end gap-1">
                                            <IconButton label="Edit" onClick={() => start(row)}>
                                                <Pencil className="h-4 w-4" />
                                            </IconButton>
                                            <IconButton label="Delete" onClick={() => remove(row)} className="hover:text-red-600">
                                                <Trash2 className="h-4 w-4" />
                                            </IconButton>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <Modal
                open={open}
                onClose={() => setOpen(false)}
                size="sm"
                title={editing ? `Edit ${title}` : `New ${title}`}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setOpen(false)}>
                            Close
                        </Button>
                        <Button onClick={save} loading={saving}>
                            Save
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">{renderForm(form, (patch) => setForm((f) => ({ ...f, ...patch })), errors)}</div>
            </Modal>
        </div>
    );
}
