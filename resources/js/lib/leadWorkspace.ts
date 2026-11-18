import { readStorage, writeStorage } from './storage';

/** The open lead workspace (TeleCRM-style): picked in the header, shown by the Leads page. */
const KEY = 'leads_pipeline';
export const LEAD_WORKSPACE_CHANGED = 'lead-workspace-changed';

export function getLeadWorkspace(): number | null {
    return Number(readStorage(KEY)) || null;
}

export function setLeadWorkspace(id: number): void {
    writeStorage(KEY, String(id));
    window.dispatchEvent(new CustomEvent(LEAD_WORKSPACE_CHANGED, { detail: id }));
}

// Another tab picked a workspace: this tab follows (its requests already use it).
if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
        if (e.key === KEY && Number(e.newValue)) {
            window.dispatchEvent(new CustomEvent(LEAD_WORKSPACE_CHANGED, { detail: Number(e.newValue) }));
        }
    });
}