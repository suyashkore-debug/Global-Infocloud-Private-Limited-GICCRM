import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { Button, EmptyState, Input, Spinner } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import OptionsForm from './OptionsForm';

const yes = 'yesno' as const;
const opts = (rows: { id: number; name: string }[] | undefined, none: string) => [{ value: '', label: none }, ...(rows ?? []).map((r) => ({ value: String(r.id), label: r.name }))];

/** Setup → Customers (Perfex Settings → Customers). */
export function CustomersSettings() {
    return (
        <OptionsForm
            sections={[
                {
                    title: 'Customers',
                    fields: [
                        { name: 'customer_default_country', label: 'Default country for new customers' },
                        {
                            name: 'default_contact_permissions',
                            label: 'Default customers-area permissions of a new contact',
                            type: 'checks',
                            options: ['invoices', 'estimates', 'contracts', 'proposals', 'support', 'projects'].map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) })),
                        },
                        { name: 'allow_primary_contact_to_view_edit_billing_and_shipping', label: 'Allow the primary contact to edit the company details and addresses', type: yes },
                        { name: 'use_knowledge_base', label: 'Show the Knowledge Base in the customers area', type: yes },
                    ],
                },
            ]}
        />
    );
}

/** Setup → Support (Perfex Settings → Support). */
export function SupportSettings() {
    const statuses = useApi<{ data: { id: number; name: string }[] }>('/setup/ticket-statuses');
    if (!statuses.data) {
        return <Spinner />;
    }

    return (
        <OptionsForm
            sections={[
                {
                    title: 'Tickets',
                    fields: [
                        { name: 'ticket_services_enabled', label: 'Use services on tickets', type: yes },
                        { name: 'default_ticket_reply_status', label: 'Status of a ticket after a staff reply', type: 'select', options: opts(statuses.data.data, 'Answered (default)') },
                        { name: 'ticket_replies_order', label: 'Order of ticket replies', type: 'select', options: [{ value: 'asc', label: 'Oldest first' }, { value: 'desc', label: 'Newest first' }] },
                        { name: 'automatically_assign_ticket_to_first_staff_responding', label: 'Assign an unassigned ticket to the first staff member who replies', type: yes },
                        { name: 'maximum_allowed_ticket_attachments', label: 'Maximum files per reply', type: 'number' },
                        { name: 'ticket_attachments_file_extensions', label: 'Allowed file extensions', hint: 'Comma separated, e.g. .jpg,.png,.pdf' },
                        { name: 'receive_notification_on_new_ticket', label: 'Notify the department when a ticket is opened', type: yes },
                        { name: 'receive_notification_on_new_ticket_replies', label: 'Notify the department when a customer replies (unassigned tickets)', type: yes },
                    ],
                },
                {
                    title: 'Customers area',
                    fields: [
                        { name: 'only_show_contact_tickets', label: 'Contacts see only their own tickets', type: yes, hint: 'No: every contact sees all of the customer’s tickets.' },
                        { name: 'allow_customer_to_change_ticket_status', label: 'Allow customers to close their tickets', type: yes },
                    ],
                },
            ]}
        />
    );
}

/** Setup → Leads (Perfex Settings → Leads). */
export function LeadsSettings() {
    const statuses = useApi<{ data: { id: number; name: string; is_default: boolean }[] }>('/setup/lead-statuses');
    const sources = useApi<{ data: { id: number; name: string }[] }>('/setup/lead-sources');
    if (!statuses.data || !sources.data) {
        return <Spinner />;
    }

    return (
        <OptionsForm
            sections={[
                {
                    title: 'Leads',
                    stacked: true,
                    fields: [
                        { name: 'leads_kanban_limit', label: 'Limit leads kanban rows per status', type: 'number', hint: 'How many leads each kanban column shows; the rest are in the list view.' },
                        // As Perfex: the won status (Customer) is not offered as the default for new leads.
                        { name: 'leads_default_status', label: 'Default status', type: 'select', options: opts(statuses.data.data.filter((s) => !s.is_default), 'Nothing selected') },
                        { name: 'leads_default_source', label: 'Default source', type: 'select', options: opts(sources.data.data, 'Nothing selected') },
                        {
                            name: 'lead_unique_validation',
                            label: 'Perform validation for duplicate lead on the following fields:',
                            type: 'multiselect',
                            placeholder: 'No validation',
                            options: [
                                { value: 'email', label: 'Email Address' },
                                { value: 'phone', label: 'Phone' },
                                { value: 'website', label: 'Website' },
                                { value: 'company', label: 'Company' },
                            ],
                        },
                        {
                            name: 'auto_assign_customer_admin_after_lead_convert',
                            label: 'Auto assign as admin to customer after convert',
                            type: yes,
                            hint: 'The staff member the lead is assigned to becomes the customer admin when the lead is converted.',
                        },
                        { name: 'allow_non_admin_members_to_import_leads', label: 'Allow non-admin staff members to import leads', type: yes },
                        {
                            name: 'default_leads_kanban_sort',
                            label: 'Default leads kanban sort',
                            type: 'select',
                            options: [
                                { value: 'dateadded', label: 'Date Created' },
                                { value: 'leadorder', label: 'Kanban Order' },
                                { value: 'lastcontact', label: 'Last Contact' },
                            ],
                            beside: {
                                name: 'default_leads_kanban_sort_type',
                                options: [
                                    { value: 'asc', label: 'Ascending' },
                                    { value: 'desc', label: 'Descending' },
                                ],
                            },
                        },
                        { name: 'lead_lock_after_convert_to_customer', label: 'Do not allow leads to be edited after they are converted to customers (administrators not applied)', type: yes },
                        { name: 'lead_modal_class', label: 'Modal Width Class (modal-lg, modal-xl, modal-xxl)', type: 'text', hint: 'How wide a lead opens: modal-lg, modal-xl or modal-xxl.' },
                    ],
                },
            ]}
        />
    );
}

