export interface Role {
    id: number;
    name: string;
    slug: string | null;
}

export interface User {
    id: number;
    company_id: number | null;
    employee_code: string | null;
    first_name: string | null;
    last_name: string | null;
    full_name: string | null;
    email: string | null;
    mobile: string | null;
    photo_url?: string | null;
    is_company_admin: boolean;
    is_super_admin: boolean;
    is_admin: boolean;
    is_super_admin_acting?: boolean;
    permissions: string[];
    company: { id: number; company_name: string; logo_url?: string | null; portal_slug?: string } | null;
    roles: Role[];
}

export interface Staff {
    id: number;
    full_name: string;
    email: string | null;
    employee_code: string | null;
    photo_url?: string | null;
}

export interface Customer {
    id: number;
    name: string;
    contact_name: string | null;
    email: string | null;
    phone: string | null;
    website: string | null;
    vat: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    country: string | null;
    is_active: boolean;
    projects_count?: number;
}

export interface Project {
    id: number;
    name: string;
    description: string | null;
    workspace_link?: string | null;
    status: number;
    billing_type: number;
    project_cost: string | null;
    project_rate_per_hour: string | null;
    estimated_hours: string | null;
    customer_settings?: Record<string, boolean>;
    start_date: string;
    deadline: string | null;
    date_finished: string | null;
    progress: number;
    progress_from_tasks: boolean;
    calculated_progress: number;
    customer?: { id: number; name: string };
    members?: Staff[];
    tags?: string[];
    is_pinned?: boolean;
    created_by?: Staff | null;
    created_at: string;
    can: { update: boolean; delete: boolean; contribute: boolean; create_tasks: boolean };
}

export interface Task {
    id: number;
    name: string;
    description: string | null;
    status: number;
    priority: number;
    start_date: string;
    due_date: string | null;
    date_finished: string | null;
    is_public: boolean;
    visible_to_client?: boolean;
    billable: boolean;
    invoice_id?: number | null;
    hourly_rate: string;
    kanban_order: number;
    milestone_order: number;
    repeat_every: number | null;
    recurring_type: string | null;
    cycles: number;
    total_cycles: number;
    project?: { id: number; name: string; customer_name?: string | null } | null;
    milestone?: { id: number; name: string; color: string | null } | null;
    assignees?: Staff[];
    followers?: Staff[];
    tags?: string[];
    checklist_total?: number;
    checklist_finished?: number;
    comments_count?: number;
    attachments_count?: number;
    total_logged_seconds?: number;
    my_running_timer_id?: number | null;
    created_by?: Staff | null;
    created_at: string;
    can?: { update: boolean; delete: boolean; work: boolean; track_time: boolean };
}

export interface ChecklistItem {
    id: number;
    description: string;
    finished: boolean;
    finished_by: Staff | null;
    assigned_to: Staff | null;
    list_order: number;
}

export interface Attachment {
    id: number;
    original_name: string;
    subject: string | null;
    description: string | null;
    mime_type: string | null;
    size: number;
    is_image: boolean;
    external_link: string | null;
    download_url: string | null;
    user: Staff | null;
    is_own: boolean;
    created_at: string;
}

export interface Comment {
    id: number;
    parent_id: number | null;
    content: string | null;
    user: Staff | null;
    /** Set when a customer contact wrote it (customers area). */
    contact?: { id: number; name: string } | null;
    attachments?: Attachment[];
    is_own: boolean;
    created_at: string;
    updated_at: string;
}

export interface Timer {
    id: number;
    start_time: string;
    end_time: string | null;
    duration_seconds: number;
    is_running: boolean;
    hourly_rate: string;
    note: string | null;
    user?: Staff | null;
    task?: { id: number; name: string; project_id: number | null; project_name: string | null };
    is_own: boolean;
}

export interface TaskDetail extends Task {
    checklist: ChecklistItem[];
    comments: Comment[];
    attachments: Attachment[];
    timers: Timer[];
    reminders: { id: number; remind_at: string; description: string | null; is_notified: boolean }[];
    is_assignee: boolean;
    is_follower: boolean;
}

export interface Milestone {
    id: number;
    name: string;
    description: string | null;
    start_date: string | null;
    due_date: string;
    color: string | null;
    milestone_order: number;
    tasks_total?: number;
    tasks_finished?: number;
    logged_seconds?: number;
}

export interface Discussion {
    id: number;
    subject: string;
    description: string | null;
    user: Staff | null;
    comments_count?: number;
    comments?: Comment[];
    last_activity_at: string | null;
    is_own: boolean;
    created_at: string;
}

export interface Activity {
    id: number;
    description_key: string;
    additional_data: string | null;
    user: Staff | null;
    created_at: string;
}

export interface AppNotification {
    id: number;
    description: string;
    link: string | null;
    from_user: Staff | null;
    read_at: string | null;
    created_at: string;
}

export interface Paginated<T> {
    data: T[];
    meta: { current_page: number; last_page: number; total: number; per_page: number; [key: string]: unknown };
}

export interface Address {
    street: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    country: string | null;
}

