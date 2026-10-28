import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, CheckCircle2, Eye, EyeOff, FolderKanban, KeyRound, LifeBuoy, Loader2, LockKeyhole, Mail, MailCheck, ReceiptText, ShieldCheck, ShoppingCart, Sparkles } from 'lucide-react';
import { BRAND, StackedBrandLogo } from '../components/brand/BrandLogo';
import { useAuth, type LoginResult } from '../auth/AuthContext';
import { api, errorMessage } from '../lib/api';

type SecondStep = Extract<LoginResult, { kind: 'second-step' }>;

const inputClass =
    'block w-full rounded-xl border border-gray-300 bg-white px-3.5 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[#0b2c56] focus:ring-4 focus:ring-[#0b2c56]/10 disabled:bg-gray-50';

const buttonClass =
    'flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0b2c56] to-[#1a4f8f] px-4 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-[#0b2c56]/25 transition hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-[#0b2c56]/25 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60';

const FEATURES = [
    { icon: FolderKanban, title: 'Projects & Tasks', text: 'Milestones, timers and timesheets for every team.' },
    { icon: ReceiptText, title: 'Sales', text: 'Proposals, estimates, invoices and payments.' },
    { icon: LifeBuoy, title: 'Leads & Support', text: 'Track leads and answer customer tickets.' },
    { icon: ShoppingCart, title: 'Purchase & Accounting', text: 'Vendors, bills, journal entries and reports.' },
];

