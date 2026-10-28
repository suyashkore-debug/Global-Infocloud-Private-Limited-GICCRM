import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Eye, EyeOff, FileText, FolderKanban, KeyRound, Loader2, LockKeyhole, Mail, MessagesSquare } from 'lucide-react';
import { BRAND, StackedBrandLogo } from '../components/brand/BrandLogo';
import { portalApi, portalBrandStore, portalError, portalToken, type PortalBrand } from './api';

const input =
    'block w-full rounded-xl border border-gray-300 bg-white py-3 pl-10 pr-3.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[#0b2c56] focus:ring-4 focus:ring-[#0b2c56]/10';
const button =
    'flex w-full items-center justify-center gap-2 rounded-xl bg-[#0b2c56] px-4 py-3 text-[15px] font-semibold text-white shadow-sm transition hover:bg-[#123d73] focus:outline-none focus:ring-4 focus:ring-[#0b2c56]/25 disabled:cursor-not-allowed disabled:opacity-60';

const FEATURES = [
    { icon: FileText, text: 'View and pay invoices, accept estimates and proposals' },
    { icon: FolderKanban, text: 'Follow your projects, tasks and files' },
    { icon: MessagesSquare, text: 'Open support tickets and reply to our team' },
];

/**
 * The company a customers-area link belongs to (?company=slug), remembered for the next visit.
 * Without one, the page carries the GIC Folks logo.
 */
function usePortalBrand(): PortalBrand | null {
    const [params] = useSearchParams();
    const slug = params.get('company');
    const [brand, setBrand] = useState<PortalBrand | null>(() => {
        const saved = portalBrandStore.get();
        return !slug || saved?.slug === slug.toLowerCase() ? saved : null;
    });

    useEffect(() => {
        if (!slug) {
            return;
        }
        portalApi
            .get<{ data: PortalBrand }>('/branding', { params: { company: slug } })
            .then((r) => (setBrand(r.data.data), portalBrandStore.set(r.data.data)))
            .catch(() => setBrand(null));
    }, [slug]);

    return brand;
}

/** Keeps ?company= on links between the login, forgot and set-password pages. */
function useCompanyQuery() {
    const [params] = useSearchParams();
    const slug = params.get('company');

    return slug ? `?company=${encodeURIComponent(slug)}` : '';
}

function CompanyLogo({ brand }: { brand: PortalBrand | null }) {
    const [failed, setFailed] = useState(false);

    if (brand?.logo_url && !failed) {
        return <img src={brand.logo_url} alt={brand.name} className="max-h-16 max-w-[220px] object-contain" onError={() => setFailed(true)} />;
    }
    if (brand) {
        return <span className="text-2xl font-extrabold text-[#0b2c56]">{brand.name}</span>;
    }

    return <StackedBrandLogo className="h-14" />;
}