/** Setup → Calendar (Perfex Settings → Calendar). */
export function CalendarSettings() {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    return (
        <OptionsForm
            sections={[
                {
                    title: 'Calendar',
                    fields: [
                        { name: 'calendar_first_day', label: 'First day of the week', type: 'select', options: days.map((d, i) => ({ value: String(i), label: d })) },
                        { name: 'show_tasks_on_calendar', label: 'Show tasks', type: yes },
                        { name: 'calendar_only_assigned_tasks', label: 'Show only tasks assigned to the viewer', type: yes },
                        { name: 'show_projects_on_calendar', label: 'Show project deadlines', type: yes },
                        { name: 'show_invoices_on_calendar', label: 'Show invoice due dates', type: yes },
                        { name: 'show_estimates_on_calendar', label: 'Show estimate expiry dates', type: yes },
                        { name: 'show_contracts_on_calendar', label: 'Show contract end dates', type: yes },
                        { name: 'show_reminders_on_calendar', label: 'Show my reminders', type: yes },
                    ],
                },
            ]}
        />
    );
}

/** Setup → PDF (Perfex Settings → PDF). */
export function PdfSettings() {
    return (
        <OptionsForm
            sections={[
                {
                    title: 'PDF',
                    fields: [
                        {
                            name: 'pdf_format',
                            label: 'Paper',
                            type: 'select',
                            options: [
                                { value: 'A4-PORTRAIT', label: 'A4 portrait' },
                                { value: 'A4-LANDSCAPE', label: 'A4 landscape' },
                                { value: 'LETTER-PORTRAIT', label: 'Letter portrait' },
                                { value: 'LETTER-LANDSCAPE', label: 'Letter landscape' },
                            ],
                        },
                        { name: 'pdf_font_size', label: 'Font size', type: 'number' },
                        { name: 'pdf_table_heading_color', label: 'Items table heading colour', type: 'color' },
                        { name: 'pdf_table_heading_text_color', label: 'Items table heading text colour', type: 'color' },
                        { name: 'show_status_on_pdf_ei', label: 'Show the status on invoices / estimates', type: yes },
                        { name: 'show_page_number_on_pdf', label: 'Show page numbers', type: yes },
                        { name: 'swap_pdf_info', label: 'Swap company and customer details', type: yes },
                        { name: 'show_transactions_on_invoice_pdf', label: 'Show payments (transactions) on invoices', type: yes },
                    ],
                },
            ]}
        />
    );
}

/** Setup → Tags: rename or delete a tag everywhere it is used. */
export function TagsSettings() {
    const toast = useToast();
    const { data, reload } = useApi<{ data: { id: number; name: string; used: number }[] }>('/tags');
    const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);

    async function save() {
        if (!editing) {
            return;
        }
        try {
            await api.put(`/tags/${editing.id}`, { name: editing.name });
            toast('Tag renamed.');
            setEditing(null);
            reload();
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    async function remove(tag: { id: number; name: string; used: number }) {
        if (!confirm(`Delete the tag "${tag.name}"? It is removed from ${tag.used} record(s).`)) {
            return;
        }
        await api.delete(`/tags/${tag.id}`);
        toast('Tag deleted.');
        reload();
    }

    if (!data) {
        return <Spinner />;
    }

    return data.data.length === 0 ? (
        <EmptyState title="No tags yet" text="Tags are added on tasks, projects, invoices, tickets and other records." />
    ) : (
        <div className="panel_s overflow-hidden">
            <table className="table-perfex">
                <thead>
                    <tr>
                        <th>Tag</th>
                        <th className="text-right">Used</th>
                        <th className="w-24" />
                    </tr>
                </thead>
                <tbody>
                    {data.data.map((tag) => (
                        <tr key={tag.id}>
                            <td>
                                {editing?.id === tag.id ? (
                                    <span className="flex items-center gap-2">
                                        <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="w-60" autoFocus onKeyDown={(e) => e.key === 'Enter' && save()} />
                                        <Button size="sm" onClick={save}>
                                            Save
                                        </Button>
                                        <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>
                                            Cancel
                                        </Button>
                                    </span>
                                ) : (
                                    <span className="rounded bg-gray-100 px-2 py-0.5 text-[13px]">{tag.name}</span>
                                )}
                            </td>
                            <td className="text-right">{tag.used}</td>
                            <td className="text-right">
                                <span className="inline-flex gap-2">
                                    <button type="button" onClick={() => setEditing({ id: tag.id, name: tag.name })} className="text-gray-400 hover:text-gray-800" title="Rename">
                                        <Pencil className="h-4 w-4" />
                                    </button>
                                    <button type="button" onClick={() => remove(tag)} className="text-gray-400 hover:text-red-600" title="Delete">
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
