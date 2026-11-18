import { useState, type ReactNode } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage, fieldErrors } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { Button, EmptyState, Field, IconButton, Modal, Select, Spinner } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { confirmDialog } from '../../components/ui/Dialogs';

export interface Column<T> {
    label: string;
    render: (row: T) => ReactNode;
}

/** Lists whose items are for one workspace or all: the workspaces, and the one open in the header. */
interface WorkspaceMeta {
    workspace_id?: number | null;
    workspaces?: { id: number; name: string }[];
}

/**
 * Table + add / edit modal for one Setup list (taxes, currencies, payment modes, groups). With
 * several workspaces, each item is for one workspace or all of them.
 */
export default function ListEditor<T extends { id: number }, F extends Record<string, unknown>>({
    list,
    title,
    columns,
    blank,
    toForm,
    renderForm,
    onChanged,
    intro,
}: {
    list: string;
    title: string;
    columns: Column<T>[];
    blank: F;
    toForm: (row: T) => F;
    renderForm: (form: F, set: (patch: Partial<F>) => void, errors: Record<string, string>) => ReactNode;
    /** After a save or delete. */
    onChanged?: () => void;
    /** Shown above the table. */
    intro?: ReactNode;
}) {
    const toast = useToast();
    const { data, reload } = useApi<{ data: (T & { workspace_id?: number | null })[]; meta?: WorkspaceMeta }>(`/setup/${list}`);
    const workspaces = data?.meta?.workspaces ?? null;
    const [workspace, setWorkspace] = useState('');
    const [editing, setEditing] = useState<T | null>(null);
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState<F>(blank);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    function start(row: T | null) {
        setEditing(row);
        setForm(row ? toForm(row) : blank);
        // A new item is for the open workspace unless another (or all) is picked.
        const id = row ? (row as T & { workspace_id?: number | null }).workspace_id : data?.meta?.workspace_id;
        setWorkspace(id ? String(id) : '');
        setErrors({});
        setOpen(true);
    }

    async function save() {
        setSaving(true);
        try {
            const body = workspaces ? { ...form, workspace_id: workspace ? Number(workspace) : null } : form;
            if (editing) {
                await api.put(`/setup/${list}/${editing.id}`, body);
            } else {
                await api.post(`/setup/${list}`, body);
            }
            toast('Saved.');
            setOpen(false);
            reload();
            onChanged?.();
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
        if (!(await confirmDialog('Delete this record?'))) {
            return;
        }
        try {
            await api.delete(`/setup/${list}/${row.id}`);
            toast('Deleted.');
            reload();
            onChanged?.();
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    return (
        <div className="space-y-4">
            {intro}
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
                                {workspaces && <th>Workspace</th>}
                                <th className="w-24" />
                            </tr>
                        </thead>
                        <tbody>
                            {data.data.map((row) => (
                                <tr key={row.id}>
                                    {columns.map((c) => (
                                        <td key={c.label}>{c.render(row)}</td>
                                    ))}
                                    {workspaces && (
                                        <td className="text-gray-500">{workspaces.find((w) => w.id === row.workspace_id)?.name ?? 'All workspaces'}</td>
                                    )}
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
                <div className="space-y-4">
                    {renderForm(form, (patch) => setForm((f) => ({ ...f, ...patch })), errors)}
                    {workspaces && (
                        <Field label="Workspace" error={errors.workspace_id} hint="Shown only in this workspace, or in all of them.">
                            <Select value={workspace} onChange={(e) => setWorkspace(e.target.value)}>
                                <option value="">All workspaces</option>
                                {workspaces.map((w) => (
                                    <option key={w.id} value={w.id}>
                                        {w.name}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                    )}
                </div>
            </Modal>
        </div>
    );
}
