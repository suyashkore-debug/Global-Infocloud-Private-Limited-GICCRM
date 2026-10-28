import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useApi } from '../../hooks/useApi';
import { usePermission } from '../../hooks/usePermission';
import { Button, EmptyState, Input, Modal, Spinner, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

type MailList = { id: number; name: string; emails_count: number; created_at: string };

/** Perfex survey mail lists: name a list and add / import e-mail addresses. */
export default function MailListsPage() {
    const toast = useToast();
    const canEdit = usePermission('surveys.edit');
    const canCreate = usePermission('surveys.create');
    const canDelete = usePermission('surveys.delete');
    const { data, reload } = useApi<{ data: MailList[] }>('/mail-lists');
    const [name, setName] = useState('');
    const [open, setOpen] = useState<MailList | null>(null);

    async function create() {
        try {
            await api.post('/mail-lists', { name });
            setName('');
            reload();
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    async function remove(list: MailList) {
        if (!confirm(`Delete the mail list "${list.name}"?`)) {
            return;
        }
        await api.delete(`/mail-lists/${list.id}`);
        reload();
    }

    return (
        <div className="max-w-4xl space-y-4">
            <div className="flex items-center gap-2">
                <Link to="/utilities/surveys" className="text-gray-500 hover:text-gray-800">
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <h4 className="page-title">Mail Lists</h4>
            </div>
            {canCreate && (
                <div className="flex gap-2">
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New list name" className="max-w-sm" />
                    <Button onClick={create} disabled={!name.trim()}>
                        <Plus className="h-4 w-4" /> Add
                    </Button>
                </div>
            )}
            {!data ? (
                <Spinner />
            ) : data.data.length === 0 ? (
                <EmptyState title="No mail lists" text="Staff, customers and leads are always available when sending a survey; add a list for other addresses." />
            ) : (
                <div className="panel_s overflow-x-auto">
                    <table className="table-perfex">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th className="text-right">E-mails</th>
                                <th>Date Created</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {data.data.map((l) => (
                                <tr key={l.id}>
                                    <td>
                                        <button type="button" onClick={() => setOpen(l)} className="font-medium text-blue-600 hover:underline">
                                            {l.name}
                                        </button>
                                    </td>
                                    <td className="text-right">{l.emails_count}</td>
                                    <td>{formatDate(l.created_at)}</td>
                                    <td className="text-right">
                                        {canDelete && (
                                            <button type="button" onClick={() => remove(l)} className="text-gray-400 hover:text-red-600" title="Delete">
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {open && (
                <ListModal
                    list={open}
                    canEdit={canEdit}
                    onClose={() => {
                        setOpen(null);
                        reload();
                    }}
                />
            )}
        </div>
    );
}

function ListModal({ list, canEdit, onClose }: { list: MailList; canEdit: boolean; onClose: () => void }) {
    const toast = useToast();
    const { data, reload } = useApi<{ data: { emails: { id: number; email: string; created_at: string }[] } }>(`/mail-lists/${list.id}`);
    const [text, setText] = useState('');

    async function add() {
        try {
            const res = await api.post<{ message: string }>(`/mail-lists/${list.id}/emails`, { emails: text });
            toast(res.data.message);
            setText('');
            reload();
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    return (
        <Modal open title={list.name} onClose={onClose} size="lg">
            <div className="space-y-4">
                {canEdit && (
                    <div className="space-y-2">
                        <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add e-mail addresses: one per line, or separated by commas (paste from Excel to import)" />
                        <Button size="sm" onClick={add} disabled={!text.trim()}>
                            Add e-mails
                        </Button>
                    </div>
                )}
                {!data ? (
                    <Spinner />
                ) : (
                    <ul className="max-h-96 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200">
                        {data.data.emails.map((e) => (
                            <li key={e.id} className="flex items-center gap-2 px-3 py-2 text-[13px]">
                                <span className="flex-1">{e.email}</span>
                                <span className="text-xs text-gray-400">{formatDate(e.created_at)}</span>
                                {canEdit && (
                                    <button type="button" onClick={() => api.delete(`/mail-lists/${list.id}/emails/${e.id}`).then(reload)} className="text-gray-400 hover:text-red-600" title="Remove">
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </li>
                        ))}
                        {data.data.emails.length === 0 && <li className="px-3 py-4 text-center text-[13px] text-gray-500">No e-mails in this list.</li>}
                    </ul>
                )}
            </div>
        </Modal>
    );
}
