import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import {
    Boxes,
    Building2,
    Calculator,
    CalendarDays,
    CircleDot,
    Coins,
    CreditCard,
    DatabaseBackup,
    FileDown,
    FileSignature,
    FileText,
    Flag,
    History,
    Inbox,
    LifeBuoy,
    ListChecks,
    Mail,
    MessageCircle,
    MessageSquareText,
    MessagesSquare,
    Network,
    Percent,
    Phone,
    Receipt,
    ReceiptText,
    Settings,
    Share2,
    ShieldCheck,
    ShoppingCart,
    SlidersHorizontal,
    Tag,
    Target,
    UserRound,
    Users,
    Wallet,
    Wrench,
    type LucideIcon,
} from 'lucide-react';
import { Checkbox, Field, Input, Select, StaffMultiSelect, Textarea } from '../../components/ui';
import { useStaff } from '../../hooks/useStaff';
import type { Currency, PaymentMode, Tax } from '../../types';
import PermissionsPage from '../SettingsPage';
import BackupSetup from './BackupSetup';
import CallsSetup from './CallsSetup';
import CustomFieldsSetup from './CustomFieldsSetup';
import { EmailLogList, EmailSettingsForm, EmailTemplatesList } from './EmailSetup';
import ListEditor from './ListEditor';
import OptionsForm, { type OptionSection } from './OptionsForm';
import WhatsAppSetup from './WhatsAppSetup';
import { CalendarSettings, CustomersSettings, LeadsSettings, PdfSettings, SupportSettings, TagsSettings } from './MoreSettings';

