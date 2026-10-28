import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../auth/AuthContext';
import { useApi } from '../../hooks/useApi';
import { useStaff } from '../../hooks/useStaff';
import { Button, Field, Input, Spinner, StaffMultiSelect, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

type ApprovalSetting = { id: number; name: string; related: 'pur_request' | 'pur_order'; approver_ids: number[] };
const RELATED = { pur_request: 'Purchase Requests', pur_order: 'Purchase Orders' } as const;
const OPTION_KEYS: [string, string][] = [
    ['pur_request_prefix', 'Purchase request prefix'],
    ['next_pr_number', 'Next purchase request number'],
    ['pur_order_prefix', 'Purchase order prefix'],
    ['next_po_number', 'Next purchase order number'],
    ['pur_inv_prefix', 'Purchase invoice prefix'],
    ['next_pur_inv_number', 'Next purchase invoice number'],
];

/** Purchase settings (admins): approvers per document type, numbering, default terms. */
export default function PurchaseSettingsPage() {
    const { user } = useAuth();
    const toast = useToast();
    const staff = useStaff();
    const approvals = useApi<{ data: ApprovalSetting[] }>(user?.is_admin ? '/purchase/approval-settings' : null);
    const options = useApi<{ data: Record<string, string> }>(user?.is_admin ? '/setup/options' : null);
    const [opts, setOpts] = useState<Record<string, string> | null>(null);
    const [drafts, setDrafts] = useState<Record<string, number[]>>({});

    useEffect(() => {
        if (options.data) {
            setOpts(options.data.data);
        }
    }, [options.data]);

    if (!user?.is_admin) {
        return <Navigate to="/" replace />;
    }

    async function saveApproval(related: keyof typeof RELATED, existing: ApprovalSetting | undefined) {
        const ids = drafts[related] ?? existing?.approver_ids ?? [];
        try {
            const body = { name: `${RELATED[related]} approver`, related, approver_ids: ids };
            await (existing ? api.put(`/purchase/approval-settings/${existing.id}`, body) : api.post('/purchase/approval-settings', body));
            toast('Approval setting saved.');
            approvals.reload();
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    async function saveOptions() {
        try {
            await api.put('/setup/options', { options: Object.fromEntries([...OPTION_KEYS.map(([k]) => k), 'pur_terms_and_conditions', 'pur_vendor_note'].map((k) => [k, opts?.[k] ?? ''])) });
            toast('Settings saved.');
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    return (
        <div className="w-full space-y-4">
            <h4 className="page-title">Purchase Settings</h4>
            <div className="panel_s">
                <div className="panel-body space-y-4">
                    <div>
                        <h5 className="font-semibold">Approval</h5>
                        <p className="text-xs text-gray-500">Who must approve before a request / order is approved. Without approvers, "Send for approval" approves straight away.</p>
                    </div>
                    {!approvals.data ? (
                        <Spinner />
                    ) : (
                        (Object.keys(RELATED) as (keyof typeof RELATED)[]).map((related) => {
                            const existing = approvals.data!.data.find((a) => a.related === related);

                            return (
                                <div key={related} className="grid items-end gap-3 sm:grid-cols-[200px_1fr_auto_auto]">
                                    <span className="pb-2 text-[13.5px] font-medium">{RELATED[related]}</span>
                                    <StaffMultiSelect staff={staff} value={drafts[related] ?? existing?.approver_ids ?? []} onChange={(ids) => setDrafts({ ...drafts, [related]: ids })} placeholder="No approval needed" />
                                    <Button size="sm" onClick={() => saveApproval(related, existing)} disabled={(drafts[related] ?? existing?.approver_ids ?? []).length === 0}>
                                        Save
                                    </Button>
                                    {existing ? (
                                        <button type="button" onClick={() => api.delete(`/purchase/approval-settings/${existing.id}`).then(() => (setDrafts({ ...drafts, [related]: [] }), approvals.reload()))} className="pb-2 text-gray-400 hover:text-red-600" title="Remove approval">
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    ) : (
                                        <span />
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
            <div className="panel_s">
                <div className="panel-body space-y-3">
                    <h5 className="font-semibold">Numbering &amp; defaults</h5>
                    {!opts ? (
                        <Spinner />
                    ) : (
                        <>
                            <div className="grid gap-3 sm:grid-cols-2">
                                {OPTION_KEYS.map(([k, label]) => (
                                    <Field key={k} label={label}>
                                        <Input value={opts[k] ?? ''} onChange={(e) => setOpts({ ...opts, [k]: e.target.value })} />
                                    </Field>
                                ))}
                            </div>
                            <Field label="Default terms & conditions">
                                <Textarea rows={3} value={opts.pur_terms_and_conditions ?? ''} onChange={(e) => setOpts({ ...opts, pur_terms_and_conditions: e.target.value })} />
                            </Field>
                            <Field label="Default vendor note">
                                <Textarea rows={2} value={opts.pur_vendor_note ?? ''} onChange={(e) => setOpts({ ...opts, pur_vendor_note: e.target.value })} />
                            </Field>
                            <Button onClick={saveOptions}>Save</Button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
