export type QuestionType = 'checkbox' | 'radio' | 'input' | 'textarea';
export type SurveyOption = { id?: number; description: string };
export type SurveyQuestion = { id?: number; type: QuestionType; question: string; required: boolean; options: SurveyOption[] };

export type SurveySummary = { id: number; subject: string; active: boolean; url: string; path: string; created_at: string; questions_count?: number; participants?: number };

export type SurveyDetail = SurveySummary & {
    description: string | null;
    view_description: string | null;
    from_name: string | null;
    redirect_url: string | null;
    ip_restrict: boolean;
    only_for_logged_in: boolean;
    participants: number;
    questions: SurveyQuestion[];
    send_logs: { id: number; total: number; sent: number; lists: string[]; finished: boolean; created_at: string }[];
};

export const QUESTION_TYPES: { id: QuestionType; label: string }[] = [
    { id: 'checkbox', label: 'Checkbox' },
    { id: 'radio', label: 'Radio Buttons' },
    { id: 'input', label: 'Input Field' },
    { id: 'textarea', label: 'Text Area' },
];
