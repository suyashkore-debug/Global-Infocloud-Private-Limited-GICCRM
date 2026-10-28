import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useAuth } from '../../auth/AuthContext';
import { useApi } from '../../hooks/useApi';
import { Button, Checkbox, EmptyState, Field, IconButton, Input, Modal, Spinner, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

interface Announcement {
    id: number;
    name: string;
    message: string;
    show_to_staff: boolean;
    show_to_customers: boolean;
    show_name: boolean;
    author: string | null;
    dismissed: boolean;
    created_at: string;
}

export default function AnnouncementsPage() {
    const toast = useToast();
    const { user } = useAuth();
    const { data, reload } = useApi<{ data: Announcement[] }>('/announcements');
    const [editing, setEditing] = useState<Announcement | null>(null);
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({ name: '', message: '', show_to_staff: true, show_to_customers: false, show_name: false });

    function start(a: Announcement | null) {
        setEditing(a);
        setForm(a ? { name: a.name, message: a.message, show_to_staff: a.show_to_staff, show_to_customers: a.show_to_customers, show_name: a.show_name } : { name: '', message: '', show_to_staff: true, show_to_customers: false, show_name: false });
        setOpen(true);
    }

    async function save() {
        try {
            if (editing) {
                await api.put(`/announcements/${editing.id}`, form);
            } else {
                await api.post('/announcements', form);
            }
            toast('Announcement saved.');
            setOpen(false);
            reload();
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    return (
        <div className="w-full space-y-4">
            <h4 className="page-title">Announcements</h4>
            {user?.is_admin && (
                <Button onClick={() => start(null)}>
                    <Plus className="h-4 w-4" /> New Announcement
                </Button>
            )}
            {!data ? (
                <Spinner />
            ) : data.data.length === 0 ? (
                <EmptyState title="No announcements" />
            ) : (
                <div className="space-y-3">
                    {data.data.map((a) => (
                        <div key={a.id} className="panel_s !mb-0">
                            <div className="panel-body !p-5">
                                <div className="flex items-start gap-2">
                                    <div className="min-w-0 flex-1">
                                        <h5 className="font-semibold text-gray-800">{a.name}</h5>
                                        <p className="text-xs text-gray-400">
                                            {formatDateTime(a.created_at)}
                                            {a.author && ` · ${a.author}`}
                                            {a.show_to_staff && ' · Staff'}
                                            {a.show_to_customers && ' · Customers'}
                                        </p>
                                    </div>
                                    {user?.is_admin && (
                                        <>
                                            <IconButton label="Edit" onClick={() => start(a)}>
                                                <Pencil className="h-4 w-4" />
                                            </IconButton>
                                            <IconButton label="Delete" onClick={() => confirm('Delete?') && api.delete(`/announcements/${a.id}`).then(reload)} className="hover:text-red-600">
                                                <Trash2 className="h-4 w-4" />
                                            </IconButton>
                                        </>
                                    )}
                                </div>
                                <p className="mt-2 whitespace-pre-wrap text-[13.5px] text-gray-700">{a.message}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            <Modal
                open={open}
                onClose={() => setOpen(false)}
                title={editing ? 'Edit Announcement' : 'New Announcement'}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setOpen(false)}>
                            Close
                        </Button>
                        <Button onClick={save}>Save</Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <Field label="Subject" required>
                        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    </Field>
                    <Field label="Message" required>
                        <Textarea rows={6} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
                    </Field>
                    <div className="flex flex-wrap gap-5">
                        <Checkbox label="Show to staff" checked={form.show_to_staff} onChange={(v) => setForm({ ...form, show_to_staff: v })} />
                        <Checkbox label="Show to customers" checked={form.show_to_customers} onChange={(v) => setForm({ ...form, show_to_customers: v })} />
                        <Checkbox label="Show my name" checked={form.show_name} onChange={(v) => setForm({ ...form, show_name: v })} />
                    </div>
                </div>
            </Modal>
        </div>
    );
}