export interface Contact {
    id: number;
    customer_id: number;
    is_primary: boolean;
    first_name: string;
    last_name: string | null;
    email: string;
    phone: string | null;
    title: string | null;
    active: boolean;
    invoice_emails: boolean;
    estimate_emails: boolean;
    credit_note_emails: boolean;
    contract_emails: boolean;
    task_emails: boolean;
    project_emails: boolean;
    ticket_emails: boolean;
    has_password?: boolean;
    permissions?: string[] | null;
    last_login_at?: string | null;
}

export interface CustomerFull extends Customer {
    company_pan: string | null;
    gst_type: string | null;
    default_currency_id: number | null;
    billing: Address;
    shipping: Address;
    primary_contact?: { id: number; name: string; email: string; phone: string | null } | null;
    contacts?: Contact[];
    groups?: { id: number; name: string }[];
    admins?: Staff[];
    created_at?: string;
}

export interface Currency {
    id: number;
    name: string;
    symbol: string;
    decimal_separator: string;
    thousand_separator: string;
    placement: 'before' | 'after';
    is_default: boolean;
}

export interface Tax {
    id: number;
    name: string;
    rate: string;
}

export interface PaymentMode {
    id: number;
    name: string;
    description: string | null;
    show_on_pdf: boolean;
    invoices_only: boolean;
    expenses_only: boolean;
    selected_by_default: boolean;
    active: boolean;
}

export interface Item {
    id: number;
    description: string;
    long_description: string | null;
    hsn_code: string | null;
    rate: string;
    unit: string | null;
    item_group_id: number | null;
    tax_id: number | null;
    tax2_id: number | null;
    group?: { id: number; name: string } | null;
    tax?: Tax | null;
    tax2?: Tax | null;
}

export interface LineTax {
    tax_name: string;
    tax_rate: number | string;
}

export interface SalesLine {
    id?: number;
    description: string;
    long_description: string | null;
    hsn_code: string | null;
    qty: number | string;
    rate: number | string;
    unit: string | null;
    taxes: LineTax[];
}

export interface Invoice {
    id: number;
    number: number;
    formatted_number: string;
    status: number;
    date: string;
    due_date: string | null;
    subtotal: string;
    total_tax: string;
    total: string;
    adjustment: string;
    discount_percent: string;
    discount_total: string;
    discount_type: 'before_tax' | 'after_tax' | null;
    amount_paid: number | null;
    amount_due: number | null;
    credits_applied: number;
    applied_credits?: { id: number; amount: string; date: string; credit_note: { id: number; formatted_number: string } | null }[];
    show_quantity_as: number;
    client_note: string | null;
    admin_note: string | null;
    terms: string | null;
    billing: Address;
    shipping: Address;
    include_shipping: boolean;
    show_shipping_on_invoice: boolean;
    allowed_payment_modes: number[];
    sent: boolean;
    sent_at: string | null;
    cancel_overdue_reminders: boolean;
    repeat_every: number | null;
    recurring_type: string | null;
    cycles: number;
    total_cycles: number;
    customer?: { id: number; name: string; vat: string | null; company_pan: string | null };
    project?: { id: number; name: string } | null;
    currency?: { id: number; name: string; symbol: string; placement: string } | null;
    sale_agent?: Staff | null;
    tags?: string[];
    items?: SalesLine[];
    payments?: { id: number; amount: string; date: string; payment_mode: string | null; payment_method: string | null; transaction_id: string | null; note: string | null }[];
    created_at: string;
    can: { update: boolean; delete: boolean; record_payment: boolean };
}

export interface Payment {
    id: number;
    amount: string;
    date: string;
    payment_mode: { id: number; name: string } | null;
    payment_method: string | null;
    transaction_id: string | null;
    note: string | null;
    invoice?: { id: number; formatted_number: string; customer: { id: number; name: string } | null; currency: { symbol: string; placement: string } | null };
    created_at: string;
}

export interface SalesDocumentBase {
    id: number;
    formatted_number: string;
    status: number;
    date: string;
    subtotal: string;
    total_tax: string;
    total: string;
    adjustment: string;
    discount_percent: string;
    discount_total: string;
    discount_type: 'before_tax' | 'after_tax' | null;
    show_quantity_as: number;
    customer?: { id: number; name: string; vat: string | null; company_pan: string | null } | null;
    project?: { id: number; name: string } | null;
    currency?: { id: number; name: string; symbol: string; placement: string } | null;
    items?: SalesLine[];
    tags?: string[];
    created_at: string;
    can: { update: boolean; delete: boolean };
}

export interface Estimate extends SalesDocumentBase {
    expiry_date: string | null;
    reference_no: string | null;
    client_note: string | null;
    admin_note: string | null;
    terms: string | null;
    billing: Address;
    shipping: Address;
    include_shipping: boolean;
    show_shipping: boolean;
    sent: boolean;
    sent_at: string | null;
    invoiced_at: string | null;
    invoice?: { id: number; formatted_number: string } | null;
    sale_agent?: Staff | null;
}

