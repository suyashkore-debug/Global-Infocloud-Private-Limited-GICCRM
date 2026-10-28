import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { Button, Checkbox, ErrorNote, Field, Input, Select, Spinner } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

type WhatsAppSettings = {
    whatsapp_provider: string;
    whatsapp_bird_workspace_id: string;
    whatsapp_bird_channel_id: string;
    whatsapp_bird_template_version: string;
    whatsapp_bird_template_param: string;
    has_bird_access_key: boolean;
    bird_webhook_url: string;
    bird_signing_key: string;
    whatsapp_phone_number_id: string;
    whatsapp_verify_token: string;
    whatsapp_country_code: string;
    whatsapp_template_name: string;
    whatsapp_template_language: string;
    whatsapp_template_lead_name: string;
    has_access_token: boolean;
    has_app_secret: boolean;
    webhook_url: string;
};

/**
 * Setup → WhatsApp: the company's WhatsApp Business number used in the lead WhatsApp tab, either
 * on Meta's Cloud API directly or through a Bird workspace.
 */
export default function WhatsAppSetup() {
    const toast = useToast();
    const { data } = useApi<{ data: WhatsAppSettings }>('/settings/whatsapp');
    const [form, setForm] = useState<WhatsAppSettings | null>(null);
    const [token, setToken] = useState('');
    const [secret, setSecret] = useState('');
    const [birdKey, setBirdKey] = useState('');
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
    const set = (patch: Partial<WhatsAppSettings>) => setForm({ ...form, ...patch });
    const bird = form.whatsapp_provider === 'bird';

    async function save(clear = false) {
        setSaving(true);
        setError(null);
        try {
            const res = await api.put<{ data: WhatsAppSettings }>('/settings/whatsapp', {
                ...form,
                whatsapp_access_token: token || undefined,
                whatsapp_app_secret: secret || undefined,
                whatsapp_bird_access_key: birdKey || undefined,
                clear_access_token: clear,
            });
            setForm(res.data.data);
            setToken('');
            setSecret('');
            setBirdKey('');
            toast(clear ? 'WhatsApp disconnected.' : 'WhatsApp settings saved.');
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <div className="panel_s">
                <div className="panel-body space-y-3">
                    <h5 className="text-[15px] font-semibold">WhatsApp Business Number</h5>
                    <ErrorNote message={error} />
                    <Field label="Provider" hint="Where the company's WhatsApp number is connected.">
                        <Select value={form.whatsapp_provider} onChange={(e) => set({ whatsapp_provider: e.target.value })}>
                            <option value="meta">Meta (WhatsApp Cloud API directly)</option>
                            <option value="bird">Bird (app.bird.com)</option>
                        </Select>
                    </Field>
                    {bird ? (
                        <>
                            <p className="text-xs text-gray-500">The WhatsApp number installed as a channel in your Bird workspace (app.bird.com → Developer → WhatsApp). Staff can then message leads from the lead's WhatsApp tab.</p>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Field label="Workspace ID" className="sm:col-span-2" hint="In the address bar after app.bird.com/workspaces/.">
                                    <Input value={form.whatsapp_bird_workspace_id} onChange={(e) => set({ whatsapp_bird_workspace_id: e.target.value.trim() })} placeholder="7859b465-…" />
                                </Field>
                                <Field label="WhatsApp Channel ID" className="sm:col-span-2" hint="Developer → WhatsApp → WhatsApp Setup → your channel.">
                                    <Input value={form.whatsapp_bird_channel_id} onChange={(e) => set({ whatsapp_bird_channel_id: e.target.value.trim() })} />
                                </Field>
                                <Field label="Access Key" className="sm:col-span-2" hint={form.has_bird_access_key ? 'A key is saved. Leave empty to keep it.' : 'Settings → Developer → Access keys. Its policy must allow creating messages on this channel.'}>
                                    <Input type="password" value={birdKey} onChange={(e) => setBirdKey(e.target.value)} autoComplete="new-password" />
                                </Field>
                                <Field label="Default Country Code" hint="Added to lead numbers typed without one.">
                                    <Input value={form.whatsapp_country_code} onChange={(e) => set({ whatsapp_country_code: e.target.value })} placeholder="91" />
                                </Field>
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="text-xs text-gray-500">Connect your WhatsApp Business number from Meta (developers.facebook.com → your app → WhatsApp → API Setup). Staff can then message leads from the lead's WhatsApp tab.</p>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Field label="Phone Number ID" className="sm:col-span-2">
                                    <Input value={form.whatsapp_phone_number_id} onChange={(e) => set({ whatsapp_phone_number_id: e.target.value })} placeholder="e.g. 106540352242922" />
                                </Field>
                                <Field label="Access Token" className="sm:col-span-2" hint={form.has_access_token ? 'A token is saved. Leave empty to keep it.' : 'Use a permanent System User token.'}>
                                    <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="new-password" />
                                </Field>
                                <Field label="App Secret" hint={form.has_app_secret ? 'Saved. Leave empty to keep it.' : 'Optional: checks that webhook calls really come from Meta.'}>
                                    <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="new-password" />
                                </Field>
                                <Field label="Default Country Code" hint="Added to lead numbers typed without one.">
                                    <Input value={form.whatsapp_country_code} onChange={(e) => set({ whatsapp_country_code: e.target.value })} placeholder="91" />
                                </Field>
                            </div>
                        </>
                    )}
                    <div className="flex gap-2">
                        <Button onClick={() => save()} loading={saving}>
                            Save
                        </Button>
                        {(form.has_access_token || form.has_bird_access_key) && (
                            <Button variant="secondary" onClick={() => confirm('Remove the saved keys, tokens and secrets?') && save(true)}>
                                Disconnect
                            </Button>
                        )}
                    </div>
                </div>
            </div>
            <div className="space-y-4">
                <div className="panel_s">
                    <div className="panel-body space-y-3">
                        <h5 className="text-[15px] font-semibold">Webhook (replies from leads)</h5>
                        {bird ? (
                            <>
                                <p className="text-xs text-gray-500">In Bird → Settings → Developer → Webhooks (webhook subscriptions), add two subscriptions with this URL and signing key: service "channels" with event whatsapp.inbound (replies), and event whatsapp.outbound (delivery status). Filter both by the WhatsApp channel. The URL must be reachable from the internet (not 127.0.0.1).</p>
                                <Field label="Webhook URL">
                                    <Input value={form.bird_webhook_url} readOnly onFocus={(e) => e.target.select()} />
                                </Field>
                                <Field label="Signing Key" hint="Paste this into Bird when creating the subscriptions.">
                                    <Input value={form.bird_signing_key} readOnly onFocus={(e) => e.target.select()} />
                                </Field>
                            </>
                        ) : (
                            <>
                                <p className="text-xs text-gray-500">In the Meta app → WhatsApp → Configuration, set this Callback URL and Verify Token, then subscribe to the "messages" field. The URL must be reachable from the internet (not 127.0.0.1).</p>
                                <Field label="Callback URL">
                                    <Input value={form.webhook_url} readOnly onFocus={(e) => e.target.select()} />
                                </Field>
                                <Field label="Verify Token" hint="Any secret word; type the same one in Meta.">
                                    <Input value={form.whatsapp_verify_token} onChange={(e) => set({ whatsapp_verify_token: e.target.value })} />
                                </Field>
                            </>
                        )}
                    </div>
                </div>
                <div className="panel_s">
                    <div className="panel-body space-y-3">
                        <h5 className="text-[15px] font-semibold">Opening Template</h5>
                        <p className="text-xs text-gray-500">WhatsApp only allows free text within 24 hours of the lead's last message. To start a conversation, an approved template is sent first.</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Field label={bird ? 'Template Project ID' : 'Template Name'} hint={bird ? 'Developer → WhatsApp → Templates management → the template.' : undefined}>
                                <Input value={form.whatsapp_template_name} onChange={(e) => set({ whatsapp_template_name: e.target.value })} placeholder="hello_world" />
                            </Field>
                            <Field label={bird ? 'Locale' : 'Language Code'}>
                                <Input value={form.whatsapp_template_language} onChange={(e) => set({ whatsapp_template_language: e.target.value })} placeholder={bird ? 'en' : 'en_US'} />
                            </Field>
                            {bird && (
                                <Field label="Template Version ID" hint="Optional: the approved version to send.">
                                    <Input value={form.whatsapp_bird_template_version} onChange={(e) => set({ whatsapp_bird_template_version: e.target.value.trim() })} />
                                </Field>
                            )}
                        </div>
                        <Checkbox
                            label={bird ? "Pass the lead's name to the template" : "The template's {{1}} is the lead's name"}
                            checked={form.whatsapp_template_lead_name === '1'}
                            onChange={(v) => set({ whatsapp_template_lead_name: v ? '1' : '0' })}
                        />
                        {bird && form.whatsapp_template_lead_name === '1' && (
                            <Field label="Template variable for the name" hint="The variable's key in the Bird template, e.g. name.">
                                <Input value={form.whatsapp_bird_template_param} onChange={(e) => set({ whatsapp_bird_template_param: e.target.value })} placeholder="name" />
                            </Field>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
