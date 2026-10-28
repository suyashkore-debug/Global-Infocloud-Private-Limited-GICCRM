import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { Button, Checkbox, ErrorNote, Field, Input, Select, Spinner } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

type StaffRow = { id: number; name: string; number: string; hrms_mobile: string | null };
type CallSettings = {
    calls_provider: string;
    calls_exotel_subdomain: string;
    calls_exotel_sid: string;
    calls_caller_id: string;
    calls_record: string;
    calls_country_code: string;
    has_api_key: boolean;
    has_api_token: boolean;
    status_url: string;
    incoming_url: string;
    staff: StaffRow[];
};

/** Setup → Calls: the company's Exotel account, used by "Call now" and the automatic call log on leads. */
export default function CallsSetup() {
    const toast = useToast();
    const { data } = useApi<{ data: CallSettings }>('/settings/calls');
    const [form, setForm] = useState<CallSettings | null>(null);
    const [apiKey, setApiKey] = useState('');
    const [apiToken, setApiToken] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (data) {
            setForm(data.data);
        }
    }, [data]);

    if (!form) {
        return <Spinner />;
    }
    const set = (patch: Partial<CallSettings>) => setForm({ ...form, ...patch });
    const setNumber = (id: number, number: string) => set({ staff: form.staff.map((s) => (s.id === id ? { ...s, number } : s)) });

    async function save(clear = false) {
        setSaving(true);
        setError(null);
        try {
            const res = await api.put<{ data: CallSettings }>('/settings/calls', {
                ...form,
                calls_exotel_api_key: apiKey || undefined,
                calls_exotel_api_token: apiToken || undefined,
                clear_credentials: clear,
                staff_numbers: Object.fromEntries(form!.staff.map((s) => [s.id, s.number])),
            });
            setForm(res.data.data);
            setApiKey('');
            setApiToken('');
            toast(clear ? 'Exotel disconnected.' : 'Call settings saved.');
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
                <div className="panel_s">
                    <div className="panel-body space-y-3">
                        <h5 className="text-[15px] font-semibold">Calling Provider</h5>
                        <p className="text-xs text-gray-500">With Exotel connected, "Call now" on a lead rings the staff member's mobile first, then the lead, who sees the company number. Every call (outgoing and incoming) is logged on the lead with its talk time and recording. Without it, "Call now" opens the phone's dialer and calls are logged by hand.</p>
                        <ErrorNote message={error} />
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Provider">
                                <Select value={form.calls_provider} onChange={(e) => set({ calls_provider: e.target.value })}>
                                    <option value="">None (dial from the phone, log by hand)</option>
                                    <option value="exotel">Exotel</option>
                                </Select>
                            </Field>
                            <Field label="Exotel Region">
                                <Select value={form.calls_exotel_subdomain} onChange={(e) => set({ calls_exotel_subdomain: e.target.value })}>
                                    <option value="api.exotel.com">Singapore (api.exotel.com)</option>
                                    <option value="api.in.exotel.com">Mumbai (api.in.exotel.com)</option>
                                </Select>
                            </Field>
                            <Field label="Account SID" hint="Exotel dashboard → API settings.">
                                <Input value={form.calls_exotel_sid} onChange={(e) => set({ calls_exotel_sid: e.target.value })} />
                            </Field>
                            <Field label="ExoPhone (Caller ID)" hint="The company number leads see.">
                                <Input value={form.calls_caller_id} onChange={(e) => set({ calls_caller_id: e.target.value })} placeholder="080 4711 2233" />
                            </Field>
                            <Field label="API Key" hint={form.has_api_key ? 'Saved. Leave empty to keep it.' : undefined}>
                                <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="new-password" />
                            </Field>
                            <Field label="API Token" hint={form.has_api_token ? 'Saved. Leave empty to keep it.' : undefined}>
                                <Input type="password" value={apiToken} onChange={(e) => setApiToken(e.target.value)} autoComplete="new-password" />
                            </Field>
                            <Field label="Default Country Code" hint="Added to numbers typed without one.">
                                <Input value={form.calls_country_code} onChange={(e) => set({ calls_country_code: e.target.value })} placeholder="91" />
                            </Field>
                        </div>
                        <Checkbox label="Record calls (callers should hear a recording announcement — set it in the Exotel call flow)" checked={form.calls_record === '1'} onChange={(v) => set({ calls_record: v ? '1' : '0' })} />
                        <div className="flex gap-2">
                            <Button onClick={() => save()} loading={saving}>
                                Save
                            </Button>
                            {form.has_api_token && (
                                <Button variant="secondary" onClick={() => confirm('Remove the saved Exotel API key and token?') && save(true)}>
                                    Disconnect
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
                <div className="panel_s">
                    <div className="panel-body space-y-3">
                        <h5 className="text-[15px] font-semibold">Webhooks (call details into the CRM)</h5>
                        <p className="text-xs text-gray-500">Both URLs must be reachable from the internet (not 127.0.0.1). Keep them private: they contain the company's secret key.</p>
                        <Field label="Outgoing calls: status callback" hint="Sent to Exotel automatically with every call; nothing to set up.">
                            <Input value={form.status_url} readOnly onFocus={(e) => e.target.select()} />
                        </Field>
                        <Field label="Incoming calls: Passthru URL" hint="In Exotel → App Bazaar, open the ExoPhone's incoming flow and add a Passthru applet after the Connect applet with this URL.">
                            <Input value={form.incoming_url} readOnly onFocus={(e) => e.target.select()} />
                        </Field>
                    </div>
                </div>
            </div>
            <div className="panel_s">
                <div className="panel-body space-y-3">
                    <h5 className="text-[15px] font-semibold">Staff Mobile Numbers</h5>
                    <p className="text-xs text-gray-500">The phone that rings when a staff member clicks "Call now", and how incoming calls are matched to who answered. Leave empty to use the mobile number from their HRMS profile.</p>
                    <div className="max-h-[560px] divide-y divide-gray-100 overflow-y-auto">
                        {form.staff.map((s) => (
                            <div key={s.id} className="grid grid-cols-[1fr_180px] items-center gap-3 py-2 text-[13.5px]">
                                <span className="truncate">{s.name}</span>
                                <Input value={s.number} onChange={(e) => setNumber(s.id, e.target.value)} placeholder={s.hrms_mobile || 'No HRMS mobile'} />
                            </div>
                        ))}
                    </div>
                    <Button onClick={() => save()} loading={saving}>
                        Save
                    </Button>
                </div>
            </div>
        </div>
    );
}
