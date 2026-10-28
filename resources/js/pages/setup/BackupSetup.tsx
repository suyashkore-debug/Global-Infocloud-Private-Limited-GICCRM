import { useEffect, useState } from 'react';
import { DatabaseBackup, Download, Loader2, ShieldAlert, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { Button, Card, EmptyState, Field, Input, Select, Spinner } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

type Backup = { name: string; size: number; created_at: string };
type Settings = { auto_backup_enabled: string; auto_backup_every: string; auto_backup_hour: string; delete_backups_older_then: string; last_auto_backup: string };

const size = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00 (${h === 0 ? '12' : h > 12 ? h - 12 : h} ${h < 12 ? 'AM' : 'PM'})`;

/**
 * Setup → Backup (Perfex Backup module), super admins only: database backups made now or on a
 * schedule, kept for N days, downloadable as .sql.gz.
 */
export default function BackupSetup() {
    const toast = useToast();
    const [rows, setRows] = useState<Backup[] | null>(null);
    const [settings, setSettings] = useState<Settings | null>(null);
    const [busy, setBusy] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        api.get<{ data: Backup[]; settings: Settings }>('/setup/backups')
            .then((r) => (setRows(r.data.data), setSettings(r.data.settings)))
            .catch((e) => toast(errorMessage(e), 'error'));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function createNow() {
        setBusy(true);
        try {
            const r = await api.post<{ data: Backup[]; message: string }>('/setup/backups');
            setRows(r.data.data);
            toast(r.data.message);
        } catch (e) {
            toast(errorMessage(e), 'error');
        } finally {
            setBusy(false);
        }
    }

    async function download(b: Backup) {
        try {
            const r = await api.get(`/setup/backups/${b.name}`, { responseType: 'blob' });
            const url = URL.createObjectURL(r.data as Blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = b.name;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    async function remove(b: Backup) {
        if (!confirm(`Delete the backup ${b.name}? It cannot be recovered.`)) {
            return;
        }
        try {
            const r = await api.delete<{ data: Backup[]; message: string }>(`/setup/backups/${b.name}`);
            setRows(r.data.data);
            toast(r.data.message);
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    async function save() {
        if (!settings) {
            return;
        }
        setSaving(true);
        try {
            const r = await api.put<{ settings: Settings; message: string }>('/setup/backups/settings', settings);
            setSettings(r.data.settings);
            toast(r.data.message);
        } catch (e) {
            toast(errorMessage(e), 'error');
        } finally {
            setSaving(false);
        }
    }

    if (!rows || !settings) {
        return <Spinner />;
    }

    const set = (name: keyof Settings, value: string) => setSettings({ ...settings, [name]: value });

    return (
        <div className="space-y-5">
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-800">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
                <p>
                    A backup is a copy of the <b>whole CRM database — every company's data</b>, so only super admins see this page. Keep downloaded files somewhere safe. Uploaded files (attachments, media) are not part of the
                    database backup; back up the server's storage folder separately.
                </p>
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
                <Card className="p-5 lg:col-span-2">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="text-[15px] font-semibold text-slate-800">Database backups</h2>
                            <p className="text-xs text-slate-500">
                                {rows.length} kept · last automatic backup: {settings.last_auto_backup ? `${settings.last_auto_backup} IST` : 'not yet'}
                            </p>
                        </div>
                        <Button onClick={createNow} disabled={busy}>
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseBackup className="h-4 w-4" />} {busy ? 'Backing up…' : 'Create backup now'}
                        </Button>
                    </div>
                    {rows.length === 0 ? (
                        <EmptyState title="No backups yet" text="Create one now, or wait for the automatic backup." />
                    ) : (
                        <div className="-mx-5 overflow-x-auto">
                            <table className="table-perfex">
                                <thead>
                                    <tr>
                                        <th>Backup</th>
                                        <th>Created</th>
                                        <th className="text-right">Size</th>
                                        <th className="w-24" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((b) => (
                                        <tr key={b.name}>
                                            <td className="font-mono text-[12.5px] text-slate-700">{b.name}</td>
                                            <td className="whitespace-nowrap">{formatDateTime(b.created_at)}</td>
                                            <td className="whitespace-nowrap text-right">{size(b.size)}</td>
                                            <td>
                                                <div className="flex justify-end gap-1">
                                                    <button type="button" onClick={() => download(b)} className="rounded-lg p-1.5 text-slate-500 hover:bg-brand-50 hover:text-brand" title="Download">
                                                        <Download className="h-4 w-4" />
                                                    </button>
                                                    <button type="button" onClick={() => remove(b)} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Delete">
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>

                <Card className="space-y-4 p-5">
                    <h2 className="text-[15px] font-semibold text-slate-800">Automatic backup</h2>
                    <Field label="Automatic backup">
                        <Select value={settings.auto_backup_enabled} onChange={(e) => set('auto_backup_enabled', e.target.value)}>
                            <option value="1">On</option>
                            <option value="0">Off</option>
                        </Select>
                    </Field>
                    <Field label="Back up every (days)">
                        <Input type="number" min={1} max={365} value={settings.auto_backup_every} onChange={(e) => set('auto_backup_every', e.target.value)} />
                    </Field>
                    <Field label="Hour of day (India time)" hint="The backup runs once this hour is reached.">
                        <Select value={settings.auto_backup_hour} onChange={(e) => set('auto_backup_hour', e.target.value)}>
                            {Array.from({ length: 24 }, (_, h) => (
                                <option key={h} value={String(h)}>
                                    {hourLabel(h)}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="Delete backups older than (days)" hint="0 keeps every backup.">
                        <Input type="number" min={0} max={3650} value={settings.delete_backups_older_then} onChange={(e) => set('delete_backups_older_then', e.target.value)} />
                    </Field>
                    <div className="flex justify-end">
                        <Button onClick={save} disabled={saving}>
                            Save
                        </Button>
                    </div>
                </Card>
            </div>
        </div>
    );
}
