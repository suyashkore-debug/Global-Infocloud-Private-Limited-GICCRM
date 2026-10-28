// Statuses, priorities and labels as in Perfex.

export interface Option {
    id: number;
    name: string;
    color: string;
}

export const PROJECT_STATUSES: Option[] = [
    { id: 1, name: 'Not Started', color: '#475569' },
    { id: 2, name: 'In Progress', color: '#2563eb' },
    { id: 3, name: 'On Hold', color: '#f97316' },
    { id: 5, name: 'Cancelled', color: '#94a3b8' },
    { id: 4, name: 'Finished', color: '#16a34a' },
];

/** Shown by default in the projects list; finished and cancelled are filtered out. */
export const DEFAULT_PROJECT_STATUS_FILTER = [1, 2, 3];

export const TASK_STATUSES: Option[] = [
    { id: 1, name: 'Not Started', color: '#64748b' },
    { id: 4, name: 'In Progress', color: '#3b82f6' },
    { id: 3, name: 'Testing', color: '#0284c7' },
    { id: 2, name: 'Awaiting Feedback', color: '#84cc16' },
    // GIC's own status (GICHRMS my_functions_helper).
    { id: 50, name: 'Old Task Pending For Feedback', color: '#989898' },
    { id: 5, name: 'Complete', color: '#22c55e' },
];

export const TASK_PRIORITIES: Option[] = [
    { id: 1, name: 'Low', color: '#777777' },
    { id: 2, name: 'Medium', color: '#03a9f4' },
    { id: 3, name: 'High', color: '#ff6f00' },
    { id: 4, name: 'Urgent', color: '#fc2d42' },
];

export const BILLING_TYPES = [
    { id: 1, name: 'Fixed Rate' },
    { id: 2, name: 'Project Hours' },
    { id: 3, name: 'Task Hours' },
];

export const RECURRING_TYPES = [
    { id: 'day', name: 'Day(s)' },
    { id: 'week', name: 'Week(s)' },
    { id: 'month', name: 'Month(s)' },
    { id: 'year', name: 'Year(s)' },
];

export const MILESTONE_COLORS = ['#3b82f6', '#22c55e', '#f97316', '#ef4444', '#8b5cf6', '#14b8a6', '#eab308', '#64748b'];

export const ACTIVITY_LABELS: Record<string, string> = {
    project_activity_created: 'Created the project',
    project_activity_updated: 'Updated project',
    project_activity_removed_team_member: 'Removed team member',
    project_activity_added_team_member: 'Added new team member',
    project_activity_marked_all_tasks_as_complete: 'Marked all tasks as complete',
    project_activity_recorded_timesheet: 'Recorded timesheet',
    project_activity_invoiced_project: 'Invoiced project',
    project_activity_deleted_discussion: 'Deleted discussion',
    project_activity_created_discussion: 'Created discussion',
    project_activity_updated_discussion: 'Updated discussion',
    project_activity_commented_on_discussion: 'Commented on discussion',
    project_activity_deleted_discussion_comment: 'Deleted discussion comment',
    project_activity_deleted_milestone: 'Deleted milestone',
    project_activity_updated_milestone: 'Updated milestone',
    project_activity_created_milestone: 'Created new milestone',
    project_activity_task_marked_complete: 'Task marked as complete',
    project_activity_task_unmarked_complete: 'Task unmarked as complete',
    project_activity_task_deleted: 'Task deleted',
    project_activity_new_task_comment: 'Commented on task',
    project_activity_new_task_attachment: 'Uploaded attachment on task',
    project_activity_new_task_assignee: 'Added new task assignee',
    project_activity_task_assignee_removed: 'Removed task assignee',
    project_activity_task_timesheet_deleted: 'Removed timesheet',
    project_activity_uploaded_file: 'Uploaded project file',
    project_activity_status_updated: 'Updated project status',
    project_activity_project_file_removed: 'Removed project file',
    project_marked_as_finished: 'Marked project as finished',
    not_project_activity_task_status_changed: 'Task status changed',
};

export function optionById(options: Option[], id: number | null | undefined): Option | undefined {
    return options.find((option) => option.id === id);
}
