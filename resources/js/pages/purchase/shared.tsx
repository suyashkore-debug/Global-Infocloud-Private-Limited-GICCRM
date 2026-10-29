import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { api } from '../../lib/api';
import { money } from '../../lib/sales';
import { Input, Select } from '../../components/ui';
import type { Item, Tax } from '../../types';

export type DocType = 'requests' | 'orders' | 'invoices';
export type CurrencyLite = { id?: number; symbol: string; placement: string; name?: string } | null;

export type Line = { item_id?: number | null; description: string; long_description?: string | null; unit?: string | null; qty: string; unit_price: string; tax_id?: string; tax_name?: string | null; tax_rate?: number };

export const PURCHASE_STATUSES: Record<number, { name: string; color: string }> = {
    1: { name: 'Draft', color: '#64748b' },
    2: { name: 'Approved', color: '#16a34a' },
    3: { name: 'Rejected', color: '#ea580c' },
    4: { name: 'Cancelled', color: '#dc2626' },
};

export const PAYMENT_STATUSES: Record<string, { name: string; color: string }> = {
    unpaid: { name: 'Unpaid', color: '#dc2626' },
    partially_paid: { name: 'Partially Paid', color: '#d97706' },
    paid: { name: 'Paid', color: '#16a34a' },
};

export const DELIVERY_STATUSES: Record<number, string> = { 0: 'Undelivered', 1: 'Completely delivered', 2: 'Partially delivered' };

export const TITLES: Record<DocType, { list: string; one: string; path: string }> = {
    requests: { list: 'Purchase Requests', one: 'Purchase Request', path: '/purchase/requests' },
    orders: { list: 'Purchase Orders', one: 'Purchase Order', path: '/purchase/orders' },
    invoices: { list: 'Purchase Invoices', one: 'Purchase Invoice', path: '/purchase/invoices' },
};

export function StatusPill({ status }: { status: { name: string; color: string } | undefined }) {
    if (!status) {
        return null;
    }

    return (
        <span className="rounded border px-1.5 py-px text-xs font-medium" style={{ color: status.color, borderColor: status.color }}>
            {status.name}
        </span>
    );
}

export const emptyLine = (): Line => ({ description: '', qty: '1', unit_price: '', tax_id: '' });

/** Line amounts as the server computes them (tax per line). */
export function lineTotals(lines: Line[], taxes: Tax[]) {
    let subtotal = 0;
    let tax = 0;
    for (const l of lines) {
        const amount = (Number(l.qty) || 0) * (Number(l.unit_price) || 0);
        const rate = l.tax_id ? Number(taxes.find((t) => String(t.id) === String(l.tax_id))?.rate ?? 0) : Number(l.tax_rate ?? 0);
        subtotal += amount;
        tax += Math.round(amount * rate) / 100;
    }

    return { subtotal: Math.round(subtotal * 100) / 100, tax: Math.round(tax * 100) / 100 };
}

/** Lines editor for purchase documents: pick an item or type a description; tax per line. */
export function PurchaseLines({ lines, onLines, taxes, currency }: { lines: Line[]; onLines: (lines: Line[]) => void; taxes: Tax[]; currency: CurrencyLite }) {
    const [items, setItems] = useState<Item[]>([]);

    useEffect(() => {
        api.get<{ data: Item[] }>('/items', { params: { per_page: 500 } }).then((r) => setItems(r.data.data)).catch(() => setItems([]));
    }, []);

    const update = (i: number, patch: Partial<Line>) => onLines(lines.map((l, li) => (li === i ? { ...l, ...patch } : l)));
    const pickItem = (id: string) => {
        const item = items.find((it) => String(it.id) === id);
        if (!item) {
            return;
        }
        const line: Line = { item_id: item.id, description: item.description, long_description: item.long_description, unit: item.unit, qty: '1', unit_price: String(item.rate ?? ''), tax_id: item.tax_id ? String(item.tax_id) : '' };
        onLines(lines.length === 1 && !lines[0].description ? [line] : [...lines, line]);
    };

    return (
        <div className="space-y-2">
            {items.length > 0 && (
                <Select value="" onChange={(e) => pickItem(e.target.value)} className="w-72">
                    <option value="">Add item…</option>
                    {items.map((it) => (
                        <option key={it.id} value={it.id}>
                            {it.description}
                        </option>
                    ))}
                </Select>
            )}
            <div className="-mx-4 overflow-x-auto px-4">
                <table data-nosort className="table-perfex min-w-[760px]">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th className="w-20">Unit</th>
                            <th className="w-24 text-right">Qty</th>
                            <th className="w-32 text-right">Unit Price</th>
                            <th className="w-40">Tax</th>
                            <th className="w-32 text-right">Amount</th>
                            <th className="w-8" />
                        </tr>
                    </thead>
                    <tbody>
                        {lines.map((l, i) => (
                            <tr key={i}>
                                <td>
                                    <Input value={l.description} onChange={(e) => update(i, { description: e.target.value })} placeholder="Description" />
                                    <Input value={l.long_description ?? ''} onChange={(e) => update(i, { long_description: e.target.value })} placeholder="Long description" className="mt-1 text-xs" />
                                </td>
                                <td>
                                    <Input value={l.unit ?? ''} onChange={(e) => update(i, { unit: e.target.value })} />
                                </td>
                                <td>
                                    <Input type="number" step="any" min={0} value={l.qty} onChange={(e) => update(i, { qty: e.target.value })} className="text-right" />
                                </td>
                                <td>
                                    <Input type="number" step="any" min={0} value={l.unit_price} onChange={(e) => update(i, { unit_price: e.target.value })} className="text-right" />
                                </td>
                                <td>
                                    <Select value={l.tax_id ?? ''} onChange={(e) => update(i, { tax_id: e.target.value })}>
                                        <option value="">{l.tax_name && !l.tax_id ? `${l.tax_name} ${l.tax_rate}%` : 'No tax'}</option>
                                        {taxes.map((t) => (
                                            <option key={t.id} value={t.id}>
                                                {t.name} {Number(t.rate)}%
                                            </option>
                                        ))}
                                    </Select>
                                </td>
                                <td className="text-right">{money((Number(l.qty) || 0) * (Number(l.unit_price) || 0), currency)}</td>
                                <td>
                                    <button type="button" onClick={() => onLines(lines.length > 1 ? lines.filter((_, li) => li !== i) : [emptyLine()])} className="text-gray-400 hover:text-red-600" title="Remove">
                                        <X className="h-4 w-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <button type="button" onClick={() => onLines([...lines, emptyLine()])} className="inline-flex items-center gap-1 text-[13.5px] font-medium text-blue-600 hover:underline">
                <Plus className="h-4 w-4" /> Add line
            </button>
        </div>
    );
}
