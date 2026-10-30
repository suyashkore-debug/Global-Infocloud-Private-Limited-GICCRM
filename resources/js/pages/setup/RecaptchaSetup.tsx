import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { Button, ErrorNote, Field, Input, Spinner } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

type Settings = { site_key: string; has_secret_key: boolean };

/** Setup → reCAPTCHA: Google reCAPTCHA v2 keys, used by the web forms that turn it on. */
export default function RecaptchaSetup() {
    const toast = useToast();
    const { data } = useApi<{ data: Settings }>('/settings/recaptcha');
    const [settings, setSettings] = useState<Settings | null>(null);
    const [siteKey, setSiteKey] = useState('');
    const [secretKey, setSecretKey] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (data) {
            setSettings(data.data);
            setSiteKey(data.data.site_key);
        }
    }, [data]);

    if (!settings) {
        return <Spinner />;
    }

    async function save(clear = false) {
        setSaving(true);
        setError(null);
        try {
            const res = await api.put<{ data: Settings }>('/settings/recaptcha', clear ? { clear: true } : { site_key: siteKey, secret_key: secretKey || undefined });
            setSettings(res.data.data);
            setSiteKey(res.data.data.site_key);
            setSecretKey('');
            toast(clear ? 'reCAPTCHA keys removed.' : 'reCAPTCHA settings saved.');
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setSaving(false);
        }
    }

    const ready = settings.site_key !== '' && settings.has_secret_key;

    return (
        <div className="panel_s max-w-2xl">
            <div className="panel-body space-y-3">
                <h5 className="text-[15px] font-semibold">Google reCAPTCHA</h5>
                <p className="text-xs text-gray-500">
                    Stops spam bots on the public Web to Lead and Estimate Request forms. Create a <b>reCAPTCHA v2 → "I'm not a robot" Checkbox</b> key at google.com/recaptcha/admin, add your website's domain, and paste both keys here. Then turn on
                    "Use Google reCAPTCHA" on each form that needs it.
                </p>
                <p className={`text-[13px] font-semibold ${ready ? 'text-emerald-600' : 'text-slate-500'}`}>{ready ? '● Active: forms with reCAPTCHA turned on show the check.' : '○ Not set: forms work without the check.'}</p>
                <ErrorNote message={error} />
                <Field label="Site key">
                    <Input value={siteKey} onChange={(e) => setSiteKey(e.target.value)} />
                </Field>
                <Field label="Secret key" hint={settings.has_secret_key ? 'Saved. Leave empty to keep it.' : 'Kept encrypted; never shown again.'}>
                    <Input type="password" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} autoComplete="new-password" />
                </Field>
                <div className="flex gap-2">
                    <Button onClick={() => save()} loading={saving}>
                        Save
                    </Button>
                    {ready && (
                        <Button variant="secondary" onClick={() => confirm('Remove the reCAPTCHA keys? Forms will stop asking for the check.') && save(true)}>
                            Remove keys
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
