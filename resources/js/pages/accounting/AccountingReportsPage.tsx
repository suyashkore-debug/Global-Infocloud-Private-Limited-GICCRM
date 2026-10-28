import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatDate, toIsoDate } from '../../lib/format';
import { money } from '../../lib/sales';
import { useApi } from '../../hooks/useApi';
import { Input, Select, Spinner, Tabs } from '../../components/ui';
import { REL_LABELS, useAccounts } from './shared';

type Section = { accounts: { id: number; name: string; amount: number; type?: string }[]; total: number };
type Report = 'profit-and-loss' | 'balance-sheet' | 'trial-balance' | 'general-ledger' | 'journal';
const TABS: { id: Report; label: string }[] = [
    { id: 'profit-and-loss', label: 'Profit and Loss' },
    { id: 'balance-sheet', label: 'Balance Sheet' },
    { id: 'trial-balance', label: 'Trial Balance' },
    { id: 'general-ledger', label: 'General Ledger' },
    { id: 'journal', label: 'Journal' },
];

/** Perfex Accounting → Reports (the main ones). */
export default function AccountingReportsPage() {
    const now = new Date();
    // Indian financial year: 1 April – 31 March.
    const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const [tab, setTab] = useState<Report>('profit-and-loss');
    const [from, setFrom] = useState(`${fyStart}-04-01`);
    const [to, setTo] = useState(toIsoDate(now));
    const [accountId, setAccountId] = useState('');
    const accounts = useAccounts();
    const asOf = tab === 'balance-sheet' || tab === 'trial-balance';

    return (
        <div className="w-full space-y-4">
            <h4 className="page-title">Accounting Reports</h4>
            <Tabs tabs={TABS} active={tab} onChange={setTab} />
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
                {!asOf && (
                    <>
                        From <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
                    </>
                )}
                {asOf ? 'As of' : 'To'} <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" />
                {tab === 'general-ledger' && (
                    <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-64">
                        <option value="">All accounts</option>
                        {(accounts.data?.data ?? []).map((a) => (
                            <option key={a.id} value={a.id}>
                                {a.name}
                            </option>
                        ))}
                    </Select>
                )}
            </div>
            <div className="panel_s">
                <div className="panel-body text-[13.5px]">
                    {/* Keyed by tab so a report never renders another report's data while loading. */}
                    <ReportLoader key={tab} tab={tab} params={asOf ? { as_of: to } : { from, to, account_id: tab === 'general-ledger' ? accountId || undefined : undefined }} />
                </div>
            </div>
        </div>
    );
}

function ReportLoader({ tab, params }: { tab: Report; params: Record<string, string | undefined> }) {
    const { data } = useApi<{ data: unknown }>(`/accounting/reports/${tab}`, params);
    return !data ? <Spinner /> : <ReportBody tab={tab} data={data.data} />;
}

