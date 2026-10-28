import { createContext, useContext, useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, Menu as MenuIcon } from 'lucide-react';
import { portalApi, portalBrandStore, portalToken, type PortalContact } from './api';
import PortalChat from './PortalChat';

const ContactContext = createContext<{ contact: PortalContact; reload: () => void } | null>(null);

export function useContact() {
    return useContext(ContactContext)!;
}

/** Perfex customers area frame: top menu with the company's name and the contact's menu. */
export default function PortalLayout() {
    const navigate = useNavigate();
    const [contact, setContact] = useState<PortalContact | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const [logoFailed, setLogoFailed] = useState(false);
    const hasToken = !!portalToken.get();

    const load = () => {
        portalApi.get<{ data: PortalContact }>('/me').then((r) => setContact(r.data.data)).catch(() => undefined);
    };

    useEffect(() => {
        if (hasToken) {
            load();
        }
    }, [hasToken]);

    if (!hasToken) {
        const brand = portalBrandStore.get();
        return <Navigate to={brand ? `/portal/login?company=${encodeURIComponent(brand.slug)}` : '/portal/login'} replace />;
    }
    if (!contact) {
        return <p className="p-8 text-center text-gray-400">Loading…</p>;
    }

    const can = (p: string) => contact.permissions.includes(p);
    const items = [
        { to: '/portal', label: 'Dashboard', show: true, end: true },
        { to: '/portal/projects', label: 'Projects', show: can('projects') },
        { to: '/portal/invoices', label: 'Invoices', show: can('invoices') },
        { to: '/portal/estimates', label: 'Estimates', show: can('estimates') },
        { to: '/portal/proposals', label: 'Proposals', show: can('proposals') },
        { to: '/portal/contracts', label: 'Contracts', show: can('contracts') },
        { to: '/portal/tickets', label: 'Support', show: can('support') },
        { to: '/portal/knowledge-base', label: 'Knowledge Base', show: contact.knowledge_base_enabled },
    ].filter((i) => i.show);

    async function logout() {
        await portalApi.post('/logout').catch(() => undefined);
        portalToken.set(null);
        navigate(contact?.company ? `/portal/login?company=${encodeURIComponent(contact.company.slug)}` : '/portal/login');
    }

    return (
        <ContactContext.Provider value={{ contact, reload: load }}>
            <div className="min-h-screen bg-page">
                <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 shadow-[0_1px_2px_rgba(16,24,40,0.04)] backdrop-blur">
                    <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
                        <Link to="/portal" className="mr-2 flex max-w-[16rem] shrink-0 items-center truncate text-lg font-semibold text-gray-900" title={contact.company_name}>
                            {contact.company?.logo_url && !logoFailed ? (
                                <img src={contact.company.logo_url} alt={contact.company_name} className="max-h-10 max-w-[200px] object-contain" onError={() => setLogoFailed(true)} />
                            ) : (
                                contact.company_name
                            )}
                        </Link>
                        <nav className="hidden min-w-0 flex-1 gap-0.5 overflow-x-auto md:flex">
                            {items.map((i) => (
                                <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => `whitespace-nowrap rounded-lg px-3 py-2 text-[13.5px] font-semibold transition ${isActive ? 'bg-brand-50 text-brand' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}>
                                    {i.label}
                                </NavLink>
                            ))}
                        </nav>
                        <button type="button" onClick={() => setMenuOpen(!menuOpen)} className="ml-auto rounded-md p-2 text-gray-600 md:hidden" aria-label="Menu">
                            <MenuIcon className="h-5 w-5" />
                        </button>
                        <div className="relative hidden md:block">
                            <button type="button" onClick={() => setProfileOpen(!profileOpen)} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full py-1 pl-1 pr-2.5 text-[13.5px] font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
                                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-[12px] font-bold text-white">{contact.first_name?.[0]}</span>
                                {contact.first_name} {contact.last_name} <ChevronDown className="h-4 w-4" />
                            </button>
                            {profileOpen && (
                                <div className="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-1 shadow-xl" onClick={() => setProfileOpen(false)}>
                                    <Link to="/portal/profile" className="block rounded-lg px-3 py-2 text-[13px] text-slate-700 hover:bg-slate-100">
                                        Profile
                                    </Link>
                                    <Link to="/portal/company" className="block rounded-lg px-3 py-2 text-[13px] text-slate-700 hover:bg-slate-100">
                                        Company
                                    </Link>
                                    {can('invoices') && (
                                        <Link to="/portal/statement" className="block rounded-lg px-3 py-2 text-[13px] text-slate-700 hover:bg-slate-100">
                                            Statement
                                        </Link>
                                    )}
                                    <button type="button" onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] text-red-600 hover:bg-red-50">
                                        <LogOut className="h-4 w-4" /> Logout
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                    {menuOpen && (
                        <nav className="border-t border-gray-100 px-4 py-2 md:hidden" onClick={() => setMenuOpen(false)}>
                            {[...items, { to: '/portal/profile', label: 'Profile' }, { to: '/portal/company', label: 'Company' }].map((i) => (
                                <Link key={i.to} to={i.to} className="block py-2 text-[14px] text-gray-700">
                                    {i.label}
                                </Link>
                            ))}
                            <button type="button" onClick={logout} className="py-2 text-[14px] text-red-600">
                                Logout
                            </button>
                        </nav>
                    )}
                </header>
                <main className="mx-auto max-w-7xl px-4 py-6">
                    <Outlet />
                </main>
                {contact.chat_enabled && <PortalChat companyName={contact.company_name} />}
            </div>
        </ContactContext.Provider>
    );
}