/** Setup sections grouped as Perfex's Settings menu, each with its icon. */
const GROUPS = [
    {
        title: 'General',
        items: [
            { id: 'company', label: 'Company Information', icon: Building2 },
            { id: 'email', label: 'Email', icon: Mail },
            { id: 'email-templates', label: 'Email Templates', icon: FileText },
            { id: 'email-log', label: 'Email Log', icon: History },
        ],
    },
    {
        title: 'Finance',
        items: [
            { id: 'finance', label: 'General', icon: Settings },
            { id: 'invoices', label: 'Invoices', icon: Receipt },
            { id: 'proposals', label: 'Proposals', icon: FileText },
            { id: 'estimates', label: 'Estimates', icon: Calculator },
            { id: 'credit-notes', label: 'Credit Notes', icon: ReceiptText },
            { id: 'contracts', label: 'Contracts', icon: FileSignature },
            { id: 'taxes', label: 'Taxes', icon: Percent },
            { id: 'currencies', label: 'Currencies', icon: Coins },
            { id: 'payment-modes', label: 'Payment Modes', icon: CreditCard },
        ],
    },
    {
        title: 'Configure Features',
        items: [
            { id: 'customers', label: 'Customers', icon: UserRound },
            { id: 'tasks', label: 'Tasks', icon: ListChecks },
            { id: 'support', label: 'Support', icon: LifeBuoy },
            { id: 'leads', label: 'Leads', icon: Target },
        ],
    },
    {
        title: 'Lists',
        items: [
            { id: 'customer-groups', label: 'Customer Groups', icon: Users },
            { id: 'item-groups', label: 'Item Groups', icon: Boxes },
            { id: 'expense-categories', label: 'Expense Categories', icon: Wallet },
            { id: 'contract-types', label: 'Contract Types', icon: FileSignature },
            { id: 'vendor-categories', label: 'Vendor Categories', icon: ShoppingCart },
            { id: 'lead-statuses', label: 'Lead Statuses', icon: CircleDot },
            { id: 'lead-sources', label: 'Lead Sources', icon: Share2 },
            { id: 'support-departments', label: 'Support Departments', icon: Network },
            { id: 'ticket-statuses', label: 'Ticket Statuses', icon: CircleDot },
            { id: 'ticket-priorities', label: 'Ticket Priorities', icon: Flag },
            { id: 'ticket-services', label: 'Ticket Services', icon: Wrench },
            { id: 'predefined-replies', label: 'Predefined Replies', icon: MessageSquareText },
            { id: 'estimate-request-statuses', label: 'Estimate Request Statuses', icon: Inbox },
        ],
    },
    {
        title: 'Integrations',
        items: [
            { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
            { id: 'calls', label: 'Calls', icon: Phone },
        ],
    },
    {
        title: 'Other',
        items: [
            { id: 'calendar', label: 'Calendar', icon: CalendarDays },
            { id: 'pdf', label: 'PDF', icon: FileDown },
            { id: 'chat', label: 'Chat', icon: MessagesSquare },
            { id: 'tags', label: 'Tags', icon: Tag },
            { id: 'custom-fields', label: 'Custom Fields', icon: SlidersHorizontal },
        ],
    },
    {
        title: 'Misc',
        items: [
            { id: 'permissions', label: 'Staff Permissions', icon: ShieldCheck },
            { id: 'backup', label: 'Backup', icon: DatabaseBackup },
        ],
    },
] as const;


/** Setup → Finance: one settings page per document type (as Perfex's Settings → Finance). */
const FINANCE: Record<string, OptionSection> = {
    'finance': {
        title: 'General',
        fields: [{ name: 'number_padding_prefixes', label: 'Number padding zeros', type: 'number', hint: 'e.g. 4 → 0001' }],
    },
    'invoices': {
        title: 'Invoices',
        fields: [
            { name: 'invoice_prefix', label: 'Invoice Number Prefix' },
            { name: 'next_invoice_number', label: 'Next Invoice Number', type: 'number' },
            { name: 'invoice_number_format', label: 'Invoice Number Format', type: 'format' },
            { name: 'invoice_due_after', label: 'Invoice due after (days)', type: 'number' },
            { name: 'predefined_clientnote_invoice', label: 'Predefined Client Note', type: 'textarea' },
            { name: 'predefined_terms_invoice', label: 'Predefined Terms & Conditions', type: 'textarea' },
        ],
    },
    'estimates': {
        title: 'Estimates',
        fields: [
            { name: 'estimate_prefix', label: 'Estimate Number Prefix' },
            { name: 'next_estimate_number', label: 'Next Estimate Number', type: 'number' },
            { name: 'estimate_number_format', label: 'Estimate Number Format', type: 'format' },
            { name: 'estimate_due_after', label: 'Estimate expires after (days)', type: 'number' },
            { name: 'predefined_clientnote_estimate', label: 'Predefined Client Note', type: 'textarea' },
            { name: 'predefined_terms_estimate', label: 'Predefined Terms & Conditions', type: 'textarea' },
        ],
    },
    'proposals': {
        title: 'Proposals',
        fields: [
            { name: 'proposal_number_prefix', label: 'Proposal Number Prefix' },
            { name: 'proposal_due_after', label: 'Proposal open till (days)', type: 'number' },
        ],
    },
    'contracts': {
        title: 'Contracts',
        fields: [{ name: 'contract_expiration_before', label: 'Notify before contract ends (days)', type: 'number' }],
    },
    'credit-notes': {
        title: 'Credit Notes',
        fields: [
            { name: 'credit_note_prefix', label: 'Credit Note Number Prefix' },
            { name: 'next_credit_note_number', label: 'Next Credit Note Number', type: 'number' },
            { name: 'credit_note_number_format', label: 'Credit Note Number Format', type: 'format' },
            { name: 'predefined_clientnote_credit_note', label: 'Predefined Client Note', type: 'textarea' },
            { name: 'predefined_terms_credit_note', label: 'Predefined Terms & Conditions', type: 'textarea' },
        ],
    },
};

const TABS: readonly { id: string; label: string; icon: LucideIcon }[] = GROUPS.flatMap((g) => [...g.items]);
type TabId = (typeof GROUPS)[number]['items'][number]['id'];

const NAMES: Record<string, string> = {
    'customer-groups': 'Customer Group',
    'item-groups': 'Item Group',
    'contract-types': 'Contract Type',
    'lead-sources': 'Lead Source',
    'ticket-priorities': 'Ticket Priority',
    'ticket-services': 'Ticket Service',
};

/** Perfex Setup (admins only). */
export default function SetupPage() {
    const { user } = useAuth();
    const staff = useStaff();
    const [params, setParams] = useSearchParams();
    const tab = (TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'company') as TabId;

    if (!user?.is_admin) {
        return <Navigate to="/" replace />;
    }

    const visible = (id: string) => id !== 'backup' || user.is_super_admin;
    const current = TABS.find((t) => t.id === tab)!;

    return (
        <div className="w-full space-y-4">
            <h4 className="page-title">Setup</h4>
            <div className="grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
                {/* Perfex Settings menu: grouped sections on the left (a dropdown on phones). */}
                <div className="lg:hidden">
                    <Select value={tab} onChange={(e) => setParams({ tab: e.target.value })}>
                        {GROUPS.map((g) =>
                            g.items.filter((i) => visible(i.id)).map((i) => (
                                <option key={i.id} value={i.id}>
                                    {g.title} · {i.label}
                                </option>
                            )),
                        )}
                    </Select>
                </div>
                <nav aria-label="Setup sections" className="hidden lg:sticky lg:top-[84px] lg:block">
                    <h3 className="mb-2 px-1 text-[16px] font-bold text-slate-800">Settings</h3>
                    <div className="panel_s !mb-0 p-3 lg:max-h-[calc(100vh-150px)] lg:overflow-y-auto">
                    {GROUPS.map((g) => (
                        <div key={g.title} className="mb-3 last:mb-0">
                            <p className="px-2.5 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">{g.title}</p>
                            <ul className="space-y-0.5">
                                {g.items
                                    .filter((i) => visible(i.id))
                                    .map((i) => {
                                        const Icon = i.icon;
                                        const on = i.id === tab;
                                        return (
                                            <li key={i.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => setParams({ tab: i.id })}
                                                    aria-current={on ? 'page' : undefined}
                                                    className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-[13px] transition ${on ? 'bg-brand-50 font-semibold text-brand' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
                                                >
                                                    <Icon className={`h-4 w-4 shrink-0 ${on ? 'text-accent' : 'text-slate-400'}`} />
                                                    {i.label}
                                                </button>
                                            </li>
                                        );
                                    })}
                            </ul>
                        </div>
                    ))}
                    </div>
                </nav>

                <div className="min-w-0 space-y-4">
                    <h3 className="flex items-center gap-2 px-1 text-[16px] font-bold text-slate-800">
                        <current.icon className="h-[18px] w-[18px] text-accent" />
                        {current.label}
                    </h3>

            {tab === 'company' && (
                <OptionsForm
                    sections={[
                        {
                            title: 'Company Information (printed on PDFs)',
                            fields: [
                                { name: 'company_name', label: 'Company Name' },
                                { name: 'company_vat', label: 'GST / VAT Number' },
                                { name: 'company_address', label: 'Address', type: 'textarea' },
                                { name: 'company_city', label: 'City' },
                                { name: 'company_state', label: 'State' },
                                { name: 'company_zip', label: 'Zip Code' },
                                { name: 'company_country', label: 'Country' },
                                { name: 'company_phone', label: 'Phone' },
                                { name: 'company_email', label: 'Email' },
                            ],
                        },
                    ]}
                />
            )}

            {tab === 'tasks' && (
                <OptionsForm
                    sections={[
                        {
                            title: 'Task timers',
                            fields: [
                                { name: 'auto_stop_tasks_timers_on_new_timer', label: 'Stop all other started timers when starting a new timer', type: 'yesno' },
                                { name: 'timer_started_change_status_in_progress', label: 'Change task status to In Progress when a timer is started (only for Not Started tasks)', type: 'yesno' },
                                {
                                    name: 'automatically_stop_task_timer_after_hours',
                                    label: 'Automatically stop task timers after (hours)',
                                    type: 'number',
                                    hint: 'A timer still running after this many hours is stopped at its start time + these hours (checked every 5 minutes). 0 = never. Timers started without a task are not stopped.',
                                },
                            ],
                        },
                        {
                            title: 'Round off logged time',
                            fields: [
                                {
                                    name: 'round_off_task_timer_option',
                                    label: 'Round off task timer',
                                    type: 'select',
                                    options: [
                                        { value: '0', label: "Don't round off" },
                                        { value: '1', label: 'Round up' },
                                        { value: '2', label: 'Round down' },
                                        { value: '3', label: 'Round to nearest' },
                                    ],
                                    hint: 'Applies to task totals, timesheet reports and invoicing project time. The timers keep their exact start and end.',
                                },
                                {
                                    name: 'round_off_task_timer_time',
                                    label: 'In multiples of (minutes)',
                                    type: 'select',
                                    options: [5, 10, 15, 20, 25, 30, 35, 40, 45].map((m) => ({ value: String(m), label: `${m} minutes` })),
                                },
                            ],
                        },
                    ]}
                />
            )}
            {tab === 'backup' && user.is_super_admin && <BackupSetup />}
            {tab === 'customers' && <CustomersSettings />}
            {tab === 'support' && <SupportSettings />}
            {tab === 'leads' && <LeadsSettings />}
            {tab === 'calendar' && <CalendarSettings />}
            {tab === 'pdf' && <PdfSettings />}
            {tab === 'tags' && <TagsSettings />}
            {tab === 'chat' && (
                <OptionsForm
                    sections={[
                        {
                            title: 'Chat',
                            fields: [{ name: 'chat_clients_enabled', label: 'Customers can chat with staff from the customers area', type: 'yesno', hint: 'Staff who may see customers answer in Chat → Customers.' }],
                        },
                    ]}
                />
            )}
            {tab in FINANCE && <OptionsForm key={tab} sections={[FINANCE[tab as keyof typeof FINANCE]]} />}

            {tab === 'taxes' && (
                <ListEditor<Tax, { name: string; rate: string }>
                    list="taxes"
                    title="Tax"
                    columns={[
                        { label: 'Tax Name', render: (t) => t.name },
                        { label: 'Rate (%)', render: (t) => Number(t.rate) },
                    ]}
                    blank={{ name: '', rate: '' }}
                    toForm={(t) => ({ name: t.name, rate: t.rate })}
                    renderForm={(f, set, e) => (
                        <>
                            <Field label="Tax Name" required error={e.name}>
                                <Input value={f.name} onChange={(ev) => set({ name: ev.target.value })} placeholder="e.g. CGST" />
                            </Field>
                            <Field label="Tax Rate (percent)" required error={e.rate}>
                                <Input type="number" step="any" value={f.rate} onChange={(ev) => set({ rate: ev.target.value })} />
                            </Field>
                        </>
                    )}
                />
            )}

            {tab === 'currencies' && (
                <ListEditor<Currency, { name: string; symbol: string; decimal_separator: string; thousand_separator: string; placement: string; is_default: boolean }>
                    list="currencies"
                    title="Currency"
                    columns={[
                        { label: 'Currency Code', render: (c) => <span className={c.is_default ? 'font-semibold' : ''}>{c.name}{c.is_default && ' (Base Currency)'}</span> },
                        { label: 'Symbol', render: (c) => c.symbol },
                        { label: 'Placement', render: (c) => c.placement },
                    ]}
                    blank={{ name: '', symbol: '', decimal_separator: '.', thousand_separator: ',', placement: 'before', is_default: false }}
                    toForm={(c) => ({ name: c.name, symbol: c.symbol, decimal_separator: c.decimal_separator, thousand_separator: c.thousand_separator, placement: c.placement, is_default: c.is_default })}
                    renderForm={(f, set, e) => (
                        <>
                            <Field label="Currency Code" required error={e.name}>
                                <Input value={f.name} onChange={(ev) => set({ name: ev.target.value })} placeholder="e.g. USD" />
                            </Field>
                            <Field label="Symbol" required error={e.symbol}>
                                <Input value={f.symbol} onChange={(ev) => set({ symbol: ev.target.value })} />
                            </Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Decimal Separator">
                                    <Input value={f.decimal_separator} onChange={(ev) => set({ decimal_separator: ev.target.value })} />
                                </Field>
                                <Field label="Thousand Separator">
                                    <Input value={f.thousand_separator} onChange={(ev) => set({ thousand_separator: ev.target.value })} />
                                </Field>
                            </div>
                            <Field label="Currency Placement">
                                <Select value={f.placement} onChange={(ev) => set({ placement: ev.target.value })}>
                                    <option value="before">Before Amount</option>
                                    <option value="after">After Amount</option>
                                </Select>
                            </Field>
                            <Checkbox label="Make this the base currency" checked={f.is_default} onChange={(v) => set({ is_default: v })} />
                        </>
                    )}
                />
            )}

            {tab === 'payment-modes' && (
                <ListEditor<PaymentMode, { name: string; description: string; show_on_pdf: boolean; invoices_only: boolean; expenses_only: boolean; selected_by_default: boolean; active: boolean }>
                    list="payment-modes"
                    title="Payment Mode"
                    columns={[
                        { label: 'Payment Mode Name', render: (m) => m.name },
                        { label: 'Description', render: (m) => <span className="line-clamp-2 text-gray-500">{m.description}</span> },
                        { label: 'Active', render: (m) => (m.active ? 'Yes' : 'No') },
                    ]}
                    blank={{ name: '', description: '', show_on_pdf: false, invoices_only: false, expenses_only: false, selected_by_default: true, active: true }}
                    toForm={(m) => ({ name: m.name, description: m.description ?? '', show_on_pdf: m.show_on_pdf, invoices_only: m.invoices_only, expenses_only: m.expenses_only, selected_by_default: m.selected_by_default, active: m.active })}
                    renderForm={(f, set, e) => (
                        <>
                            <Field label="Payment Mode Name" required error={e.name}>
                                <Input value={f.name} onChange={(ev) => set({ name: ev.target.value })} placeholder="e.g. Bank Transfer" />
                            </Field>
                            <Field label="Bank Accounts / Description">
                                <Textarea rows={4} value={f.description} onChange={(ev) => set({ description: ev.target.value })} />
                            </Field>
                            <Checkbox label="Show Bank Accounts / Description on Invoice PDF" checked={f.show_on_pdf} onChange={(v) => set({ show_on_pdf: v })} />
                            <Checkbox label="Selected by default on invoice" checked={f.selected_by_default} onChange={(v) => set({ selected_by_default: v })} />
                            <Checkbox label="Invoices Only" checked={f.invoices_only} onChange={(v) => set({ invoices_only: v })} />
                            <Checkbox label="Expenses Only" checked={f.expenses_only} onChange={(v) => set({ expenses_only: v })} />
                            <Checkbox label="Active" checked={f.active} onChange={(v) => set({ active: v })} />
                        </>
                    )}
                />
            )}

            {(['customer-groups', 'item-groups', 'contract-types', 'lead-sources', 'ticket-priorities', 'ticket-services'] as string[]).includes(tab) && (
                <ListEditor<{ id: number; name: string }, { name: string }>
                    key={tab}
                    list={tab}
                    title={NAMES[tab]}
                    columns={[{ label: 'Name', render: (g) => g.name }]}
                    blank={{ name: '' }}
                    toForm={(g) => ({ name: g.name })}
                    renderForm={(f, set, e) => (
                        <Field label="Name" required error={e.name}>
                            <Input value={f.name} onChange={(ev) => set({ name: ev.target.value })} />
                        </Field>
                    )}
                />
            )}

            {(tab === 'expense-categories' || tab === 'vendor-categories') && (
                <ListEditor<{ id: number; name: string; description: string | null }, { name: string; description: string }>
                    key={tab}
                    list={tab}
                    title={tab === 'vendor-categories' ? 'Vendor Category' : 'Expense Category'}
                    columns={[
                        { label: 'Name', render: (c) => c.name },
                        { label: 'Description', render: (c) => <span className="text-gray-500">{c.description}</span> },
                    ]}
                    blank={{ name: '', description: '' }}
                    toForm={(c) => ({ name: c.name, description: c.description ?? '' })}
                    renderForm={(f, set, e) => (
                        <>
                            <Field label="Name" required error={e.name}>
                                <Input value={f.name} onChange={(ev) => set({ name: ev.target.value })} />
                            </Field>
                            <Field label="Description">
                                <Textarea rows={3} value={f.description} onChange={(ev) => set({ description: ev.target.value })} />
                            </Field>
                        </>
                    )}
                />
            )}

            {(tab === 'lead-statuses' || tab === 'ticket-statuses' || tab === 'estimate-request-statuses') && (
                <ListEditor<{ id: number; name: string; color: string; status_order: number; is_default?: boolean; system_key?: string | null; flag?: string | null }, { name: string; color: string; status_order: string }>
                    key={tab}
                    list={tab}
                    title={tab === 'lead-statuses' ? 'Lead Status' : tab === 'ticket-statuses' ? 'Ticket Status' : 'Request Status'}
                    columns={[
                        { label: 'Name', render: (st) => <span style={{ color: st.color }} className="font-medium">{st.name}{st.is_default ? ' (converted leads)' : ''}{st.system_key || st.flag ? ' (built-in)' : ''}</span> },
                        { label: 'Order', render: (st) => st.status_order },
                    ]}
                    blank={{ name: '', color: '#28B8DA', status_order: '0' }}
                    toForm={(st) => ({ name: st.name, color: st.color, status_order: String(st.status_order ?? 0) })}
                    renderForm={(f, set, e) => (
                        <>
                            <Field label="Name" required error={e.name}>
                                <Input value={f.name} onChange={(ev) => set({ name: ev.target.value })} />
                            </Field>
                            <Field label="Color" error={e.color}>
                                <Input type="color" value={f.color} onChange={(ev) => set({ color: ev.target.value })} className="h-10 w-20 p-1" />
                            </Field>
                            <Field label="Order">
                                <Input type="number" value={f.status_order} onChange={(ev) => set({ status_order: ev.target.value })} />
                            </Field>
                        </>
                    )}
                />
            )}

            {tab === 'support-departments' && (
                <ListEditor<{ id: number; name: string; email: string | null; hide_from_client: boolean; member_ids?: number[] }, { name: string; email: string; hide_from_client: boolean; member_ids: number[] }>
                    list="support-departments"
                    title="Department"
                    columns={[
                        { label: 'Name', render: (d) => d.name },
                        { label: 'Email', render: (d) => d.email },
                        { label: 'Staff', render: (d) => staff.filter((x) => d.member_ids?.includes(x.id)).map((x) => x.full_name).join(', ') },
                    ]}
                    blank={{ name: '', email: '', hide_from_client: false, member_ids: [] }}
                    toForm={(d) => ({ name: d.name, email: d.email ?? '', hide_from_client: d.hide_from_client, member_ids: d.member_ids ?? [] })}
                    renderForm={(f, set, e) => (
                        <>
                            <Field label="Department Name" required error={e.name}>
                                <Input value={f.name} onChange={(ev) => set({ name: ev.target.value })} />
                            </Field>
                            <Field label="Department Email" error={e.email}>
                                <Input type="email" value={f.email} onChange={(ev) => set({ email: ev.target.value })} />
                            </Field>
                            <Field label="Staff members (see this department's tickets)">
                                <StaffMultiSelect staff={staff} value={f.member_ids} onChange={(ids) => set({ member_ids: ids })} />
                            </Field>
                            <Checkbox label="Hide from customer" checked={f.hide_from_client} onChange={(v) => set({ hide_from_client: v })} />
                        </>
                    )}
                />
            )}

            {tab === 'predefined-replies' && (
                <ListEditor<{ id: number; name: string; message: string }, { name: string; message: string }>
                    list="predefined-replies"
                    title="Predefined Reply"
                    columns={[
                        { label: 'Name', render: (r) => r.name },
                        { label: 'Message', render: (r) => <span className="line-clamp-2 text-gray-500">{r.message}</span> },
                    ]}
                    blank={{ name: '', message: '' }}
                    toForm={(r) => ({ name: r.name, message: r.message })}
                    renderForm={(f, set, e) => (
                        <>
                            <Field label="Name" required error={e.name}>
                                <Input value={f.name} onChange={(ev) => set({ name: ev.target.value })} />
                            </Field>
                            <Field label="Message" required error={e.message}>
                                <Textarea rows={6} value={f.message} onChange={(ev) => set({ message: ev.target.value })} />
                            </Field>
                        </>
                    )}
                />
            )}

            {tab === 'email' && <EmailSettingsForm />}
            {tab === 'email-templates' && <EmailTemplatesList />}
            {tab === 'email-log' && <EmailLogList />}
            {tab === 'whatsapp' && <WhatsAppSetup />}
            {tab === 'calls' && <CallsSetup />}
            {tab === 'custom-fields' && <CustomFieldsSetup />}
            {tab === 'permissions' && <PermissionsPage />}
                </div>
            </div>
        </div>
    );
}
