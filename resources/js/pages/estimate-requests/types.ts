import type { Attachment } from '../../types';

export type RequestStatus = { id: number; name: string; color: string; flag?: string | null; count?: number };

export type EstimateRequestRow = {
    id: number;
    email: string;
    form: string | null;
    status: RequestStatus | null;
    assigned: { id: number; full_name: string } | null;
    tags: string[];
    created_at: string;
};

export type EstimateRequestDetail = EstimateRequestRow & {
    submission: { label: string; name: string; value: string | string[] | null }[];
    last_status_change_at: string | null;
    date_estimated: string | null;
    estimate: { id: number; number: string } | null;
    proposal: { id: number; number: string } | null;
    attachments: Attachment[];
    prefill: Record<string, string | null>;
};

export type FieldType = 'text' | 'email' | 'number' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'date' | 'file';

export type FormField = { type: FieldType; name: string; label: string; required?: boolean; placeholder?: string | null; options?: string[] };

export type QuoteForm = {
    id: number;
    form_key: string;
    name: string;
    fields: FormField[];
    estimate_request_status_id: number | null;
    responsible_id: number | null;
    submit_btn_name: string;
    success_submit_msg: string | null;
    notify_request_submitted: boolean;
    notify_type: 'specific_staff' | 'roles' | 'assigned' | null;
    notify_ids: number[] | null;
    active: boolean;
    requests_count?: number;
    created_at: string;
};