/** Customers-area login frame: the company's logo, a short welcome, the form, "Powered by". */
function Shell({ icon: Icon, title, subtitle, children }: { icon: typeof LockKeyhole; title: string; subtitle: string; children: ReactNode }) {
    const brand = usePortalBrand();

    return (
        <div className="flex min-h-screen items-center justify-center px-4 py-10" style={{ background: 'radial-gradient(circle at 15% 10%, #e8eef8 0, transparent 45%), radial-gradient(circle at 90% 90%, #fff1e8 0, transparent 40%), #f4f6fa' }}>
            <div className="w-full max-w-5xl">
                <div className="grid overflow-hidden rounded-3xl bg-white shadow-[0_20px_60px_-20px_rgba(11,44,86,0.35)] lg:grid-cols-[1fr_1fr]">
                    {/* Company panel */}
                    <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-[#f7f9fc] to-[#eef3fa] p-10 lg:flex">
                        <span className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full border-[36px] border-[#0b2c56]/[0.04]" />
                        <span className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full border-[44px] border-[#fa6010]/[0.05]" />
                        <div className="relative">
                            <div className="inline-flex min-h-[88px] items-center rounded-2xl bg-white px-6 py-4 shadow-sm ring-1 ring-gray-900/5">
                                <CompanyLogo brand={brand} />
                            </div>
                            <p className="mt-10 text-[13px] font-bold uppercase tracking-[0.2em]" style={{ color: BRAND.orange }}>
                                Customer Portal
                            </p>
                            <h1 className="mt-2 text-[28px] font-extrabold leading-tight text-[#0b2c56]">
                                Welcome to {brand?.name ?? 'your'}
                                <span className="block">customer area.</span>
                            </h1>
                            <ul className="mt-8 space-y-4">
                                {FEATURES.map(({ icon: FeatureIcon, text }) => (
                                    <li key={text} className="flex items-center gap-3 text-[14px] text-gray-700">
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#0b2c56] shadow-sm ring-1 ring-gray-900/5">
                                            <FeatureIcon className="h-[18px] w-[18px]" />
                                        </span>
                                        {text}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    {/* Form panel */}
                    <div className="flex flex-col justify-center px-6 py-10 sm:px-12">
                        <div className="mb-8 lg:hidden">
                            <CompanyLogo brand={brand} />
                        </div>
                        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0b2c56]/5 text-[#0b2c56] ring-1 ring-[#0b2c56]/10">
                            <Icon className="h-5 w-5" />
                        </span>
                        <h2 className="text-[26px] font-extrabold text-[#0b2c56]">{title}</h2>
                        <p className="mb-6 mt-1.5 text-sm text-gray-500">{subtitle}</p>
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}

function Field({ icon: Icon, children }: { icon: typeof Mail; children: ReactNode }) {
    return (
        <div className="relative">
            <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            {children}
        </div>
    );
}

function Alert({ error, success }: { error?: string | null; success?: string | null }) {
    if (error) {
        return (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                {error}
            </p>
        );
    }

    return success ? (
        <p className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {success}
        </p>
    ) : null;
}

/** Perfex client login. */
export function PortalLoginPage() {
    const navigate = useNavigate();
    const query = useCompanyQuery();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [show, setShow] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function submit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        // Browser autofill may not have reached React state yet: take the values from the form.
        const form = new FormData(e.currentTarget);
        const typedEmail = String(form.get('email') ?? email).trim();
        const typedPassword = String(form.get('password') ?? password);
        setBusy(true);
        setError(null);
        try {
            const r = await portalApi.post<{ data: { token: string; contact: { company: PortalBrand | null } } }>('/login', { email: typedEmail, password: typedPassword });
            portalToken.set(r.data.data.token);
            portalBrandStore.set(r.data.data.contact.company);
            navigate('/portal');
        } catch (err) {
            setError(portalError(err));
        } finally {
            setBusy(false);
        }
    }

    return (
        <Shell icon={LockKeyhole} title="Welcome back" subtitle="Log in to your customer account.">
            <form onSubmit={submit} className="space-y-4">
                <div>
                    <label htmlFor="portal-email" className="mb-1.5 block text-sm font-medium text-gray-700">
                        Email address
                    </label>
                    <Field icon={Mail}>
                        <input id="portal-email" name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className={input} autoComplete="email" autoFocus />
                    </Field>
                </div>
                <div>
                    <div className="mb-1.5 flex items-center justify-between">
                        <label htmlFor="portal-password" className="block text-sm font-medium text-gray-700">
                            Password
                        </label>
                        <Link to={`/portal/forgot-password${query}`} className="text-[13px] font-medium text-[#0b2c56] hover:underline">
                            Forgot password?
                        </Link>
                    </div>
                    <Field icon={LockKeyhole}>
                        <input
                            id="portal-password"
                            name="password"
                            type={show ? 'text' : 'password'}
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className={`${input} pr-10`}
                            autoComplete="current-password"
                        />
                        <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-700" aria-label={show ? 'Hide password' : 'Show password'}>
                            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                    </Field>
                </div>
                <Alert error={error} />
                <button type="submit" disabled={busy} className={button}>
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />} Log in
                </button>
                <p className="text-center text-[13px] text-gray-500">No password yet? Ask us to send you an invitation, or use "Forgot password?".</p>
            </form>
        </Shell>
    );
}

export function PortalForgotPage() {
    const query = useCompanyQuery();
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function submit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setBusy(true);
        try {
            const r = await portalApi.post<{ message: string }>('/forgot-password', { email });
            setMessage(r.data.message);
        } catch (err) {
            setError(portalError(err));
        } finally {
            setBusy(false);
        }
    }

    return (
        <Shell icon={KeyRound} title="Forgot password" subtitle="We'll e-mail you a link to choose a new password.">
            {message ? (
                <Alert success={message} />
            ) : (
                <form onSubmit={submit} className="space-y-4">
                    <Field icon={Mail}>
                        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className={input} autoComplete="email" autoFocus />
                    </Field>
                    <Alert error={error} />
                    <button type="submit" disabled={busy} className={button}>
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send reset link
                    </button>
                </form>
            )}
            <Link to={`/portal/login${query}`} className="mt-5 block text-center text-[13px] font-medium text-[#0b2c56] hover:underline">
                ← Back to login
            </Link>
        </Shell>
    );
}

/** From the e-mailed link: choose a (new) password. */
export function PortalSetPasswordPage() {
    const { token } = useParams();
    const query = useCompanyQuery();
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function submit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setBusy(true);
        try {
            const r = await portalApi.post<{ message: string }>('/reset-password', { token, password, password_confirmation: confirm });
            setMessage(r.data.message);
        } catch (err) {
            setError(portalError(err));
        } finally {
            setBusy(false);
        }
    }

    return (
        <Shell icon={KeyRound} title="Set your password" subtitle="Choose a password of at least 8 characters.">
            {message ? (
                <div className="space-y-4">
                    <Alert success={message} />
                    <Link to={`/portal/login${query}`} className={button}>
                        Go to login
                    </Link>
                </div>
            ) : (
                <form onSubmit={submit} className="space-y-4">
                    <Field icon={LockKeyhole}>
                        <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" className={input} autoComplete="new-password" autoFocus />
                    </Field>
                    <Field icon={LockKeyhole}>
                        <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password" className={input} autoComplete="new-password" />
                    </Field>
                    <Alert error={error} />
                    <button type="submit" disabled={busy} className={button}>
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Set password
                    </button>
                </form>
            )}
        </Shell>
    );
}