export default function LoginPage() {
    const { user, login, verifyOtp } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const redirectTo = (location.state as { from?: string } | null)?.from ?? '/';

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [otp, setOtp] = useState('');
    const [secondStep, setSecondStep] = useState<SecondStep | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [forgot, setForgot] = useState(false);

    if (user) {
        return <Navigate to={redirectTo} replace />;
    }

    async function run(action: () => Promise<void>) {
        setBusy(true);
        setError(null);
        setNotice(null);
        try {
            await action();
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setBusy(false);
        }
    }

    function submitCredentials(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        // Browser autofill may not have reached React state yet: take the values from the form.
        const form = new FormData(event.currentTarget);
        const typedUser = String(form.get('username') ?? username).trim();
        const typedPassword = String(form.get('password') ?? password);
        if (!typedUser || !typedPassword) {
            setError('Enter your email or mobile number and password.');
            return;
        }
        setUsername(typedUser);
        setPassword(typedPassword);
        run(async () => {
            const result = await login(typedUser, typedPassword);
            if (result.kind === 'signed-in') {
                navigate(redirectTo, { replace: true });
            } else {
                setOtp('');
                setSecondStep(result);
            }
        });
    }

    function submitOtp(event: FormEvent) {
        event.preventDefault();
        run(async () => {
            await verifyOtp(username.trim(), otp.trim());
            navigate(redirectTo, { replace: true });
        });
    }

    // HRMS sends a fresh code whenever the password step is repeated.
    function resendCode() {
        run(async () => {
            const result = await login(username.trim(), password);
            if (result.kind === 'second-step') {
                setSecondStep(result);
                setNotice('A new code is on its way.');
            }
        });
    }

    function backToPassword() {
        setSecondStep(null);
        setOtp('');
        setError(null);
        setNotice(null);
    }

    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    return (
        <div className="min-h-screen bg-[#f4f6fa] lg:grid lg:grid-cols-[1.15fr_1fr]">
            {/* Brand side: the product at a glance */}
            <div className="login-brand relative hidden overflow-hidden text-white lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-14" style={{ background: `linear-gradient(155deg, ${BRAND.navy} 0%, #0f3566 45%, #1a4f8f 100%)` }}>
                <span className="login-grid pointer-events-none absolute inset-0" />
                <span className="login-blob pointer-events-none absolute -right-24 -top-28 h-96 w-96 rounded-full bg-[#2a78d6]/30 blur-3xl" />
                <span className="login-blob login-blob-2 pointer-events-none absolute -bottom-40 -left-24 h-[28rem] w-[28rem] rounded-full blur-3xl" style={{ background: 'rgba(250, 96, 16, 0.18)' }} />

                <div className="relative flex items-center gap-3">
                    <span className="inline-flex rounded-2xl bg-white px-4 py-3 shadow-lg shadow-black/10">
                        <StackedBrandLogo className="h-12" />
                    </span>
                </div>

                <div className="relative mt-10 grid items-center gap-12 2xl:grid-cols-[minmax(0,1fr)_320px] 2xl:gap-20">
                    <div>
                        <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[12px] font-semibold text-blue-100 ring-1 ring-white/15">
                            <Sparkles className="h-3.5 w-3.5 text-[#ffb48a]" /> One login with your HRMS
                        </p>
                        <h1 className="mt-5 text-[38px] font-extrabold leading-[1.1] tracking-tight xl:text-[44px]">
                            Run every project, sale and ticket
                            <span className="block bg-gradient-to-r from-[#ffb48a] to-[#fa6010] bg-clip-text text-transparent">from one place.</span>
                        </h1>
                        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-blue-100/80">Tasks and timers, invoices and payments, leads, support and team chat — with the same staff and permissions as GIC Folks HRMS.</p>
                        <div className="mt-7 flex max-w-lg flex-wrap gap-2">
                            {FEATURES.map(({ icon: Icon, title }) => (
                                <span key={title} className="inline-flex items-center gap-2 rounded-xl bg-white/[0.08] px-3 py-2 text-[13px] font-semibold ring-1 ring-white/10 backdrop-blur">
                                    <Icon className="h-4 w-4 text-[#ffb48a]" /> {title}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* A glimpse of the app: one tidy window, two notes pinned to its corners */}
                    <div className="relative mx-auto hidden w-[320px] 2xl:block" aria-hidden="true">
                        <div className="overflow-hidden rounded-2xl bg-white text-slate-800 shadow-2xl shadow-black/30 ring-1 ring-white/20">
                            <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                                <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                                <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                                <span className="ml-2 text-[11px] font-semibold text-slate-400">GIC Folks CRM</span>
                            </div>
                            <div className="p-4">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="text-[11px] font-semibold text-slate-400">Business pulse</p>
                                        <p className="text-[22px] font-extrabold leading-tight text-[#0b2c56]">₹4,82,500</p>
                                    </div>
                                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">▲ 18%</span>
                                </div>
                                <div className="mt-3 flex h-20 items-end gap-2 border-b border-slate-100 pb-px">
                                    {[38, 52, 44, 63, 58, 74, 66, 88].map((h, i) => (
                                        <span key={i} className="flex h-full flex-1 items-end gap-[2px]">
                                            <span className="w-full rounded-t-[3px] bg-[#2a78d6]" style={{ height: `${h}%` }} />
                                            <span className="w-full rounded-t-[3px] bg-[#eb6834]" style={{ height: `${h * 0.45}%` }} />
                                        </span>
                                    ))}
                                </div>
                                <div className="mt-1.5 flex justify-between text-[9.5px] font-medium text-slate-400">
                                    {['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'].map((m) => (
                                        <span key={m} className="flex-1 text-center">
                                            {m}
                                        </span>
                                    ))}
                                </div>

                                <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                                    <div className="flex items-center gap-2.5">
                                        <span className="h-8 w-1 shrink-0 rounded-full bg-[#fa6010]" />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-[13px] font-bold">Website redesign</p>
                                            <p className="text-[11px] text-slate-500">Due tomorrow · High</p>
                                        </div>
                                        <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-emerald-700">● 01:24:09</span>
                                    </div>
                                    <div className="mt-2.5 flex items-center gap-2">
                                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                                            <span className="block h-full w-[68%] rounded-full bg-[#0b2c56]" />
                                        </span>
                                        <span className="text-[10.5px] font-bold text-slate-500">68%</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="login-float absolute -right-8 -top-7 flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-slate-800 shadow-xl shadow-black/25">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#fff3ec] text-[#fa6010]">
                                <Bell className="h-3.5 w-3.5" />
                            </span>
                            <p className="text-[11.5px] font-semibold leading-tight">
                                New lead assigned
                                <span className="block text-[10.5px] font-normal text-slate-500">just now</span>
                            </p>
                        </div>
                        <div className="login-float login-float-2 absolute -bottom-10 -left-10 flex w-[230px] items-center gap-2.5 rounded-2xl rounded-bl-md bg-white px-3 py-2.5 text-slate-800 shadow-xl shadow-black/25">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0b2c56] text-[11px] font-bold text-white">AK</span>
                            <p className="min-w-0 text-[12px] leading-snug">
                                <b className="block text-[10.5px] text-[#fa6010]">Team chat</b>
                                Invoice sent to the client ✅
                            </p>
                        </div>
                    </div>
                </div>

                <p className="relative mt-10 text-xs text-blue-100/50">© {new Date().getFullYear()} Global Infocloud Private Limited</p>
            </div>

            {/* Form side */}
            <div className="relative flex min-h-screen flex-col">
                {/* Phones: a brand band above the form */}
                <div className="relative overflow-hidden px-6 pb-16 pt-10 text-center lg:hidden" style={{ background: `linear-gradient(155deg, ${BRAND.navy} 0%, #1a4f8f 100%)` }}>
                    <span className="login-grid pointer-events-none absolute inset-0" />
                    <span className="relative inline-flex rounded-2xl bg-white px-4 py-3 shadow-lg">
                        <StackedBrandLogo className="h-12" />
                    </span>
                    <p className="relative mt-4 text-[15px] font-semibold text-white">Projects, sales and support in one place.</p>
                </div>

                <div className="flex flex-1 items-start justify-center px-4 lg:items-center lg:px-10">
                    <div className="relative z-10 -mt-10 w-full max-w-[420px] rounded-3xl bg-white p-7 shadow-[0_20px_60px_-25px_rgba(11,44,86,0.35)] ring-1 ring-slate-200/70 sm:p-9 lg:mt-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:ring-0">
                    {forgot ? (
                        <ForgotPassword
                            initialEmail={username.includes('@') ? username.trim() : ''}
                            onCancel={() => (setForgot(false), setError(null))}
                            onDone={(email) => {
                                setForgot(false);
                                setUsername(email);
                                setPassword('');
                                setError(null);
                                setNotice('Your password was changed. Sign in with the new password.');
                            }}
                        />
                    ) : secondStep ? (
                        <form onSubmit={submitOtp} className="space-y-5" noValidate>
                            <button
                                type="button"
                                onClick={backToPassword}
                                className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800"
                            >
                                <ArrowLeft className="h-4 w-4" /> Back
                            </button>
                            <div>
                                <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                                    <ShieldCheck className="h-5 w-5" />
                                </span>
                                <h2 className="text-[26px] font-extrabold text-[#0b2c56]">Verify it's you</h2>
                                <p className="mt-2 text-sm text-gray-500">
                                    {secondStep.method === 'authenticator'
                                        ? 'Enter the 6-digit code from your authenticator app.'
                                        : `Enter the code we emailed${secondStep.emailHint ? ` to ${secondStep.emailHint}` : ''}.`}
                                </p>
                            </div>

                            <div>
                                <label htmlFor="otp" className="mb-1.5 block text-sm font-medium text-gray-700">
                                    Verification code
                                </label>
                                <input
                                    id="otp"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    autoFocus
                                    maxLength={10}
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value.replace(/\s/g, ''))}
                                    className={`${inputClass} text-center text-lg tracking-[0.4em]`}
                                    placeholder="••••••"
                                    disabled={busy}
                                />
                            </div>

                            <Messages error={error} notice={notice} />

                            <button type="submit" className={buttonClass} disabled={busy || otp.trim() === ''}>
                                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Verify and sign in
                            </button>

                            {secondStep.method === 'email' && (
                                <p className="text-center text-sm text-gray-500">
                                    Didn't get it?{' '}
                                    <button type="button" onClick={resendCode} disabled={busy} className="font-semibold text-blue-600 hover:text-blue-700">
                                        Send a new code
                                    </button>
                                </p>
                            )}
                        </form>
                    ) : (
                        <form onSubmit={submitCredentials} className="space-y-5" noValidate>
                            <div>
                                <p className="text-[13px] font-semibold text-[#fa6010]">{greeting} 👋</p>
                                <h2 className="mt-0.5 text-[28px] font-extrabold tracking-tight text-[#0b2c56]">Sign in to your CRM</h2>
                                <p className="mt-1.5 text-sm text-gray-500">Use your GIC Folks (HRMS) email or mobile number.</p>
                            </div>

                            <div>
                                <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-gray-700">
                                    Email or mobile
                                </label>
                                <div className="relative">
                                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                    <input
                                        id="username"
                                        name="username"
                                        autoComplete="username"
                                        autoFocus
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        className={`${inputClass} pl-10`}
                                        placeholder="you@company.com"
                                        disabled={busy}
                                    />
                                </div>
                            </div>

                            <div>
                                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-700">
                                    Password
                                </label>
                                <div className="relative">
                                    <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                    <input
                                        id="password"
                                        name="password"
                                        type={showPassword ? 'text' : 'password'}
                                        autoComplete="current-password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className={`${inputClass} px-10`}
                                        placeholder="••••••••"
                                        disabled={busy}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword((v) => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-700"
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    >
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                                <div className="mt-2 flex justify-end">
                                    <button type="button" onClick={() => (setForgot(true), setError(null), setNotice(null))} className="text-[13px] font-semibold text-[#fa6010] hover:text-[#d94e05] hover:underline">
                                        Forgot password?
                                    </button>
                                </div>
                            </div>

                            <Messages error={error} notice={notice} />

                            <button type="submit" className={buttonClass} disabled={busy}>
                                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Sign in
                            </button>

                        </form>
                    )}
                        <p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-gray-400">
                            <ShieldCheck className="h-3.5 w-3.5" /> Secured with your HRMS account
                        </p>
                    </div>
                </div>
                <p className="pb-6 text-center text-xs text-gray-400 lg:hidden">© {new Date().getFullYear()} Global Infocloud Private Limited</p>
            </div>
        </div>
    );
}

