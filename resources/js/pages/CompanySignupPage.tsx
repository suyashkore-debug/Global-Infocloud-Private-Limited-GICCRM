import { useEffect, useMemo, useState, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    ArrowRight,
    AtSign,
    Building2,
    Check,
    CheckCircle2,
    Clock3,
    CreditCard,
    Eye,
    EyeOff,
    Globe2,
    Hash,
    ImagePlus,
    KeyRound,
    Loader2,
    LockKeyhole,
    LogIn,
    Mail,
    Phone,
    ReceiptText,
    ShieldCheck,
    Sparkles,
    UploadCloud,
    UserRound,
    UserPlus,
    Users,
    Wallet,
    type LucideIcon,
} from 'lucide-react';
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

/** How the account gets going, shown on the brand side. */
const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
    { icon: Building2, title: 'Create your company', text: 'Name, country and the first admin: about two minutes.' },
    { icon: LogIn, title: 'Log in', text: 'With your e-mail or username and the password you chose.' },
    { icon: UserPlus, title: 'Add your team', text: 'Setup → Staff Members, with their own permissions.' },
];

/** 0–4: length, upper and lower case, a digit, a symbol. */
function passwordScore(p: string): number {
    if (!p) {
        return 0;
    }
    let score = p.length >= 8 ? 1 : 0;
    score += /[a-z]/.test(p) && /[A-Z]/.test(p) ? 1 : 0;
    score += /\d/.test(p) ? 1 : 0;
    score += /[^A-Za-z0-9]/.test(p) || p.length >= 12 ? 1 : 0;

    return score;
}
const STRENGTH = [
    { label: 'Too short', color: '#ef4444' },
    { label: 'Weak', color: '#f97316' },
    { label: 'Fair', color: '#eab308' },
    { label: 'Good', color: '#22c55e' },
    { label: 'Strong', color: '#15803d' },
];

