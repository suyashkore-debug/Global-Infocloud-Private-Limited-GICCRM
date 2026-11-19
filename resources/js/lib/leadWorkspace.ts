import { readStorage, writeStorage } from './storage';

/** The open lead workspace (TeleCRM-style): picked in the header, shown by the Leads page. */
const KEY = 'leads_pipeline';
export const LEAD_WORKSPACE_CHANGED = 'lead-workspace-changed';

export function getLeadWorkspace(): number | null {
    return Number(readStorage(KEY)) || null;
}

/**
 * keepPage: the record open on this page is what asked for the switch (a link to a record of
 * another workspace), so the page stays. Otherwise a record's page goes to its list first, as
 * reopening that record would switch straight back to its own workspace.
 */
export function setLeadWorkspace(id: number, keepPage = false): void {
    writeStorage(KEY, String(id));
    announce(id, keepPage);
}

function announce(id: number, keepPage: boolean): void {
    window.dispatchEvent(Object.assign(new CustomEvent(LEAD_WORKSPACE_CHANGED, { detail: id }), { keepPage }));
}

/** Whether a workspace change keeps the record page that is open (see setLeadWorkspace). */
export function keepsPage(e: Event): boolean {
    return (e as Event & { keepPage?: boolean }).keepPage === true;
}

/** The list a record's page belongs to (/customers/16 → /customers), or null on other pages. */
export function recordListPath(pathname: string): string | null {
    const segments = pathname.split('/');
    const record = segments.findIndex((s) => /^\d+$/.test(s));

    return record > 0 ? segments.slice(0, record).join('/') || '/' : null;
}

// Another tab picked a workspace: this tab follows (its requests already use it).
if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
        if (e.key === KEY && Number(e.newValue)) {
            announce(Number(e.newValue), false);
        }
    });
}