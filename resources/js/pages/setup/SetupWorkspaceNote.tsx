import { Globe, Workflow } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { getLeadWorkspace } from '../../lib/leadWorkspace';

/** Setup sections that are the same in every workspace. */
export const COMMON_SETUP_TABS = ['staff', 'permissions', 'company', 'backup', 'lead-pipelines', 'tags'];

type Workspace = { id: number; name: string; color: string; is_default: boolean };

/**
 * Above a Setup section, with several workspaces: whose setup it is (the workspace open in the
 * header) or that it is common to all of them.
 */
export default function SetupWorkspaceNote({ tab }: { tab: string }) {
    const { data } = useApi<{ data: Workspace[] }>('/leads/workspaces');
    const list = data?.data ?? [];
    if (list.length < 2) {
        return null;
    }
    const open = list.find((w) => w.id === getLeadWorkspace()) ?? list.find((w) => w.is_default) ?? list[0];
    const main = list.find((w) => w.is_default) ?? list[0];

    if (COMMON_SETUP_TABS.includes(tab)) {
        return (
            <p className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[13px] text-slate-600 ring-1 ring-slate-200">
                <Globe className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span>Common to all workspaces.</span>
            </p>
        );
    }

    return (
        <p className="flex items-start gap-2 rounded-xl px-3 py-2 text-[13px] text-slate-700" style={{ background: `${open.color}12`, boxShadow: `inset 0 0 0 1px ${open.color}55` }}>
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-white" style={{ background: open.color }}>
                <Workflow className="h-3 w-3" />
            </span>
            <span>
                Setup of the <b>{open.name}</b> workspace (switch it in the header).{' '}
                {open.id === main.id
                    ? 'Other workspaces follow these settings for whatever they have not changed.'
                    : `What you change here is for ${open.name} only; settings left as they are follow ${main.name}.`}{' '}
                List items can be for one workspace or all of them.
            </span>
        </p>
    );
}