/** A numbered step of the form: its number (a tick once filled in), title and hint. */
function Step({ n, done, icon: Icon, title, hint, children }: { n: number; done: boolean; icon: LucideIcon; title: string; hint: string; children: ReactNode }) {
    return (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-6">
            <div className="mb-5 flex items-start gap-3.5">
                <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[15px] font-extrabold transition ${done ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30' : 'bg-[#0b2c56] text-white shadow-md shadow-[#0b2c56]/25'}`}
                >
                    {done ? <Check className="h-5 w-5" /> : n}
                </span>
                <div className="min-w-0">
                    <h2 className="flex items-center gap-2 text-[16px] font-bold text-slate-900">
                        <Icon className="h-[18px] w-[18px] text-accent" /> {title}
                    </h2>
                    <p className="mt-0.5 text-[12.5px] text-slate-500">{hint}</p>
                </div>
            </div>
            {children}
        </section>
    );
}

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
    const [showPassword, setShowPassword] = useState(false);
    const [dropping, setDropping] = useState(false);
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

    // The local time in the chosen timezone, for the workspace preview.
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 30_000);
        return () => clearInterval(timer);
    }, []);
    const localTime = useMemo(() => {
        try {
            return new Intl.DateTimeFormat(profile?.locale ?? 'en-IN', { hour: '2-digit', minute: '2-digit', timeZone: form.timezone }).format(now);
        } catch {
            return '';
        }
    }, [now, form.timezone, profile?.locale]);

    const score = passwordScore(form.password);
    const mismatch = form.password_confirmation !== '' && form.password_confirmation !== form.password;
    const companyDone = form.company_name.trim() !== '';
    const placeDone = companyDone && form.country !== '';
    const adminDone = form.first_name.trim() !== '' && /\S+@\S+\.\S+/.test(form.email) && form.password.length >= 8 && form.password === form.password_confirmation;
    const progress = [companyDone, placeDone, adminDone].filter(Boolean).length;

    const pickLogo = (file: File | undefined | null) => {
        if (file && /^image\/(png|jpe?g)$/.test(file.type)) {
            setLogo(file);
        }
    };
    const drop = (e: DragEvent) => {
        e.preventDefault();
        setDropping(false);
        pickLogo(e.dataTransfer.files?.[0]);
    };

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
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
            const data = (err as { response?: { data?: { errors?: Record<string, string[]> } } }).response?.data;
            if (data?.errors) {
                setErrors(Object.fromEntries(Object.entries(data.errors).map(([k, v]) => [k, v[0]])));
                setError('Please check the highlighted fields.');
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                setError(errorMessage(err));
            }
        } finally {
            setSaving(false);
        }
    }

    const initial = (form.company_name.trim() || 'Y').charAt(0).toUpperCase();

    // What the company's workspace will look like: updates as the form is filled in.
    const preview = (
        <div className="overflow-hidden rounded-2xl bg-white text-slate-800 shadow-2xl shadow-black/30 ring-1 ring-white/20">
            <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                <span className="ml-2 truncate text-[11px] font-semibold text-slate-400">Your workspace preview</span>
            </div>
            <div className="p-4">
                <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-[#fa6010] to-[#ff8a4c] text-lg font-extrabold text-white shadow-md shadow-[#fa6010]/30">
                        {logoPreview ? <img src={logoPreview} alt="" className="h-full w-full bg-white object-contain p-1" /> : initial}
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-[15px] font-extrabold text-[#0b2c56]">{form.company_name.trim() || 'Your Company'}</p>
                        <p className="truncate text-[11.5px] text-slate-500">{form.short_code ? `portal: …/portal/login?company=${form.short_code.toLowerCase()}` : 'GIC Folks CRM workspace'}</p>
                    </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                    {[
                        { icon: Globe2, label: 'Country', value: form.country },
                        { icon: Wallet, label: 'Currency', value: profile ? `${profile.currency} ${profile.symbol !== profile.currency ? profile.symbol : ''}`.trim() : '—' },
                        { icon: Clock3, label: 'Local time', value: localTime || '—' },
                    ].map(({ icon: Icon, label, value }) => (
                        <div key={label} className="min-w-0 rounded-xl bg-slate-50 px-2.5 py-2 ring-1 ring-inset ring-slate-100">
                            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                <Icon className="h-3 w-3" /> {label}
                            </p>
                            <p className="mt-0.5 truncate text-[12.5px] font-bold text-slate-700">{value}</p>
                        </div>
                    ))}
                </div>
                <div className="mt-3 flex items-center justify-between rounded-xl border border-dashed border-slate-200 px-3 py-2">
                    <span className="flex min-w-0 items-center gap-2 text-[12px] text-slate-500">
                        <ReceiptText className="h-3.5 w-3.5 shrink-0 text-[#fa6010]" />
                        <span className="truncate">
                            {tax.label}: <b className="font-semibold text-slate-700">{form.gstin || 'not added yet'}</b>
                        </span>
                    </span>
                    {profile?.phone_code && <span className="shrink-0 rounded-full bg-[#0b2c56]/5 px-2 py-0.5 text-[11px] font-bold text-[#0b2c56]">+{profile.phone_code}</span>}
                </div>
                <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-[#0b2c56]/[0.04] px-3 py-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0b2c56] text-[11px] font-bold text-white">
                        {`${form.first_name.charAt(0)}${form.last_name.charAt(0)}`.toUpperCase() || <UserRound className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-bold text-slate-800">{`${form.first_name} ${form.last_name}`.trim() || 'Administrator'}</p>
                        <p className="truncate text-[11px] text-slate-500">{form.email || 'you@company.com'} · Full access</p>
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#f4f6fa] lg:grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
            {/* Brand side: what you get, and the workspace taking shape as you type */}
            <aside
                className="login-brand relative hidden overflow-hidden text-white lg:sticky lg:top-0 lg:block lg:h-screen lg:h-dvh"
                style={{ background: `linear-gradient(155deg, ${BRAND.navy} 0%, #0f3566 45%, #1a4f8f 100%)` }}
            >
                <span className="login-grid pointer-events-none absolute inset-0" />
                <span className="login-blob pointer-events-none absolute -right-24 -top-28 h-96 w-96 rounded-full bg-[#2a78d6]/30 blur-3xl" />
                <span className="login-blob login-blob-2 pointer-events-none absolute -bottom-40 -left-24 h-[28rem] w-[28rem] rounded-full blur-3xl" style={{ background: 'rgba(250, 96, 16, 0.18)' }} />

                <div className="scrollbar-none relative flex h-full flex-col justify-between overflow-y-auto p-10 xl:p-14 [@media(max-height:820px)]:p-8">
                <Link to="/login" className="relative inline-flex self-start rounded-2xl bg-white px-4 py-3 shadow-lg shadow-black/10">
                    <StackedBrandLogo className="h-11 [@media(max-height:820px)]:h-8" />
                </Link>

                <div className="relative my-8 [@media(max-height:820px)]:my-5">
                    <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[12px] font-semibold text-blue-100 ring-1 ring-white/15">
                        <Sparkles className="h-3.5 w-3.5 text-[#ffb48a]" /> New company account
                    </p>
                    <h1 className="mt-4 text-[34px] font-extrabold leading-[1.1] tracking-tight xl:text-[40px] [@media(max-height:820px)]:mt-3 [@media(max-height:820px)]:text-[30px]">
                        Your business,
                        <span className="block bg-gradient-to-r from-[#ffb48a] to-[#fa6010] bg-clip-text text-transparent">set up in minutes.</span>
                    </h1>
                    <p className="mt-3 max-w-md text-[14.5px] leading-relaxed text-blue-100/80 [@media(max-height:680px)]:hidden">Leads, sales, projects, support and your team, in one CRM set up for your country.</p>

                    <div className="relative mt-7 max-w-[380px] [@media(max-height:820px)]:mt-5">{preview}</div>
                </div>

                <div className="relative">
                    <ol className="grid gap-3 xl:grid-cols-3 [@media(max-height:820px)]:hidden">
                        {STEPS.map(({ icon: Icon, title, text }, i) => (
                            <li key={title} className="rounded-xl bg-white/[0.07] p-3 ring-1 ring-white/10 backdrop-blur">
                                <span className="flex items-center gap-2 text-[13px] font-bold">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#fa6010] text-[11px]">{i + 1}</span>
                                    <Icon className="h-4 w-4 text-[#ffb48a]" /> {title}
                                </span>
                                <span className="mt-1 block text-[11.5px] leading-snug text-blue-100/65">{text}</span>
                            </li>
                        ))}
                    </ol>
                    <p className="mt-5 flex items-center gap-2 text-[12px] text-blue-100/60 [@media(max-height:820px)]:mt-0">
                        <ShieldCheck className="h-4 w-4 text-emerald-300" /> Your company's data is visible only to your company.
                    </p>
                </div>
                </div>
            </aside>

            {/* Form side */}
            <main className="relative min-w-0">
                {/* Phones and tablets: a brand band above the form */}
                <div className="relative overflow-hidden px-6 pb-20 pt-9 text-center text-white lg:hidden" style={{ background: `linear-gradient(155deg, ${BRAND.navy} 0%, #1a4f8f 100%)` }}>
                    <span className="login-grid pointer-events-none absolute inset-0" />
                    <span className="relative inline-flex rounded-2xl bg-white px-4 py-3 shadow-lg">
                        <StackedBrandLogo className="h-11" />
                    </span>
                    <h1 className="relative mt-5 text-[26px] font-extrabold leading-tight tracking-tight">
                        Your business, <span className="bg-gradient-to-r from-[#ffb48a] to-[#fa6010] bg-clip-text text-transparent">set up in minutes.</span>
                    </h1>
                    <p className="relative mt-2 text-[14px] text-blue-100/80">Create your company account and its first admin.</p>
                </div>

                <div className="relative mx-auto -mt-12 w-full max-w-[760px] px-4 pb-14 sm:px-6 lg:mt-0 lg:px-10 lg:pb-12 lg:pt-0 xl:px-14">
                    {done ? (
                        <div className="fade-in overflow-hidden rounded-3xl bg-white text-center lg:mt-12 shadow-[0_20px_60px_-25px_rgba(11,44,86,0.35)] ring-1 ring-slate-200/70">
                            <div className="relative px-6 pb-8 pt-10" style={{ background: 'linear-gradient(180deg, #ecfdf5 0%, #ffffff 100%)' }}>
                                <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xl shadow-emerald-500/30 ring-8 ring-emerald-100">
                                    <CheckCircle2 className="h-10 w-10" />
                                </span>
                                <h2 className="mt-6 text-[24px] font-extrabold text-slate-900">{done.message}</h2>
                                <p className="mx-auto mt-2 max-w-md text-[14px] text-slate-500">
                                    Welcome aboard, <b className="text-slate-800">{form.company_name}</b>! Log in with <b className="text-slate-800">{done.username}</b> and the password you chose.
                                </p>
                            </div>
                            <div className="grid gap-3 border-t border-slate-100 px-6 py-6 text-left sm:grid-cols-3">
                                {STEPS.map(({ icon: Icon, title, text }, i) => (
                                    <div key={title} className={`rounded-2xl p-3.5 ring-1 ring-inset ${i === 0 ? 'bg-emerald-50 ring-emerald-100' : 'bg-slate-50 ring-slate-100'}`}>
                                        <span className="flex items-center gap-2 text-[13px] font-bold text-slate-800">
                                            {i === 0 ? <Check className="h-4 w-4 text-emerald-600" /> : <Icon className="h-4 w-4 text-accent" />} {title}
                                        </span>
                                        <span className="mt-1 block text-[12px] leading-snug text-slate-500">{i === 0 ? 'Done.' : text}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="px-6 pb-8">
                                <button
                                    type="button"
                                    onClick={() => navigate('/login')}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0b2c56] to-[#1a4f8f] px-7 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-[#0b2c56]/25 transition hover:brightness-110"
                                >
                                    Go to login <ArrowRight className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={submit} className="space-y-5" noValidate>
                            {/* Heading and how far along the form is */}
                            <div className="rounded-3xl bg-white p-5 shadow-[0_20px_60px_-25px_rgba(11,44,86,0.35)] ring-1 ring-slate-200/70 sm:p-6 lg:sticky lg:top-0 lg:z-20 lg:rounded-none lg:bg-[#f4f6fa]/95 lg:px-0 lg:pb-5 lg:pt-10 lg:shadow-none lg:ring-0 lg:backdrop-blur-md">
                                <div className="flex flex-wrap items-end justify-between gap-3">
                                    <div>
                                        <h2 className="text-[20px] font-extrabold tracking-tight text-[#0b2c56] sm:text-[28px]">Create your company account</h2>
                                        <p className="mt-1 text-[13.5px] text-slate-500">
                                            Already have one?{' '}
                                            <Link to="/login" className="font-semibold text-accent hover:underline">
                                                Log in
                                            </Link>
                                        </p>
                                    </div>
                                    <span className="rounded-full bg-[#0b2c56]/5 px-3 py-1 text-[12px] font-bold text-[#0b2c56]">{progress} of 3 done</span>
                                </div>
                                <div className="mt-4 flex gap-1.5">
                                    {[0, 1, 2].map((i) => (
                                        <span key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                                            <span className="block h-full rounded-full bg-gradient-to-r from-[#fa6010] to-[#ff8a4c] transition-all duration-500" style={{ width: i < progress ? '100%' : '0%' }} />
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-200">{error}</p>}

                            <Step n={1} done={companyDone} icon={Building2} title="Your company" hint="How your company appears in the CRM, on PDFs and in e-mails.">
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Field label="Company Name" required error={errors.company_name} className="sm:col-span-2">
                                        <IconInput icon={Building2} value={form.company_name} onChange={set('company_name')} placeholder="e.g. Acme Packaging Pvt Ltd" autoFocus />
                                    </Field>
                                    <Field label="Company Email" error={errors.company_email}>
                                        <IconInput icon={Mail} type="email" value={form.company_email} onChange={set('company_email')} placeholder="info@company.com" />
                                    </Field>
                                    <Field label="Company Phone" error={errors.company_phone}>
                                        <IconInput icon={Phone} value={form.company_phone} onChange={set('company_phone')} placeholder="020 1234 5678" />
                                    </Field>
                                    <Field label="Short Code" error={errors.short_code} hint="Optional. Used in your customers' portal link." className="sm:col-span-2">
                                        <IconInput icon={Hash} value={form.short_code} onChange={set('short_code')} placeholder="e.g. acme" />
                                    </Field>
                                    <div className="sm:col-span-2">
                                        <span className="mb-1.5 block text-[12.5px] font-semibold text-slate-600">Company Logo</span>
                                        <label
                                            onDragOver={(e) => (e.preventDefault(), setDropping(true))}
                                            onDragLeave={() => setDropping(false)}
                                            onDrop={drop}
                                            className={`flex cursor-pointer items-center gap-4 rounded-2xl border-2 border-dashed p-4 transition ${dropping ? 'border-accent bg-accent-50' : 'border-slate-200 bg-slate-50/60 hover:border-slate-300 hover:bg-slate-50'}`}
                                        >
                                            <span className="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1.5 ring-1 ring-slate-200">
                                                {logoPreview ? <img src={logoPreview} alt="Logo preview" className="max-h-full max-w-full object-contain" /> : <ImagePlus className="h-6 w-6 text-slate-300" />}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-slate-700">
                                                    <UploadCloud className="h-4 w-4 text-accent" /> {logo ? logo.name : 'Drop your logo here, or click to choose'}
                                                </span>
                                                <span className="mt-0.5 block text-[12px] text-slate-500">Optional. PNG or JPG, up to 2 MB. Shown in the app and on PDFs.</span>
                                            </span>
                                            {logo && (
                                                <button type="button" onClick={(e) => (e.preventDefault(), setLogo(null))} className="shrink-0 rounded-lg px-2 py-1 text-[12.5px] font-semibold text-slate-500 hover:bg-red-50 hover:text-red-600">
                                                    Remove
                                                </button>
                                            )}
                                            <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => pickLogo(e.target.files?.[0])} />
                                        </label>
                                        {errors.logo && <p className="mt-1 text-xs text-red-600">{errors.logo}</p>}
                                    </div>
                                </div>
                            </Step>

                            <Step n={2} done={placeDone} icon={Globe2} title="Country & tax" hint="Sets your timezone, currency, phone code, date format and tax number.">
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Field label="Country" required error={errors.country}>
                                        <Select value={form.country} onChange={(e) => pickCountry(e.target.value)}>
                                            {COUNTRIES.map((c) => (
                                                <option key={c} value={c}>
                                                    {c}
                                                </option>
                                            ))}
                                        </Select>
                                    </Field>
                                    <Field label="Timezone" error={errors.timezone}>
                                        <Select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                                            {timezones.map((z) => (
                                                <option key={z} value={z}>
                                                    {z.replace(/_/g, ' ')}
                                                </option>
                                            ))}
                                        </Select>
                                    </Field>
                                    {profile && (
                                        <div className="flex flex-wrap gap-2 sm:col-span-2">
                                            {[
                                                { icon: Wallet, text: `Currency ${profile.currency}${profile.symbol !== profile.currency ? ` (${profile.symbol})` : ''}` },
                                                { icon: Phone, text: `Phone code +${profile.phone_code || '—'}` },
                                                { icon: Clock3, text: `Local time ${localTime}` },
                                                { icon: ReceiptText, text: `Tax number: ${tax.label}` },
                                            ].map(({ icon: Icon, text }) => (
                                                <span key={text} className="inline-flex items-center gap-1.5 rounded-full bg-[#0b2c56]/[0.05] px-3 py-1 text-[12px] font-semibold text-[#0b2c56] ring-1 ring-inset ring-[#0b2c56]/10">
                                                    <Icon className="h-3.5 w-3.5 text-accent" /> {text}
                                                </span>
                                            ))}
                                        </div>
                                    )}
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
                                </div>
                            </Step>

                            <Step n={3} done={adminDone} icon={Users} title="Administrator" hint="The first user, with full access. They add the rest of the team after logging in.">
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Field label="First Name" required error={errors.first_name}>
                                        <IconInput icon={UserRound} value={form.first_name} onChange={set('first_name')} placeholder="e.g. Asha" />
                                    </Field>
                                    <Field label="Last Name" error={errors.last_name}>
                                        <IconInput icon={UserRound} value={form.last_name} onChange={set('last_name')} placeholder="e.g. Rao" />
                                    </Field>
                                    <Field label="Email" required error={errors.email} hint="Used to log in and to reset the password.">
                                        <IconInput icon={Mail} type="email" value={form.email} onChange={set('email')} placeholder="you@company.com" autoComplete="email" />
                                    </Field>
                                    <Field label="Mobile" error={errors.mobile}>
                                        <IconInput icon={Phone} value={form.mobile} onChange={set('mobile')} placeholder={profile?.phone_code ? `+${profile.phone_code} …` : '98765 43210'} />
                                    </Field>
                                    <Field label="Username" error={errors.username} hint="Optional. You can also log in with the e-mail." className="sm:col-span-2">
                                        <IconInput icon={AtSign} value={form.username} onChange={set('username')} placeholder="e.g. admin.acme" autoComplete="username" />
                                    </Field>
                                    <Field label="Password" required error={errors.password}>
                                        <div className="relative">
                                            <IconInput
                                                icon={KeyRound}
                                                type={showPassword ? 'text' : 'password'}
                                                value={form.password}
                                                onChange={set('password')}
                                                autoComplete="new-password"
                                                placeholder="At least 8 characters"
                                                className="pr-10"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword((s) => !s)}
                                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                                                className="absolute right-2 top-1/2 z-[1] -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                            >
                                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </button>
                                        </div>
                                        {form.password && (
                                            <div className="mt-2 flex items-center gap-2">
                                                <span className="flex flex-1 gap-1">
                                                    {[1, 2, 3, 4].map((i) => (
                                                        <span key={i} className="h-1 flex-1 rounded-full transition-colors" style={{ backgroundColor: i <= score ? STRENGTH[score].color : '#e2e8f0' }} />
                                                    ))}
                                                </span>
                                                <span className="text-[11.5px] font-semibold" style={{ color: STRENGTH[score].color }}>
                                                    {STRENGTH[score].label}
                                                </span>
                                            </div>
                                        )}
                                    </Field>
                                    <Field label="Confirm Password" required error={errors.password_confirmation ?? (mismatch ? "Passwords don't match yet." : undefined)}>
                                        <IconInput
                                            icon={form.password_confirmation && !mismatch ? Check : KeyRound}
                                            type={showPassword ? 'text' : 'password'}
                                            value={form.password_confirmation}
                                            onChange={set('password_confirmation')}
                                            autoComplete="new-password"
                                            placeholder="Type it again"
                                        />
                                    </Field>
                                </div>
                            </Step>

                            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:flex-row sm:items-center sm:justify-between sm:p-5">
                                <p className="flex items-center gap-2 text-[12.5px] text-slate-500">
                                    <LockKeyhole className="h-4 w-4 shrink-0 text-emerald-600" /> Your company's data is private: no other company can see it.
                                </p>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#fa6010] to-[#ff7a2f] px-7 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-[#fa6010]/30 transition hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-[#fa6010]/25 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                                >
                                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                                    Create company account
                                    {!saving && <ArrowRight className="h-4 w-4" />}
                                </button>
                            </div>
                            <p className="text-center text-[12px] text-slate-400">© {new Date().getFullYear()} Global Infocloud Private Limited</p>
                        </form>
                    )}
                </div>
            </main>
        </div>
    );
}
