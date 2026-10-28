import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, Pencil, FileDown } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { formatDate, formatDateTime } from '../../lib/format';
import { money } from '../../lib/sales';
import { useApi } from '../../hooks/useApi';
import { usePermission } from '../../hooks/usePermission';
import { useStaff } from '../../hooks/useStaff';
import { Button, ErrorNote, Field, Input, Menu, MenuItem, Modal, Spinner, Tabs } from '../../components/ui';
import { RichContent } from '../../components/editor/RichTextEditor';
import { useToast } from '../../components/ui/Toast';
import { CommentBox, MentionText } from '../../components/comments/Mentions';
import { FilesPanel, NotesPanel, RemindersPanel } from '../../components/records/RecordPanels';
import type { Contract } from '../../types';
import { CustomFieldsView } from '../../components/customfields/CustomFields';
import SendEmailButton from '../../components/email/SendEmailButton';
import { openPdf } from '../sales/InvoiceViewPage';
import { usePageCrumb } from '../../layouts/Breadcrumbs';

type Tab = 'contract' | 'attachments' | 'comments' | 'renewals' | 'notes' | 'reminders';

export default function ContractViewPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const staff = useStaff();
    const canCreate = usePermission('contracts.create');
    const { data, error, reload, setData } = useApi<{ data: Contract }>(`/contracts/${id}`);
    const [tab, setTab] = useState<Tab>('contract');
    const [renewOpen, setRenewOpen] = useState(false);
    const [renew, setRenew] = useState({ new_start_date: '', new_end_date: '', new_value: '' });
    const contract = data?.data;
    usePageCrumb(contract?.subject);

    if (error) {
        return <ErrorNote message={error} />;
    }
    if (!contract) {
        return <Spinner />;
    }

    async function action(name: string, message: string) {
        try {
            const { data: r } = await api.post<{ data: Contract }>(`/contracts/${contract!.id}/action`, { action: name });
            setData(r);
            toast(message);
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    async function doRenew() {
        try {
            const { data: r } = await api.post<{ data: Contract }>(`/contracts/${contract!.id}/renew`, { ...renew, new_end_date: renew.new_end_date || null, new_value: renew.new_value || null });
            setData(r);
            setRenewOpen(false);
            toast('Contract renewed.');
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    async function copy() {
        const { data: r } = await api.post<{ data: Contract }>(`/contracts/${contract!.id}/copy`);
        toast('Contract copied.');
        navigate(`/contracts/${r.data.id}`);
    }

    async function remove() {
        if (!confirm('Delete this contract?')) {
            return;
        }
        await api.delete(`/contracts/${contract!.id}`);
        toast('Contract deleted.');
        navigate('/contracts');
    }

    return (
        <div className="w-full space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <h4 className="page-title mr-2">{contract.subject}</h4>
                {contract.signed ? (
                    <span className="rounded-md bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">Signed {contract.signer_name ? `by ${contract.signer_name}` : ''}</span>
                ) : (
                    <span className="rounded-md bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10">Not Signed</span>
                )}
                {contract.trash && <span className="text-xs text-gray-500">(Trash)</span>}
                <div className="ml-auto flex flex-wrap gap-2">
                    {contract.can.update && (
                        <>
                            <Button variant="secondary" onClick={() => navigate(`/contracts/${contract.id}/edit`)}>
                                <Pencil className="h-4 w-4" /> Edit
                            </Button>
                            <Button
                                onClick={() => {
                                    setRenew({ new_start_date: contract.end_date ?? contract.start_date, new_end_date: '', new_value: contract.contract_value ?? '' });
                                    setRenewOpen(true);
                                }}
                            >
                                Renew Contract
                            </Button>
                        </>
                    )}
                    <SendEmailButton type="contracts" id={contract.id} onSent={reload} />
                    <Button variant="secondary" onClick={() => openPdf(`/contracts/${contract.id}/pdf`, `Contract-${contract.id}.pdf`, false)}>
                        <FileDown className="h-4 w-4" /> PDF
                    </Button>
                    <Menu
                        trigger={(toggle) => (
                            <Button variant="secondary" onClick={toggle}>
                                More <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                        )}
                    >
                        {(close) => (
                            <>
                                {contract.can.update && !contract.signed && <MenuItem onClick={() => (close(), action('sign', 'Marked as signed.'))}>Mark as Signed</MenuItem>}
                                {contract.can.update && contract.signed && <MenuItem onClick={() => (close(), action('unsign', 'Unmarked as signed.'))}>Unmark as Signed</MenuItem>}
                                {contract.can.update && <MenuItem onClick={() => (close(), action(contract.trash ? 'restore' : 'trash', contract.trash ? 'Restored.' : 'Moved to trash.'))}>{contract.trash ? 'Restore from Trash' : 'Move to Trash'}</MenuItem>}
                                {canCreate && <MenuItem onClick={() => (close(), copy())}>Copy</MenuItem>}
                                {contract.can.delete && (
                                    <MenuItem danger onClick={() => (close(), remove())}>
                                        Delete
                                    </MenuItem>
                                )}
                            </>
                        )}
                    </Menu>
                </div>
            </div>

            <div className="panel_s">
                <div className="panel-body grid gap-4 text-[13.5px] sm:grid-cols-3 lg:grid-cols-6">
                    <Info label="Customer">
                        <Link to={`/customers/${contract.customer?.id}`}>{contract.customer?.name}</Link>
                    </Info>
                    <Info label="Contract Type">{contract.type?.name ?? '—'}</Info>
                    <Info label="Contract Value">{contract.contract_value ? money(contract.contract_value) : '—'}</Info>
                    <Info label="Start Date">{formatDate(contract.start_date)}</Info>
                    <Info label="End Date">
                        <span className={contract.is_expired ? 'text-red-600' : ''}>{formatDate(contract.end_date)}</span>
                    </Info>
                    <Info label="Project">{contract.project ? <Link to={`/projects/${contract.project.id}`}>{contract.project.name}</Link> : '—'}</Info>
                    <CustomFieldsView to="contracts" id={contract.id} className="border-t border-gray-100 pt-3" />
                </div>
            </div>

            <Tabs
                tabs={[
                    { id: 'contract', label: 'Contract' },
                    { id: 'attachments', label: 'Attachments', count: contract.attachments?.length ?? 0 },
                    { id: 'comments', label: 'Comments', count: contract.comments?.length ?? 0 },
                    { id: 'renewals', label: 'Renewal History', count: contract.renewals?.length ?? 0 },
                    { id: 'notes', label: 'Notes' },
                    { id: 'reminders', label: 'Reminders' },
                ]}
                active={tab}
                onChange={setTab}
            />

            <div className="panel_s">
                <div className="panel-body">
                    {tab === 'contract' && (
                        <div className="space-y-4 text-[13.5px]">
                            {contract.description && <p className="text-gray-600">{contract.description}</p>}
                            <RichContent html={contract.content_html} className="rounded-md border border-gray-200 bg-white p-5" empty={<div className="rounded-md border border-gray-200 bg-gray-50 p-5 text-gray-500">No contract content yet. Edit the contract to add it.</div>} />
                            {contract.signed_at && <p className="text-xs text-gray-500">Signed {formatDateTime(contract.signed_at)}</p>}
                        </div>
                    )}
                    {tab === 'attachments' && <FilesPanel type="contract" id={contract.id} files={contract.attachments ?? []} canUpload={contract.can.update} onChange={reload} />}
                    {tab === 'comments' && (
                        <div className="space-y-4">
                            <ul className="space-y-3">
                                {contract.comments?.map((c) => (
                                    <li key={c.id} className="rounded-md bg-gray-50 px-3 py-2">
                                        <div className="flex items-center gap-2 text-xs text-gray-500">
                                            <span className="font-semibold text-gray-800">{c.user?.full_name}</span>
                                            {formatDateTime(c.created_at)}
                                            {(c.is_own || contract.can.update) && (
                                                <button type="button" onClick={() => api.delete(`/contract-comments/${c.id}`).then(reload)} className="ml-auto hover:text-red-600">
                                                    Delete
                                                </button>
                                            )}
                                        </div>
                                        <MentionText text={c.content} />
                                    </li>
                                ))}
                            </ul>
                            <CommentBox staff={staff} onSubmit={async (content) => (await api.post(`/contracts/${contract.id}/comments`, { content }), reload())} />
                        </div>
                    )}
                    {tab === 'renewals' && (
                        <table className="table-perfex">
                            <thead>
                                <tr>
                                    <th>Renewed</th>
                                    <th>By</th>
                                    <th>Start Date</th>
                                    <th>End Date</th>
                                    <th>Value</th>
                                </tr>
                            </thead>
                            <tbody>
                                {contract.renewals?.map((r) => (
                                    <tr key={r.id}>
                                        <td>{formatDateTime(r.created_at)}</td>
                                        <td>{r.renewed_by}</td>
                                        <td>
                                            {formatDate(r.old_start_date)} → {formatDate(r.new_start_date)}
                                        </td>
                                        <td>
                                            {formatDate(r.old_end_date)} → {formatDate(r.new_end_date)}
                                        </td>
                                        <td>
                                            {r.old_value ? money(r.old_value) : '—'} → {r.new_value ? money(r.new_value) : '—'}
                                        </td>
                                    </tr>
                                ))}
                                {contract.renewals?.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="text-center text-gray-500">
                                            Not renewed yet.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                    {tab === 'notes' && <NotesPanel type="contract" id={contract.id} />}
                    {tab === 'reminders' && <RemindersPanel type="contract" id={contract.id} />}
                </div>
            </div>

            <Modal
                open={renewOpen}
                onClose={() => setRenewOpen(false)}
                size="sm"
                title="Renew Contract"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setRenewOpen(false)}>
                            Close
                        </Button>
                        <Button onClick={doRenew}>Save</Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <Field label="New Start Date" required>
                        <Input type="date" value={renew.new_start_date} onChange={(e) => setRenew({ ...renew, new_start_date: e.target.value })} />
                    </Field>
                    <Field label="New End Date">
                        <Input type="date" value={renew.new_end_date} onChange={(e) => setRenew({ ...renew, new_end_date: e.target.value })} />
                    </Field>
                    <Field label="New Contract Value">
                        <Input type="number" step="any" value={renew.new_value} onChange={(e) => setRenew({ ...renew, new_value: e.target.value })} />
                    </Field>
                </div>
            </Modal>
        </div>
    );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="text-gray-500">{label}</p>
            <p className="font-medium">{children}</p>
        </div>
    );
}
