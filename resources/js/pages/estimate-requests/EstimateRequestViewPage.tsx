import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useApi } from '../../hooks/useApi';
import { usePermission } from '../../hooks/usePermission';
import { useStaff } from '../../hooks/useStaff';
import { AttachmentList } from '../../components/comments/AttachmentList';
import { Button, ErrorNote, Field, Input, Modal, Select, Spinner, TagInput } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import type { EstimateRequestDetail, RequestStatus } from './types';

/** One estimate request: the submitted answers, status / assignee / tags, and Convert. */
export default function EstimateRequestViewPage() {
    const { id } = useParams();
    const toast = useToast();
    const navigate = useNavigate();
    const staff = useStaff();
    const canEdit = usePermission('estimate_request.edit');
    const canDelete = usePermission('estimate_request.delete');
    const { data, error, setData } = useApi<{ data: EstimateRequestDetail }>(`/estimate-requests/${id}`);
    const { data: statuses } = useApi<{ data: RequestStatus[] }>('/setup/estimate-request-statuses');
    const [convertTo, setConvertTo] = useState<'estimate' | 'proposal' | null>(null);

    async function patch(body: Record<string, unknown>) {
        try {
            const res = await api.patch<{ data: EstimateRequestDetail }>(`/estimate-requests/${id}`, body);
            setData(res.data);
            toast('Estimate request updated.');
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    async function remove() {
        if (!confirm('Delete this estimate request?')) {
            return;
        }
        await api.delete(`/estimate-requests/${id}`);
        navigate('/estimate-requests');
    }

    if (error) {
        return <ErrorNote message={error} />;
    }
    if (!data) {
        return <Spinner />;
    }
    const r = data.data;

    return (
        <div className="w-full space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <Link to="/estimate-requests" className="text-gray-500 hover:text-gray-800">
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <h4 className="page-title mr-auto">Estimate Request #{r.id}</h4>
                <Button variant="secondary" onClick={() => setConvertTo('proposal')}>
                    Convert to Proposal
                </Button>
                <Button onClick={() => setConvertTo('estimate')}>Convert to Estimate</Button>
                {canDelete && (
                    <Button variant="danger" onClick={remove} title="Delete">
                        <Trash2 className="h-4 w-4" />
                    </Button>
                )}
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="panel_s">
                    <div className="panel-body space-y-4">
                        <h5 className="text-[15px] font-semibold">Submitted information</h5>
                        <dl className="divide-y divide-gray-100 text-[13.5px]">
                            {r.submission.map((f) => (
                                <div key={f.name} className="grid gap-1 py-2.5 sm:grid-cols-[200px_minmax(0,1fr)]">
                                    <dt className="font-medium text-gray-600">{f.label}</dt>
                                    <dd className="whitespace-pre-wrap text-gray-900">{Array.isArray(f.value) ? f.value.join(', ') : f.value || '-'}</dd>
                                </div>
                            ))}
                        </dl>
                        {r.attachments.length > 0 && (
                            <div>
                                <h5 className="mb-2 text-[15px] font-semibold">Attachments</h5>
                                <AttachmentList files={r.attachments} canDelete={() => false} onDelete={() => undefined} />
                            </div>
                        )}
                    </div>
                </div>

                <div className="panel_s self-start">
                    <div className="panel-body space-y-3 text-[13px]">
                        <Field label="Status">
                            <Select value={r.status?.id ?? ''} disabled={!canEdit} onChange={(e) => patch({ estimate_request_status_id: Number(e.target.value) })}>
                                {statuses?.data.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.name}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                        <Field label="Assigned">
                            <Select value={r.assigned?.id ?? ''} disabled={!canEdit} onChange={(e) => patch({ assigned_id: e.target.value ? Number(e.target.value) : null })}>
                                <option value="">Not assigned</option>
                                {staff.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.full_name}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                        <Field label="Tags">{canEdit ? <TagInput value={r.tags} onChange={(tags) => patch({ tags })} /> : <span>{r.tags.join(', ') || '-'}</span>}</Field>
                        <dl className="space-y-1.5 border-t border-gray-100 pt-3 text-gray-600">
                            <div>
                                <dt className="inline font-medium">Form: </dt>
                                <dd className="inline">{r.form ?? '-'}</dd>
                            </div>
                            <div>
                                <dt className="inline font-medium">Submitted: </dt>
                                <dd className="inline">{formatDateTime(r.created_at)}</dd>
                            </div>
                            {r.last_status_change_at && (
                                <div>
                                    <dt className="inline font-medium">Last status change: </dt>
                                    <dd className="inline">{formatDateTime(r.last_status_change_at)}</dd>
                                </div>
                            )}
                            {r.estimate && (
                                <div>
                                    <dt className="inline font-medium">Estimate: </dt>
                                    <dd className="inline">
                                        <Link to={`/estimates/${r.estimate.id}`} className="text-blue-600 hover:underline">
                                            {r.estimate.number}
                                        </Link>
                                    </dd>
                                </div>
                            )}
                            {r.proposal && (
                                <div>
                                    <dt className="inline font-medium">Proposal: </dt>
                                    <dd className="inline">
                                        <Link to={`/proposals/${r.proposal.id}`} className="text-blue-600 hover:underline">
                                            {r.proposal.number}
                                        </Link>
                                    </dd>
                                </div>
                            )}
                        </dl>
                    </div>
                </div>
            </div>

            {convertTo && <ConvertModal request={r} convertTo={convertTo} onClose={() => setConvertTo(null)} />}
        </div>
    );
}

/** Perfex convert dialog: use an existing customer or create one from the submitted details. */
function ConvertModal({ request, convertTo, onClose }: { request: EstimateRequestDetail; convertTo: 'estimate' | 'proposal'; onClose: () => void }) {
    const navigate = useNavigate();
    const [mode, setMode] = useState<'new' | 'existing'>('new');
    const [customers, setCustomers] = useState<{ id: number; name: string }[]>([]);
    const [customerId, setCustomerId] = useState('');
    const [form, setForm] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(request.prefill).map(([k, v]) => [k, v ?? ''])));
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        api.get<{ data: { id: number; name: string }[] }>('/customers/options').then((r) => setCustomers(r.data.data));
    }, []);

    async function submit() {
        setSaving(true);
        setErrors({});
        setError(null);
        try {
            const body = mode === 'existing' ? { convert_to: convertTo, customer_id: Number(customerId) } : { convert_to: convertTo, ...form };
            const res = await api.post<{ data: { redirect: string } }>(`/estimate-requests/${request.id}/convert`, body);
            navigate(res.data.data.redirect);
        } catch (e) {
            const err = e as { response?: { data?: { errors?: Record<string, string[]> } } };
            setErrors(Object.fromEntries(Object.entries(err.response?.data?.errors ?? {}).map(([k, v]) => [k, v[0]])));
            setError(errorMessage(e));
        } finally {
            setSaving(false);
        }
    }

    const input = (key: string, label: string, required = false) => (
        <Field label={label} required={required} error={errors[key]}>
            <Input value={form[key] ?? ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
        </Field>
    );

    return (
        <Modal
            open
            title={`Convert to ${convertTo === 'estimate' ? 'Estimate' : 'Proposal'}`}
            onClose={onClose}
            size="lg"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={submit} loading={saving} disabled={mode === 'existing' && !customerId}>
                        Continue
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <div className="flex gap-4 text-[13px]">
                    <label className="flex items-center gap-1.5">
                        <input type="radio" checked={mode === 'new'} onChange={() => setMode('new')} /> New customer
                    </label>
                    <label className="flex items-center gap-1.5">
                        <input type="radio" checked={mode === 'existing'} onChange={() => setMode('existing')} /> Existing customer
                    </label>
                </div>
                <ErrorNote message={error} />
                {mode === 'existing' ? (
                    <Field label="Customer" required error={errors.customer_id}>
                        <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                            <option value="">Select customer</option>
                            {customers.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </Select>
                    </Field>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                        {input('company', 'Company', true)}
                        {input('email', 'Email', true)}
                        {input('first_name', 'First Name', true)}
                        {input('last_name', 'Last Name')}
                        {input('phone', 'Phone')}
                        {input('website', 'Website')}
                        {input('address', 'Address')}
                        {input('city', 'City')}
                        {input('state', 'State')}
                        {input('zip', 'Zip Code')}
                        {input('country', 'Country')}
                    </div>
                )}
            </div>
        </Modal>
    );
}
