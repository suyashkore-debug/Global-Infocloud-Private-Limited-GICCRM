import { ArrowRight, Workflow } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { Checkbox, Field, Input, Select, StaffMultiSelect } from '../../components/ui';
import type { Staff } from '../../types';
import ListEditor from './ListEditor';

export type Pipeline = { id: number; name: string; color: string; sort_order: number; is_default: boolean; member_ids: number[] | null; statuses_count?: number };
type Status = {
    id: number;
    name: string;
    color: string;
    status_order: number;
    is_default: boolean;
    notify_lead: boolean;
    pipeline_id: number | null;
    pipeline_name?: string | null;
    move_to_status_id: number | null;
    move_assign: 'keep' | 'team' | 'user';
    move_assign_user_id: number | null;
};

const ASSIGN_LABELS = { keep: 'Keep the same owner', team: 'Share out to that workspace’s team in turn', user: 'Give it to one person' } as const;

/** Setup → Lead Workspaces (as TeleCRM): Sales, Post-sales, Support… each with its own statuses and team. */
export function LeadPipelinesList({ staff }: { staff: Staff[] }) {
    const names = (ids: number[] | null) => (ids?.length ? staff.filter((s) => ids.includes(s.id)).map((s) => s.full_name).join(', ') : null);

    return (
        <ListEditor<Pipeline, { name: string; color: string; sort_order: string; is_default: boolean; member_ids: number[] }>
            list="lead-pipelines"
            title="Workspace"
            intro={
                <div className="flex gap-3 rounded-2xl border border-brand/15 bg-brand-50/60 p-4 text-[13px] text-slate-600">
                    <Workflow className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
                    <div className="space-y-1">
                        <p className="font-semibold text-slate-800">A workspace is a separate board of leads for one team, e.g. Sales → Post-sales → Support. Pick it at the top, beside the search.</p>
                        <p>1. Add a workspace and choose its team (only they, and administrators, see its leads).</p>
                        <p>2. In Setup → Lead Statuses, add the workspace’s statuses (e.g. Onboarding, Installation, Done).</p>
                        <p>3. On a status like “Won”, set “Move the lead on to” a status of the next workspace: the lead then moves there by itself and goes to that team.</p>
                    </div>
                </div>
            }
            columns={[
                {
                    label: 'Name',
                    render: (p) => (
                        <span className="inline-flex items-center gap-2 font-semibold">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                            {p.name}
                            {p.is_default && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">Default</span>}
                        </span>
                    ),
                },
                { label: 'Team', render: (p) => names(p.member_ids) ?? <span className="text-slate-400">Everyone</span> },
                { label: 'Statuses', render: (p) => p.statuses_count ?? 0 },
                { label: 'Order', render: (p) => p.sort_order },
            ]}
            blank={{ name: '', color: '#2a78d6', sort_order: '1', is_default: false, member_ids: [] }}
            toForm={(p) => ({ name: p.name, color: p.color, sort_order: String(p.sort_order ?? 0), is_default: p.is_default, member_ids: p.member_ids ?? [] })}
            renderForm={(f, set, e) => (
                <>
                    <Field label="Name" required error={e.name}>
                        <Input value={f.name} onChange={(ev) => set({ name: ev.target.value })} placeholder="e.g. Post-sales" />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Color" error={e.color}>
                            <Input type="color" value={f.color} onChange={(ev) => set({ color: ev.target.value })} className="h-10 w-20 p-1" />
                        </Field>
                        <Field label="Order" hint="Order in the workspace list.">
                            <Input type="number" value={f.sort_order} onChange={(ev) => set({ sort_order: ev.target.value })} />
                        </Field>
                    </div>
                    <Field label="Team" error={e.member_ids} hint="Who works in this workspace: only they (and administrators) see its leads, and leads moved here can be shared out to them in turn. Empty: everyone.">
                        <StaffMultiSelect staff={staff} value={f.member_ids} onChange={(ids) => set({ member_ids: ids })} placeholder="Everyone" />
                    </Field>
                    <Checkbox label="Default workspace (opens first)" checked={f.is_default} onChange={(v) => set({ is_default: v })} />
                </>
            )}
        />
    );
}

/** Setup → Lead Statuses: each status in its workspace, and what happens when a lead reaches it. */
export function LeadStatusesList({ staff }: { staff: Staff[] }) {
    const pipelines = useApi<{ data: Pipeline[] }>('/setup/lead-pipelines');
    const all = useApi<{ data: Status[] }>('/setup/lead-statuses');
    const pipes = pipelines.data?.data ?? [];
    const statuses = all.data?.data ?? [];
    const many = pipes.length > 1;
    const statusName = (id: number | null) => {
        const s = statuses.find((x) => x.id === id);
        return s ? (many && s.pipeline_name ? `${s.pipeline_name} → ${s.name}` : s.name) : null;
    };

    return (
        <ListEditor<Status, { id?: number; name: string; color: string; status_order: string; notify_lead: boolean; pipeline_id: string; move_to_status_id: string; move_assign: string; move_assign_user_id: string }>
            list="lead-statuses"
            title="Lead Status"
            onChanged={() => (all.reload(), pipelines.reload())}
            columns={[
                { label: 'Name', render: (st) => <span style={{ color: st.color }} className="font-medium">{st.name}{st.is_default ? ' (converted leads)' : ''}</span> },
                ...(many ? [{ label: 'Workspace', render: (st: Status) => st.pipeline_name ?? '—' }] : []),
                { label: 'Order', render: (st) => st.status_order },
                { label: 'Message to lead', render: (st) => (st.notify_lead ? <span className="font-semibold text-emerald-600">E-mail + WhatsApp</span> : <span className="text-slate-400">No</span>) },
                {
                    label: 'Moves the lead on to',
                    render: (st) =>
                        st.move_to_status_id ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-brand">
                                <ArrowRight className="h-3.5 w-3.5" />
                                {statusName(st.move_to_status_id)}
                            </span>
                        ) : (
                            <span className="text-slate-400">—</span>
                        ),
                },
            ]}
            blank={{ name: '', color: '#28B8DA', status_order: '0', notify_lead: true, pipeline_id: String(pipes.find((p) => p.is_default)?.id ?? ''), move_to_status_id: '', move_assign: 'keep', move_assign_user_id: '' }}
            toForm={(st) => ({
                id: st.id,
                name: st.name,
                color: st.color,
                status_order: String(st.status_order ?? 0),
                notify_lead: !!st.notify_lead,
                pipeline_id: String(st.pipeline_id ?? ''),
                move_to_status_id: String(st.move_to_status_id ?? ''),
                move_assign: st.move_assign ?? 'keep',
                move_assign_user_id: String(st.move_assign_user_id ?? ''),
            })}
            renderForm={(f, set, e) => (
                <>
                    <Field label="Name" required error={e.name}>
                        <Input value={f.name} onChange={(ev) => set({ name: ev.target.value })} />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Color" error={e.color}>
                            <Input type="color" value={f.color} onChange={(ev) => set({ color: ev.target.value })} className="h-10 w-20 p-1" />
                        </Field>
                        <Field label="Order">
                            <Input type="number" value={f.status_order} onChange={(ev) => set({ status_order: ev.target.value })} />
                        </Field>
                    </div>
                    {pipes.length > 0 && (
                        <Field label="Workspace" error={e.pipeline_id}>
                            <Select value={f.pipeline_id} onChange={(ev) => set({ pipeline_id: ev.target.value })}>
                                {pipes.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                    )}
                    <Field label="Message to lead" hint="Both drafts are in Setup → Leads → Messages to the lead on status change.">
                        <Checkbox label="Send the lead an e-mail and WhatsApp message when it moves to this status" checked={f.notify_lead} onChange={(v) => set({ notify_lead: v })} />
                    </Field>
                    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                        <p className="text-[13px] font-semibold text-slate-700">When a lead reaches this status</p>
                        <Field label="Move the lead on to" error={e.move_to_status_id} hint="e.g. on “Won”, to the first status of the Post-sales workspace.">
                            <Select value={f.move_to_status_id} onChange={(ev) => set({ move_to_status_id: ev.target.value })}>
                                <option value="">— Don’t move —</option>
                                {pipes.map((p) => (
                                    <optgroup key={p.id} label={p.name}>
                                        {statuses
                                            .filter((s) => s.pipeline_id === p.id && s.id !== f.id)
                                            .map((s) => (
                                                <option key={s.id} value={s.id}>
                                                    {s.name}
                                                </option>
                                            ))}
                                    </optgroup>
                                ))}
                            </Select>
                        </Field>
                        {f.move_to_status_id && (
                            <>
                                <Field label="Assign it">
                                    <Select value={f.move_assign} onChange={(ev) => set({ move_assign: ev.target.value })}>
                                        {Object.entries(ASSIGN_LABELS).map(([k, label]) => (
                                            <option key={k} value={k}>
                                                {label}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>
                                {f.move_assign === 'user' && (
                                    <Field label="Person" required error={e.move_assign_user_id}>
                                        <Select value={f.move_assign_user_id} onChange={(ev) => set({ move_assign_user_id: ev.target.value })}>
                                            <option value="">Choose…</option>
                                            {staff.map((s) => (
                                                <option key={s.id} value={s.id}>
                                                    {s.full_name}
                                                </option>
                                            ))}
                                        </Select>
                                    </Field>
                                )}
                            </>
                        )}
                    </div>
                </>
            )}
        />
    );
}