function ReportBody({ tab, data }: { tab: Report; data: unknown }) {
    if (tab === 'profit-and-loss') {
        const d = data as Record<string, Section | number>;
        return (
            <table className="table-perfex">
                <tbody>
                    <SectionRows title="Income" section={d.income as Section} />
                    <SectionRows title="Cost of Sales" section={d.cost_of_sales as Section} />
                    <Total label="Gross Profit" value={d.gross_profit as number} />
                    <SectionRows title="Expenses" section={d.expenses as Section} />
                    <Total label="Net Operating Income" value={d.net_operating_income as number} />
                    <SectionRows title="Other Income" section={d.other_income as Section} />
                    <SectionRows title="Other Expenses" section={d.other_expenses as Section} />
                    <Total label="Net Income" value={d.net_income as number} strong />
                </tbody>
            </table>
        );
    }
    if (tab === 'balance-sheet') {
        const d = data as Record<string, Section | number>;
        return (
            <table className="table-perfex">
                <tbody>
                    <SectionRows title="Assets" section={d.assets as Section} />
                    <SectionRows title="Liabilities" section={d.liabilities as Section} />
                    <SectionRows title="Equity" section={d.equity as Section} hideTotal />
                    <Row label="Retained Earnings" value={d.retained_earnings as number} />
                    <Row label="Net Income" value={d.net_income as number} />
                    <Total label="Total Equity" value={d.total_equity as number} />
                    <Total label="Total Liabilities and Equity" value={d.total_liabilities_and_equity as number} strong />
                </tbody>
            </table>
        );
    }
    if (tab === 'trial-balance') {
        const d = data as { rows: { id: number; number: string | null; name: string; type: string; debit: number; credit: number }[]; debit: number; credit: number };
        return (
            <table className="table-perfex">
                <thead>
                    <tr>
                        <th>Account</th>
                        <th>Type</th>
                        <th className="text-right">Debit</th>
                        <th className="text-right">Credit</th>
                    </tr>
                </thead>
                <tbody>
                    {d.rows.map((r) => (
                        <tr key={r.id}>
                            <td>
                                <Link to={`/accounting/accounts/${r.id}`} className="text-blue-600 hover:underline">
                                    {r.number ? `${r.number} - ` : ''}
                                    {r.name}
                                </Link>
                            </td>
                            <td className="text-gray-600">{r.type}</td>
                            <td className="text-right">{r.debit ? money(r.debit) : ''}</td>
                            <td className="text-right">{r.credit ? money(r.credit) : ''}</td>
                        </tr>
                    ))}
                    <tr className="font-semibold">
                        <td colSpan={2}>Total</td>
                        <td className="text-right">{money(d.debit)}</td>
                        <td className="text-right">{money(d.credit)}</td>
                    </tr>
                </tbody>
            </table>
        );
    }
    if (tab === 'general-ledger') {
        const d = data as { account: { id: number; name: string }; opening: number; closing: number; lines: { date: string; description: string | null; rel_type: string; debit: number; credit: number; balance: number }[] }[];
        if (!d.length) {
            return <p className="text-gray-500">No transactions in this period.</p>;
        }
        return (
            <table className="table-perfex">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Description</th>
                        <th className="text-right">Debit</th>
                        <th className="text-right">Credit</th>
                        <th className="text-right">Balance</th>
                    </tr>
                </thead>
                {d.map((a) => (
                    <tbody key={a.account.id}>
                        <tr className="bg-gray-50 font-semibold">
                            <td colSpan={5}>{a.account.name}</td>
                            <td className="text-right">{money(a.opening)}</td>
                        </tr>
                        {a.lines.map((l, i) => (
                            <tr key={i}>
                                <td className="whitespace-nowrap">{formatDate(l.date)}</td>
                                <td>{REL_LABELS[l.rel_type] ?? l.rel_type}</td>
                                <td>{l.description}</td>
                                <td className="text-right">{l.debit ? money(l.debit) : ''}</td>
                                <td className="text-right">{l.credit ? money(l.credit) : ''}</td>
                                <td className="text-right">{money(l.balance)}</td>
                            </tr>
                        ))}
                    </tbody>
                ))}
            </table>
        );
    }
    const d = data as { id: number; number: number; journal_date: string; description: string | null; amount: number; lines: { account: string; debit: number; credit: number }[] }[];
    if (!d.length) {
        return <p className="text-gray-500">No journal entries in this period.</p>;
    }
    return (
        <table className="table-perfex">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>#</th>
                    <th>Account</th>
                    <th className="text-right">Debit</th>
                    <th className="text-right">Credit</th>
                </tr>
            </thead>
            {d.map((j) => (
                <tbody key={j.id}>
                    {j.lines.map((l, i) => (
                        <tr key={i}>
                            <td>{i === 0 ? formatDate(j.journal_date) : ''}</td>
                            <td>{i === 0 ? j.number : ''}</td>
                            <td>{l.account}</td>
                            <td className="text-right">{l.debit ? money(l.debit) : ''}</td>
                            <td className="text-right">{l.credit ? money(l.credit) : ''}</td>
                        </tr>
                    ))}
                </tbody>
            ))}
        </table>
    );
}

function SectionRows({ title, section, hideTotal }: { title: string; section: Section; hideTotal?: boolean }) {
    return (
        <>
            <tr className="bg-gray-50">
                <td colSpan={2} className="font-semibold">
                    {title}
                </td>
            </tr>
            {section.accounts.map((a) => (
                <tr key={a.id}>
                    <td className="pl-6">
                        <Link to={`/accounting/accounts/${a.id}`} className="text-blue-600 hover:underline">
                            {a.name}
                        </Link>
                    </td>
                    <td className="text-right">{money(a.amount)}</td>
                </tr>
            ))}
            {section.accounts.length === 0 && (
                <tr>
                    <td colSpan={2} className="pl-6 text-gray-400">
                        —
                    </td>
                </tr>
            )}
            {!hideTotal && <Total label={`Total ${title}`} value={section.total} />}
        </>
    );
}

function Row({ label, value }: { label: string; value: number }): ReactNode {
    return (
        <tr>
            <td className="pl-6">{label}</td>
            <td className="text-right">{money(value)}</td>
        </tr>
    );
}

function Total({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
    return (
        <tr className={strong ? 'bg-gray-100 font-bold' : 'font-semibold'}>
            <td>{label}</td>
            <td className={`text-right ${value < 0 ? 'text-red-600' : ''}`}>{money(value)}</td>
        </tr>
    );
}
