import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import type { User } from '../../types';
import { confirmDialog } from '../../components/ui/Dialogs';

/** Setup → Company Information → Company Logo: shown in the app, on e-mails and PDFs. */
export default function CompanyLogoSetup() {
    const toast = useToast();
    const { user, updateUser } = useAuth();
    const input = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const logo = user?.company?.logo_url ?? null;

    async function refreshUser() {
        const { data } = await api.get<{ data: { user: User } }>('/me');
        updateUser(data.data.user);
    }

    async function upload(file: File) {
        setBusy(true);
        try {
            const body = new FormData();
            body.append('logo', file);
            await api.post('/setup/company-logo', body);
            await refreshUser();
            toast('Logo updated.');
        } catch (e) {
            toast(errorMessage(e), 'error');
        } finally {
            setBusy(false);
            if (input.current) {
                input.current.value = '';
            }
        }
    }

    async function remove() {
        if (!(await confirmDialog('Remove the company logo?'))) {
            return;
        }
        setBusy(true);
        try {
            await api.delete('/setup/company-logo');
            await refreshUser();
            toast('Logo removed.');
        } catch (e) {
            toast(errorMessage(e), 'error');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="panel_s mb-4">
            <div className="panel-body flex flex-wrap items-center gap-5">
                <div className="flex h-24 w-48 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50 p-2">
                    {logo ? <img src={logo} alt="Company logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-slate-400">No logo</span>}
                </div>
                <div className="min-w-0 flex-1">
                    <h5 className="text-[15px] font-semibold">Company Logo</h5>
                    <p className="mt-0.5 text-xs text-slate-500">Shown in the menu, on e-mails and on invoice, estimate and proposal PDFs. PNG or JPG, up to 2 MB.</p>
                    <div className="mt-3 flex gap-2">
                        <input ref={input} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                        <Button size="sm" onClick={() => input.current?.click()} loading={busy}>
                            <ImagePlus className="h-4 w-4" /> {logo ? 'Change logo' : 'Upload logo'}
                        </Button>
                        {logo && (
                            <Button size="sm" variant="secondary" onClick={remove} disabled={busy}>
                                <Trash2 className="h-4 w-4" /> Remove
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