function Messages({ error, notice }: { error: string | null; notice: string | null }) {
    if (error) {
        return (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                {error}
            </p>
        );
    }

    if (notice) {
        return <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">{notice}</p>;
    }

    return null;
}

/**
 * "Forgot password?": HRMS's own reset, step by step — the work email gets a 6-digit code, the
 * code is checked, then the new password is set (HRMS's password rules apply).
 */
function ForgotPassword({ initialEmail, onCancel, onDone }: { initialEmail: string; onCancel: () => void; onDone: (email: string) => void }) {
    const [step, setStep] = useState<'email' | 'code' | 'password'>('email');
    const [email, setEmail] = useState(initialEmail);
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [show, setShow] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    async function run(action: () => Promise<void>) {
        setBusy(true);
        setError(null);
        setNotice(null);
        try {
            await action();
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setBusy(false);
        }
    }

    const sendCode = (event?: FormEvent) => {
        event?.preventDefault();
        if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
            setError('Enter the email address of your GIC Folks account.');
            return;
        }
        run(async () => {
            await api.post('/forgot-password/send-otp', { email: email.trim() });
            setCode('');
            setStep('code');
            setNotice(`If ${email.trim()} has an account, a 6-digit code is on its way. It works for 30 minutes.`);
        });
    };

    const checkCode = (event: FormEvent) => {
        event.preventDefault();
        run(async () => {
            await api.post('/forgot-password/verify-otp', { email: email.trim(), otp: code.trim() });
            setStep('password');
        });
    };

    const save = (event: FormEvent) => {
        event.preventDefault();
        if (password !== confirm) {
            setError('The two passwords do not match.');
            return;
        }
        run(async () => {
            await api.post('/forgot-password/reset', { email: email.trim(), password, password_confirmation: confirm });
            onDone(email.trim());
        });
    };

    const steps = ['Email', 'Code', 'New password'];
    const at = step === 'email' ? 0 : step === 'code' ? 1 : 2;

    return (
        <div className="space-y-5">
            <button type="button" onClick={onCancel} className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800">
                <ArrowLeft className="h-4 w-4" /> Back to sign in
            </button>
            <div>
                <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#fff3ec] text-[#fa6010]">
                    {step === 'email' ? <KeyRound className="h-5 w-5" /> : step === 'code' ? <MailCheck className="h-5 w-5" /> : <LockKeyhole className="h-5 w-5" />}
                </span>
                <h2 className="text-[26px] font-extrabold tracking-tight text-[#0b2c56]">{step === 'email' ? 'Reset your password' : step === 'code' ? 'Check your email' : 'Choose a new password'}</h2>
                <p className="mt-1.5 text-sm text-gray-500">
                    {step === 'email'
                        ? 'We will email a 6-digit code to the address of your GIC Folks (HRMS) account.'
                        : step === 'code'
                          ? `Enter the code sent to ${email.trim()}.`
                          : 'This changes your password for the CRM and GIC Folks HRMS.'}
                </p>
            </div>

            <ol className="flex items-center gap-2" aria-label="Steps">
                {steps.map((label, i) => (
                    <li key={label} className="flex flex-1 items-center gap-2">
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${i < at ? 'bg-emerald-500 text-white' : i === at ? 'bg-[#0b2c56] text-white' : 'bg-gray-200 text-gray-500'}`}>
                            {i < at ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                        </span>
                        <span className={`truncate text-[12px] font-semibold ${i === at ? 'text-[#0b2c56]' : 'text-gray-400'}`}>{label}</span>
                        {i < steps.length - 1 && <span className="h-px flex-1 bg-gray-200" />}
                    </li>
                ))}
            </ol>

            {step === 'email' && (
                <form onSubmit={sendCode} className="space-y-5" noValidate>
                    <div>
                        <label htmlFor="reset-email" className="mb-1.5 block text-sm font-medium text-gray-700">
                            Work email
                        </label>
                        <div className="relative">
                            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input id="reset-email" type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputClass} pl-10`} placeholder="you@company.com" disabled={busy} />
                        </div>
                    </div>
                    <Messages error={error} notice={notice} />
                    <button type="submit" className={buttonClass} disabled={busy}>
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send code
                    </button>
                </form>
            )}

            {step === 'code' && (
                <form onSubmit={checkCode} className="space-y-5" noValidate>
                    <div>
                        <label htmlFor="reset-code" className="mb-1.5 block text-sm font-medium text-gray-700">
                            6-digit code
                        </label>
                        <input
                            id="reset-code"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            autoFocus
                            maxLength={6}
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                            className={`${inputClass} text-center text-lg tracking-[0.5em]`}
                            placeholder="••••••"
                            disabled={busy}
                        />
                    </div>
                    <Messages error={error} notice={notice} />
                    <button type="submit" className={buttonClass} disabled={busy || code.length !== 6}>
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Verify code
                    </button>
                    <p className="text-center text-sm text-gray-500">
                        Didn't get it? Check spam, or{' '}
                        <button type="button" onClick={() => sendCode()} disabled={busy} className="font-semibold text-[#0b2c56] hover:underline">
                            send a new code
                        </button>
                    </p>
                </form>
            )}

            {step === 'password' && (
                <form onSubmit={save} className="space-y-5" noValidate>
                    <div>
                        <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-gray-700">
                            New password
                        </label>
                        <div className="relative">
                            <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input id="new-password" type={show ? 'text' : 'password'} autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputClass} px-10`} disabled={busy} />
                            <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-700" aria-label={show ? 'Hide password' : 'Show password'}>
                                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-gray-700">
                            Confirm new password
                        </label>
                        <div className="relative">
                            <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input id="confirm-password" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={`${inputClass} pl-10`} disabled={busy} />
                        </div>
                        {confirm && password !== confirm && <p className="mt-1.5 text-xs text-red-600">The passwords do not match yet.</p>}
                    </div>
                    <Messages error={error} notice={notice} />
                    <button type="submit" className={buttonClass} disabled={busy || password.length < 6 || password !== confirm}>
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save new password
                    </button>
                    <p className="text-center text-xs text-gray-400">At least 6 characters. Your company may ask for more (numbers, symbols).</p>
                </form>
            )}
        </div>
    );
}