export interface CreditNote extends SalesDocumentBase {
    reference_no: string | null;
    client_note: string | null;
    admin_note: string | null;
    terms: string | null;
    billing: Address;
    shipping: Address;
    include_shipping: boolean;
    show_shipping: boolean;
    remaining_credits: number;
    applied_credits?: { id: number; amount: string; date: string; invoice: { id: number; formatted_number: string } | null }[];
    refunds?: { id: number; amount: string; refunded_on: string; payment_mode: string | null; note: string | null }[];
}

export interface Proposal extends SalesDocumentBase {
    content_html?: string;
    subject: string;
    content: string | null;
    proposal_to: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    country: string | null;
    email: string | null;
    phone: string | null;
    open_till: string | null;
    allow_comments: boolean;
    converted_at: string | null;
    assigned?: Staff | null;
    lead?: { id: number; name: string } | null;
    estimate?: { id: number; formatted_number: string } | null;
    invoice?: { id: number; formatted_number: string } | null;
}

export interface NoteItem {
    id: number;
    description: string;
    contacted_at: string | null;
    author: string | null;
    is_own: boolean;
    created_at: string;
}

export interface ReminderItem {
    id: number;
    remind_at: string;
    description: string | null;
    is_notified: boolean;
    user: string | null;
    user_id: number;
}

export interface Expense {
    id: number;
    name: string | null;
    amount: string;
    total_with_tax: number | null;
    date: string;
    billable: boolean;
    reference_no: string | null;
    note: string | null;
    repeat_every: number | null;
    recurring_type: string | null;
    cycles: number;
    total_cycles: number;
    create_invoice_billable: boolean;
    category?: { id: number; name: string } | null;
    customer?: { id: number; name: string } | null;
    project?: { id: number; name: string } | null;
    currency?: { id: number; name: string; symbol: string; placement: string } | null;
    tax?: { id: number; name: string; rate: string } | null;
    tax2?: { id: number; name: string; rate: string } | null;
    payment_mode?: { id: number; name: string } | null;
    invoice?: { id: number; formatted_number: string; status: number } | null;
    attachments?: Attachment[];
    created_at: string;
    can: { update: boolean; delete: boolean };
}

export interface Contract {
    content_html?: string;
    id: number;
    subject: string;
    description: string | null;
    content: string | null;
    start_date: string;
    end_date: string | null;
    contract_value: string | null;
    trash: boolean;
    not_visible_to_client: boolean;
    signed: boolean;
    marked_as_signed: boolean;
    signer_name: string | null;
    signed_at: string | null;
    is_expired: boolean;
    customer?: { id: number; name: string } | null;
    type?: { id: number; name: string } | null;
    project?: { id: number; name: string } | null;
    renewals?: { id: number; old_start_date: string; new_start_date: string; old_end_date: string | null; new_end_date: string | null; old_value: string | null; new_value: string | null; renewed_by: string | null; created_at: string }[];
    comments?: Comment[];
    attachments?: Attachment[];
    created_at: string;
    can: { update: boolean; delete: boolean };
}

export interface LeadStatus {
    id: number;
    name: string;
    color: string;
    is_default: boolean;
    status_order?: number;
    count?: number;
    value?: number;
}

export interface Lead {
    id: number;
    name: string;
    title: string | null;
    company: string | null;
    description: string | null;
    email: string | null;
    phone: string | null;
    website: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    country: string | null;
    lead_value: string | null;
    is_public: boolean;
    lost: boolean;
    junk: boolean;
    lead_order: number;
    last_contact_at: string | null;
    last_status_change_at: string | null;
    assigned_at: string | null;
    converted_at: string | null;
    status?: LeadStatus | null;
    source?: { id: number; name: string } | null;
    assigned?: Staff | null;
    customer?: { id: number; name: string } | null;
    tags?: string[];
    activities?: { id: number; description: string; custom: boolean; user: string | null; created_at: string }[];
    notes?: NoteItem[];
    reminders?: ReminderItem[];
    attachments?: Attachment[];
    proposals?: { id: number; formatted_number: string; subject: string; total: string; status: number }[];
    created_at: string;
    can: { update: boolean; delete: boolean };
}

export interface TicketStatus {
    id: number;
    name: string;
    color: string;
    system_key: string | null;
    count?: number;
}

export interface Ticket {
    id: number;
    subject: string;
    message: string;
    name: string | null;
    email: string | null;
    cc: string | null;
    requester: string | null;
    last_reply_at: string | null;
    admin_read: boolean;
    customer?: { id: number; name: string } | null;
    contact?: { id: number; name: string; email: string } | null;
    department?: { id: number; name: string } | null;
    priority?: { id: number; name: string } | null;
    status?: TicketStatus | null;
    service?: { id: number; name: string } | null;
    project?: { id: number; name: string } | null;
    assigned?: Staff | null;
    tags?: string[];
    replies?: { id: number; message: string; is_staff: boolean; author: string | null; attachments: Attachment[]; created_at: string }[];
    notes?: NoteItem[];
    attachments?: Attachment[];
    created_at: string;
    can: { update: boolean; delete: boolean };
}
