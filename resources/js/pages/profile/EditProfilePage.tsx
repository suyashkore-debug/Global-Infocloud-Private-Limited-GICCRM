import { useEffect, useState, type FormEvent } from 'react';
import { Camera } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../auth/AuthContext';
import { clearStaffCache } from '../../hooks/useStaff';
import { Avatar, Button, ErrorNote, Field, Input, Spinner, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import type { User } from '../../types';
import type { Profile } from './MyProfilePage';

type Errors = Record<string, string>;

function fieldErrors(e: unknown): Errors {
    const errors = (e as { response?: { data?: { errors?: Record<string, string[]> } } }).response?.data?.errors ?? {};

    return Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, v[0]]));
}

/**
 * Perfex "Edit Profile": photo, name, phone, social links, e-mail signature and password.
 * Name, phone, photo and password are saved in HRMS (the same login works in both apps).
 */
export default function EditProfilePage() {
    const toast = useToast();
    const { updateUser } = useAuth();
    const { data, reload } = useApi<{ data: Profile }>('/profile');
    const [form, setForm] = useState({ first_name: '', last_name: '', mobile: '', facebook: '', linkedin: '', skype: '', email_signature: '' });
    const [errors, setErrors] = useState<Errors>({});
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [pw, setPw] = useState({ old_password: '', new_password: '', new_password_confirmation: '' });
    const [pwErrors, setPwErrors] = useState<Errors>({});
    const [pwError, setPwError] = useState<string | null>(null);
    const [pwSaving, setPwSaving] = useState(false);

    useEffect(() => {
        if (data) {
            const p = data.data;
            setForm({
                first_name: p.first_name ?? '',
                last_name: p.last_name ?? '',
                mobile: p.mobile ?? '',
                facebook: p.facebook ?? '',
                linkedin: p.linkedin ?? '',
                skype: p.skype ?? '',
                email_signature: p.email_signature ?? '',
            });
        }
    }, [data]);

    if (!data) {
        return <Spinner />;
    }
    const p = data.data;
    const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

    async function save(e: FormEvent) {
        e.preventDefault();
        setSaving(true);
        setErrors({});
        setError(null);
        try {
            const res = await api.put<{ data: User }>('/profile', form);
            updateUser(res.data.data);
            clearStaffCache();
            toast('Your profile has been updated.');
            reload();
        } catch (err) {
            setErrors(fieldErrors(err));
            setError(errorMessage(err));
        } finally {
            setSaving(false);
        }
    }

    async function uploadPhoto(file: File | undefined) {
        if (!file) {
            return;
        }
        setUploading(true);
        const body = new FormData();
        body.append('photo', file);
        try {
            const res = await api.post<{ data: User }>('/profile/photo', body);
            updateUser(res.data.data);
            clearStaffCache();
            toast('Profile photo updated.');
            reload();
        } catch (err) {
            toast(errorMessage(err), 'error');
        } finally {
            setUploading(false);
        }
    }

    async function changePassword(e: FormEvent) {
        e.preventDefault();
        setPwSaving(true);
        setPwErrors({});
        setPwError(null);
        try {
            await api.post('/profile/password', pw);
            setPw({ old_password: '', new_password: '', new_password_confirmation: '' });
            toast('Password changed. Use the new password next time you log in (HRMS too).');
        } catch (err) {
            setPwErrors(fieldErrors(err));
            setPwError(errorMessage(err));
        } finally {
            setPwSaving(false);
        }
    }

    return (
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-12">
            <form onSubmit={save} className="space-y-3 lg:col-span-7">
                <h4 className="page-title">Edit Profile</h4>
                <div className="panel_s">
                    <div className="panel-body space-y-4">
                        <ErrorNote message={error} />
                        <div className="flex items-center gap-4">
                            <Avatar id={p.id} name={p.full_name} photo={p.photo_url} size="lg" />
                            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-[13px] text-gray-700 hover:bg-gray-50">
                                <Camera className="h-4 w-4" /> {uploading ? 'Uploading…' : 'Profile image'}
                                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => (uploadPhoto(e.target.files?.[0]), (e.target.value = ''))} />
                            </label>
                            <span className="text-xs text-gray-500">JPG, PNG or WEBP, up to 2 MB</span>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="First Name" required error={errors.first_name}>
                                <Input value={form.first_name} onChange={set('first_name')} />
                            </Field>
                            <Field label="Last Name" required error={errors.last_name}>
                                <Input value={form.last_name} onChange={set('last_name')} />
                            </Field>
                            <Field label="Email" hint="Changed in HRMS by HR.">
                                <Input value={p.email ?? ''} disabled />
                            </Field>
                            <Field label="Phone" required error={errors.mobile}>
                                <Input value={form.mobile} onChange={set('mobile')} />
                            </Field>
                            <Field label="Facebook" error={errors.facebook}>
                                <Input value={form.facebook} onChange={set('facebook')} placeholder="https://facebook.com/..." />
                            </Field>
                            <Field label="LinkedIn" error={errors.linkedin}>
                                <Input value={form.linkedin} onChange={set('linkedin')} placeholder="https://linkedin.com/in/..." />
                            </Field>
                            <Field label="Skype" error={errors.skype}>
                                <Input value={form.skype} onChange={set('skype')} />
                            </Field>
                        </div>
                        <Field label="Email Signature" error={errors.email_signature}>
                            <Textarea rows={4} value={form.email_signature} onChange={set('email_signature')} />
                        </Field>
                        {p.departments.length > 0 && (
                            <div>
                                <p className="mb-1.5 text-[13px] font-medium text-gray-700">Your departments</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {p.departments.map((d) => (
                                        <span key={d} className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                                            {d}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="text-right">
                            <Button type="submit" loading={saving}>
                                Submit
                            </Button>
                        </div>
                    </div>
                </div>
            </form>

            <form onSubmit={changePassword} className="space-y-3 lg:col-span-5">
                <h4 className="page-title">Change Your Password</h4>
                <div className="panel_s">
                    <div className="panel-body space-y-3">
                        <ErrorNote message={pwError} />
                        <Field label="Old Password" error={pwErrors.old_password}>
                            <Input type="password" autoComplete="current-password" value={pw.old_password} onChange={(e) => setPw({ ...pw, old_password: e.target.value })} />
                        </Field>
                        <Field label="New Password" error={pwErrors.new_password}>
                            <Input type="password" autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} />
                        </Field>
                        <Field label="Repeat New Password">
                            <Input type="password" autoComplete="new-password" value={pw.new_password_confirmation} onChange={(e) => setPw({ ...pw, new_password_confirmation: e.target.value })} />
                        </Field>
                        <p className="text-xs text-gray-500">The password is the HRMS password, so it changes for HRMS too.</p>
                        <div className="text-right">
                            <Button type="submit" loading={pwSaving} disabled={!pw.old_password || !pw.new_password}>
                                Submit
                            </Button>
                        </div>
                    </div>
                </div>
            </form>
        </div>
    );
}
