import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AtSign, Building2, CheckCircle2, CreditCard, Hash, ImagePlus, KeyRound, Loader2, Mail, Phone, ReceiptText, UserRound, Users } from 'lucide-react';
import { BRAND, StackedBrandLogo } from '../components/brand/BrandLogo';
import { api, errorMessage } from '../lib/api';
import { Field, IconInput, Select } from '../components/ui';
import { COUNTRIES } from '../lib/countries';
import { useTimezones } from '../hooks/useTimezones';
import { panFromGstin, taxInfo, taxProblem, useCountryProfiles } from '../hooks/useCountryProfiles';

const blank = {
    company_name: '',
    country: 'India',
    timezone: 'Asia/Kolkata',
    short_code: '',
    company_email: '',
    company_phone: '',
    gstin: '',
    pan: '',
    first_name: '',
    last_name: '',
    email: '',
    username: '',
    mobile: '',
    password: '',
    password_confirmation: '',
};

/**
 * /newcompany: a new company opens its CRM account with its first admin, who then logs in and
 * adds the team in Setup → Staff Members. The company and its staff live only in the CRM.
 */
export default function CompanySignupPage() {
    const navigate = useNavigate();
    const [form, setForm] = useState(blank);
    const timezones = useTimezones();
    // Each country's timezone, currency, phone code and tax number (its name and format).
    const profiles = useCountryProfiles();
    const profile = profiles[form.country];
    const tax = taxInfo(profiles, form.country, form.country);
    const india = tax.hasPan;
    const setGstin = (value: string) =>
        setForm((f) => {
            const pan = panFromGstin(tax, value);
            return { ...f, gstin: value.toUpperCase(), pan: pan && !f.pan ? pan : f.pan };
        });
    // A new country brings its timezone; GSTIN / PAN are India's, other countries enter their tax number.
    const pickCountry = (country: string) => setForm((f) => ({ ...f, country, timezone: profiles[country]?.timezone ?? 'UTC', pan: country === 'India' ? f.pan : '' }));
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [done, setDone] = useState<{ message: string; username: string } | null>(null);
    const [logo, setLogo] = useState<File | null>(null);
    const logoPreview = useMemo(() => (logo ? URL.createObjectURL(logo) : null), [logo]);
    useEffect(
        () => () => {
            if (logoPreview) {
                URL.revokeObjectURL(logoPreview);
            }
        },
        [logoPreview],
    );
    const set = (key: keyof typeof blank) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

    async function submit(e: FormEvent) {
        e.preventDefault();
        setSaving(true);
        setErrors({});
        setError(null);
        try {
            const body = new FormData();
            Object.entries(form).forEach(([k, v]) => body.append(k, v));
            if (logo) {
                body.append('logo', logo);
            }
            const res = await api.post<{ message: string; data: { username: string } }>('/company-signup', body);
            setDone({ message: res.data.message, username: res.data.data.username });
        } catch (err) {
            const data = (err as { response?: { data?: { errors?: Record<string, string[]> } } }).response?.data;
            if (data?.errors) {
                setErrors(Object.fromEntries(Object.entries(data.errors).map(([k, v]) => [k, v[0]])));
                setError('Please check the highlighted fields.');
            } else {
                setError(errorMessage(err));
            }
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="relative overflow-hidden px-4 pb-24 pt-10 text-white sm:px-8" style={{ background: `linear-gradient(155deg, ${BRAND.navy} 0%, #0f3566 45%, #1a4f8f 100%)` }}>
                <span className="pointer-events-none absolute -right-24 -top-28 h-96 w-96 rounded-full bg-[#2a78d6]/30 blur-3xl" />
                <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
                    <span className="inline-flex rounded-2xl bg-white px-4 py-3 shadow-lg shadow-black/10">
                        <StackedBrandLogo className="h-10" />
                    </span>
                    <h1 className="mt-6 text-[30px] font-extrabold leading-tight tracking-tight sm:text-[36px]">Create your company account</h1>
                    <p className="mt-2 max-w-xl text-[15px] text-blue-100/80">Set up your company and its administrator. After that, log in and add your team from Setup → Staff Members.</p>
                </div>
            </div>

            <div className="relative mx-auto -mt-16 max-w-3xl px-4 pb-12 sm:px-8">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_18px_40px_-20px_rgba(11,44,86,0.35)] sm:p-8">
                    {done ? (
                        <div className="flex flex-col items-center py-6 text-center">
                            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                                <CheckCircle2 className="h-8 w-8" />
                            </span>
                            <h2 className="mt-4 text-xl font-bold text-slate-900">{done.message}</h2>
                            <p className="mt-2 text-sm text-slate-500">
                                Log in with <b className="text-slate-800">{done.username}</b> and the password you chose.
                            </p>
                            <button type="button" onClick={() => navigate('/login')} className="mt-6 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-light">
                                Go to login
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={submit} className="space-y-7" noValidate>
                            {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

                            <section>
                                <h2 className="mb-4 flex items-center gap-2 text-[15px] font-bold text-slate-800">
                                    <Building2 className="h-5 w-5 text-accent" /> Company
                                </h2>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Field label="Company Name" required error={errors.company_name} className="sm:col-span-2">
                                        <IconInput icon={Building2} value={form.company_name} onChange={set('company_name')} placeholder="e.g. Acme Packaging Pvt Ltd" autoFocus />
                                    </Field>
                                    <Field label="Short Code" error={errors.short_code} hint="Optional. Used in your customers' portal link.">
                                        <IconInput icon={Hash} value={form.short_code} onChange={set('short_code')} placeholder="e.g. acme" />
                                    </Field>
                                    <Field label="Company Phone" error={errors.company_phone}>
                                        <IconInput icon={Phone} value={form.company_phone} onChange={set('company_phone')} placeholder="020 1234 5678" />
                                    </Field>
                                    <Field label="Company Email" error={errors.company_email} className="sm:col-span-2">
                                        <IconInput icon={Mail} type="email" value={form.company_email} onChange={set('company_email')} placeholder="info@company.com" />
                                    </Field>
                                    <Field label="Country" required error={errors.country} hint="Sets the timezone, currency, phone code and number format.">
                                        <Select value={form.country} onChange={(e) => pickCountry(e.target.value)}>
                                            {COUNTRIES.map((c) => (
                                                <option key={c} value={c}>
                                                    {c}
                                                </option>
                                            ))}
                                        </Select>
                                    </Field>
                                    <Field label="Timezone" error={errors.timezone} hint={profile ? `Currency: ${profile.currency} (${profile.symbol}) · Phone code: +${profile.phone_code || '—'}` : undefined}>
                                        <Select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                                            {timezones.map((z) => (
                                                <option key={z} value={z}>
                                                    {z.replace(/_/g, ' ')}
                                                </option>
                                            ))}
                                        </Select>
                                    </Field>
                                    {india ? (
                                        <>
                                            <Field label="GSTIN" error={errors.gstin ?? taxProblem(tax, form.gstin) ?? undefined} hint="Optional. 15 characters, printed on invoices.">
                                                <IconInput icon={ReceiptText} value={form.gstin} onChange={(e) => setGstin(e.target.value)} placeholder="27ABCDE1234F1Z5" maxLength={15} />
                                            </Field>
                                            <Field label="PAN" error={errors.pan} hint="Optional. Filled in from the GSTIN.">
                                                <IconInput icon={CreditCard} value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })} placeholder="ABCDE1234F" maxLength={10} />
                                            </Field>
                                        </>
                                    ) : (
                                        <Field label={`Tax number (${tax.label})`} error={errors.gstin ?? taxProblem(tax, form.gstin) ?? undefined} hint="Optional. Printed on invoices." className="sm:col-span-2">
                                            <IconInput icon={ReceiptText} value={form.gstin} onChange={(e) => setGstin(e.target.value)} placeholder={tax.example ?? ''} maxLength={50} />
                                        </Field>
                                    )}
                                    <Field label="Company Logo" error={errors.logo} hint="Optional. PNG or JPG, up to 2 MB. Shown in the app and on PDFs." className="sm:col-span-2">
                                        <div className="flex items-center gap-4">
                                            <div className="flex h-16 w-32 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50 p-1.5">
                                                {logoPreview ? <img src={logoPreview} alt="Logo preview" className="max-h-full max-w-full object-contain" /> : <ImagePlus className="h-5 w-5 text-slate-400" />}
                                            </div>
                                            <label className="cursor-pointer rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
                                                {logo ? 'Change' : 'Choose logo'}
                                                <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
                                            </label>
                                            {logo && (
                                                <button type="button" onClick={() => setLogo(null)} className="text-[13px] font-semibold text-slate-500 hover:text-red-600">
                                                    Remove
                                                </button>
                                            )}
                                        </div>
                                    </Field>
                                </div>
                            </section>

                            <section>
                                <h2 className="mb-1 flex items-center gap-2 text-[15px] font-bold text-slate-800">
                                    <Users className="h-5 w-5 text-accent" /> Administrator
                                </h2>
                                <p className="mb-4 text-xs text-slate-500">The first user of the company, with full access. They add the rest of the team.</p>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Field label="First Name" required error={errors.first_name}>
                                        <IconInput icon={UserRound} value={form.first_name} onChange={set('first_name')} />
                                    </Field>
                                    <Field label="Last Name" error={errors.last_name}>
                                        <IconInput icon={UserRound} value={form.last_name} onChange={set('last_name')} />
                                    </Field>
                                    <Field label="Email" required error={errors.email} hint="Used to log in and to reset the password.">
                                        <IconInput icon={Mail} type="email" value={form.email} onChange={set('email')} placeholder="you@company.com" />
                                    </Field>
                                    <Field label="Mobile" error={errors.mobile}>
                                        <IconInput icon={Phone} value={form.mobile} onChange={set('mobile')} placeholder="98765 43210" />
                                    </Field>
                                    <Field label="Username" error={errors.username} hint="Optional. You can also log in with the e-mail.">
                                        <IconInput icon={AtSign} value={form.username} onChange={set('username')} placeholder="e.g. admin.acme" />
                                    </Field>
                                    <div className="hidden sm:block" />
                                    <Field label="Password" required error={errors.password} hint="At least 8 characters.">
                                        <IconInput icon={KeyRound} type="password" value={form.password} onChange={set('password')} autoComplete="new-password" />
                                    </Field>
                                    <Field label="Confirm Password" required error={errors.password_confirmation}>
                                        <IconInput icon={KeyRound} type="password" value={form.password_confirmation} onChange={set('password_confirmation')} autoComplete="new-password" />
                                    </Field>
                                </div>
                            </section>

                            <div className="flex flex-col-reverse items-center justify-between gap-3 border-t border-slate-100 pt-5 sm:flex-row">
                                <p className="text-sm text-slate-500">
                                    Already have an account?{' '}
                                    <Link to="/login" className="font-semibold text-brand hover:underline">
                                        Log in
                                    </Link>
                                </p>
                                <button type="submit" disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white shadow-sm shadow-accent/30 transition hover:brightness-110 disabled:opacity-60 sm:w-auto">
                                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                                    Create company account
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
