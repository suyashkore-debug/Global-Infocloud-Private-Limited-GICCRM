import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, FileDown, Pencil } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { optionById } from '../../lib/constants';
import { formatDate } from '../../lib/format';
import { PROPOSAL_STATUSES } from '../../lib/sales';
import { useApi } from '../../hooks/useApi';
import { usePermission } from '../../hooks/usePermission';
import { Button, ErrorNote, Menu, MenuItem, Spinner, StatusBadge } from '../../components/ui';
import { RichContent } from '../../components/editor/RichTextEditor';
import { useToast } from '../../components/ui/Toast';
import DocumentPreview from '../../components/sales/DocumentPreview';
import type { Proposal } from '../../types';
import { openPdf } from './InvoiceViewPage';
import SendEmailButton from '../../components/email/SendEmailButton';
import { usePageCrumb } from '../../layouts/Breadcrumbs';

export default function ProposalViewPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const canCreate = usePermission('proposals.create');
    const canEstimate = usePermission('estimates.create');
    const canInvoice = usePermission('invoices.create');
    const { data, error, setData } = useApi<{ data: Proposal }>(`/proposals/${id}`);
    const proposal = data?.data;
    usePageCrumb(proposal?.formatted_number);

    if (error) {
        return <ErrorNote message={error} />;
    }
    if (!proposal) {
        return <Spinner />;
    }

    async function setStatus(status: number) {
        try {
            const { data: result } = await api.post<{ data: Proposal }>(`/proposals/${proposal!.id}/status`, { status });
            setData(result);
            toast('Status updated.');
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    async function convert(to: 'estimate' | 'invoice') {
        try {
            const { data: result } = await api.post<{ data: { id: number } }>(`/proposals/${proposal!.id}/convert`, { to });
            toast(`Proposal converted to ${to}.`);
            navigate(`/${to}s/${result.data.id}`);
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    async function copy() {
        try {
            const { data: result } = await api.post<{ data: Proposal }>(`/proposals/${proposal!.id}/copy`);
            toast('Proposal copied.');
            navigate(`/proposals/${result.data.id}`);
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    async function remove() {
        if (!confirm('Delete this proposal?')) {
            return;
        }
        try {
            await api.delete(`/proposals/${proposal!.id}`);
            toast('Proposal deleted.');
            navigate('/proposals');
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    const converted = proposal.estimate ?? proposal.invoice;
    const fileName = `${proposal.formatted_number}.pdf`;

    return (
        <div className="w-full space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <h4 className="page-title mr-2 flex items-center gap-2">
                    {proposal.formatted_number} {proposal.subject} <StatusBadge option={optionById(PROPOSAL_STATUSES, proposal.status)} />
                </h4>
                {converted && (
                    <span className="text-[13px] text-gray-600">
                        Converted to{' '}
                        <Link to={proposal.estimate ? `/estimates/${proposal.estimate.id}` : `/invoices/${proposal.invoice!.id}`}>{converted.formatted_number}</Link>
                    </span>
                )}
                <div className="ml-auto flex flex-wrap gap-2">
                    {proposal.can.update && (
                        <Button variant="secondary" onClick={() => navigate(`/proposals/${proposal.id}/edit`)}>
                            <Pencil className="h-4 w-4" /> Edit
                        </Button>
                    )}
                    <SendEmailButton type="proposals" id={proposal.id} onSent={() => api.get<{ data: Proposal }>(`/proposals/${proposal.id}`).then((r) => setData(r.data))} />
                    <Menu
                        trigger={(toggle) => (
                            <Button variant="secondary" onClick={toggle}>
                                <FileDown className="h-4 w-4" /> PDF <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                        )}
                    >
                        {(close) => (
                            <>
                                <MenuItem onClick={() => (close(), openPdf(`/proposals/${proposal.id}/pdf`, fileName, false))}>View PDF</MenuItem>
                                <MenuItem onClick={() => (close(), openPdf(`/proposals/${proposal.id}/pdf`, fileName, true))}>Download</MenuItem>
                            </>
                        )}
                    </Menu>
                    {!converted && proposal.can.update && proposal.customer && (canEstimate || canInvoice) && (
                        <Menu
                            trigger={(toggle) => (
                                <Button onClick={toggle}>
                                    Convert <ChevronDown className="h-3.5 w-3.5" />
                                </Button>
                            )}
                        >
                            {(close) => (
                                <>
                                    {canEstimate && <MenuItem onClick={() => (close(), convert('estimate'))}>Convert to Estimate</MenuItem>}
                                    {canInvoice && <MenuItem onClick={() => (close(), convert('invoice'))}>Convert to Invoice</MenuItem>}
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
                                {proposal.can.update &&
                                    PROPOSAL_STATUSES.filter((s) => s.id !== proposal.status).map((s) => (
                                        <MenuItem key={s.id} onClick={() => (close(), setStatus(s.id))}>
                                            Mark as {s.name}
                                        </MenuItem>
                                    ))}
                                {canCreate && <MenuItem onClick={() => (close(), copy())}>Copy Proposal</MenuItem>}
                                {proposal.can.delete && (
                                    <MenuItem danger onClick={() => (close(), remove())}>
                                        Delete
                                    </MenuItem>
                                )}
                            </>
                        )}
                    </Menu>
                </div>
            </div>
            <DocumentPreview
                document={proposal}
                customFields={{ to: 'proposal', id: proposal.id }}
                to={
                    <div>
                        <p className="font-semibold text-gray-800">To:</p>
                        <p className="font-semibold">{proposal.customer ? <Link to={`/customers/${proposal.customer.id}`}>{proposal.proposal_to}</Link> : proposal.proposal_to}</p>
                        {proposal.address && <p className="whitespace-pre-wrap text-gray-600">{proposal.address}</p>}
                        <p className="text-gray-600">{[proposal.city, proposal.state].filter(Boolean).join(', ')}</p>
                        <p className="text-gray-600">{[proposal.country, proposal.zip].filter(Boolean).join(' ')}</p>
                        {proposal.email && <p className="text-gray-600">{proposal.email}</p>}
                        {proposal.phone && <p className="text-gray-600">{proposal.phone}</p>}
                    </div>
                }
                info={[
                    ['Date', formatDate(proposal.date)],
                    ['Open Till', proposal.open_till ? formatDate(proposal.open_till) : null],
                    ['Assigned', proposal.assigned?.full_name],
                ]}
                notes={proposal.content_html ? <RichContent html={proposal.content_html} className="rounded-md border border-gray-200 bg-white p-4" /> : null}
            />
        </div>
    );
}
