import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, FileDown, Pencil } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { optionById } from '../../lib/constants';
import { formatDate } from '../../lib/format';
import { ESTIMATE_STATUSES } from '../../lib/sales';
import { useApi } from '../../hooks/useApi';
import { usePermission } from '../../hooks/usePermission';
import { Button, ErrorNote, Menu, MenuItem, Spinner, StatusBadge } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import DocumentPreview from '../../components/sales/DocumentPreview';
import type { Estimate } from '../../types';
import { openPdf } from './InvoiceViewPage';
import SendEmailButton from '../../components/email/SendEmailButton';
import { usePageCrumb } from '../../layouts/Breadcrumbs';

export default function EstimateViewPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const canCreate = usePermission('estimates.create');
    const canInvoice = usePermission('invoices.create');
    const { data, error, setData } = useApi<{ data: Estimate }>(`/estimates/${id}`);
    const estimate = data?.data;
    usePageCrumb(estimate?.formatted_number);

    if (error) {
        return <ErrorNote message={error} />;
    }
    if (!estimate) {
        return <Spinner />;
    }

    async function run(call: () => Promise<{ data: { data: Estimate } }>, success: string) {
        try {
            const { data: result } = await call();
            setData(result);
            toast(success);
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    async function convert(draft: boolean) {
        try {
            const { data: result } = await api.post<{ data: { id: number } }>(`/estimates/${estimate!.id}/convert`, { draft });
            toast('Estimate converted to invoice.');
            navigate(`/invoices/${result.data.id}`);
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    async function copy() {
        try {
            const { data: result } = await api.post<{ data: Estimate }>(`/estimates/${estimate!.id}/copy`);
            toast('Estimate copied.');
            navigate(`/estimates/${result.data.id}`);
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    async function remove() {
        if (!confirm(`Delete estimate ${estimate!.formatted_number}?`)) {
            return;
        }
        try {
            await api.delete(`/estimates/${estimate!.id}`);
            toast('Estimate deleted.');
            navigate('/estimates');
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    const fileName = `${estimate.formatted_number.replace(/[/\\]/g, '-')}.pdf`;
    const setStatus = (status: number, label: string) => run(() => api.post(`/estimates/${estimate.id}/action`, { action: 'status', status }), `Marked as ${label}.`);

    return (
        <div className="w-full space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <h4 className="page-title mr-2 flex items-center gap-2">
                    {estimate.formatted_number} <StatusBadge option={optionById(ESTIMATE_STATUSES, estimate.status)} />
                </h4>
                {estimate.invoice && (
                    <span className="text-[13px] text-gray-600">
                        Invoiced: <Link to={`/invoices/${estimate.invoice.id}`}>{estimate.invoice.formatted_number}</Link>
                    </span>
                )}
                <div className="ml-auto flex flex-wrap gap-2">
                    {estimate.can.update && (
                        <Button variant="secondary" onClick={() => navigate(`/estimates/${estimate.id}/edit`)}>
                            <Pencil className="h-4 w-4" /> Edit
                        </Button>
                    )}
                    <SendEmailButton type="estimates" id={estimate.id} onSent={() => api.get<{ data: Estimate }>(`/estimates/${estimate.id}`).then((r) => setData(r.data))} />
                    <Menu
                        trigger={(toggle) => (
                            <Button variant="secondary" onClick={toggle}>
                                <FileDown className="h-4 w-4" /> PDF <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                        )}
                    >
                        {(close) => (
                            <>
                                <MenuItem onClick={() => (close(), openPdf(`/estimates/${estimate.id}/pdf`, fileName, false))}>View PDF</MenuItem>
                                <MenuItem onClick={() => (close(), openPdf(`/estimates/${estimate.id}/pdf`, fileName, true))}>Download</MenuItem>
                            </>
                        )}
                    </Menu>
                    {!estimate.invoice && estimate.can.update && canInvoice && (
                        <Menu
                            trigger={(toggle) => (
                                <Button onClick={toggle}>
                                    Convert to Invoice <ChevronDown className="h-3.5 w-3.5" />
                                </Button>
                            )}
                        >
                            {(close) => (
                                <>
                                    <MenuItem onClick={() => (close(), convert(false))}>Convert</MenuItem>
                                    <MenuItem onClick={() => (close(), convert(true))}>Convert and save as draft</MenuItem>
                                </>
                            )}
                        </Menu>
                    )}
                    <Menu
                        trigger={(toggle) => (
                            <Button variant="secondary" onClick={toggle}>
                                More <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                        )}
                    >
                        {(close) => (
                            <>
                                {estimate.can.update && !estimate.sent && <MenuItem onClick={() => (close(), run(() => api.post(`/estimates/${estimate.id}/action`, { action: 'mark_sent' }), 'Marked as sent.'))}>Mark as Sent</MenuItem>}
                                {estimate.can.update &&
                                    ESTIMATE_STATUSES.filter((s) => s.id !== estimate.status).map((s) => (
                                        <MenuItem key={s.id} onClick={() => (close(), setStatus(s.id, s.name))}>
                                            Mark as {s.name}
                                        </MenuItem>
                                    ))}
                                {canCreate && <MenuItem onClick={() => (close(), copy())}>Copy Estimate</MenuItem>}
                                {estimate.can.delete && (
                                    <MenuItem danger onClick={() => (close(), remove())}>
                                        Delete Estimate
                                    </MenuItem>
                                )}
                            </>
                        )}
                    </Menu>
                </div>
            </div>
            <DocumentPreview
                document={estimate}
                customFields={{ to: 'estimate', id: estimate.id }}
                info={[
                    ['Estimate Date', formatDate(estimate.date)],
                    ['Expiry Date', estimate.expiry_date ? formatDate(estimate.expiry_date) : null],
                    ['Reference #', estimate.reference_no],
                    ['Sale Agent', estimate.sale_agent?.full_name],
                    ['Project', estimate.project ? <Link to={`/projects/${estimate.project.id}`}>{estimate.project.name}</Link> : null],
                ]}
            />
        </div>
    );
}
