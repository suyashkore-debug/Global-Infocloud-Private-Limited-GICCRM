import type { LineTax, SalesLine } from '../types';

export const INVOICE_STATUSES = [
    { id: 1, name: 'Unpaid', color: '#dc2626' },
    { id: 2, name: 'Paid', color: '#16a34a' },
    { id: 3, name: 'Partially Paid', color: '#d97706' },
    { id: 4, name: 'Overdue', color: '#ea580c' },
    { id: 5, name: 'Cancelled', color: '#6b7280' },
    { id: 6, name: 'Draft', color: '#6b7280' },
];

export const SHOW_QUANTITY_AS = [
    { id: 1, name: 'Qty' },
    { id: 2, name: 'Hours' },
    { id: 3, name: 'Qty/Hours' },
];

export interface Totals {
    subtotal: number;
    taxes: { key: string; name: string; rate: number; amount: number }[];
    totalTax: number;
    discount: number;
    total: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Same formula as the server (App\Services\SalesCalculator, Perfex calculate_total): tax per line,
 * percent or fixed discount before / after tax, then the adjustment.
 */
export function calculateTotals(lines: SalesLine[], discountType: string | null, discountPercent: number, discountFixed: number, adjustment: number): Totals {
    let subtotal = 0;
    const taxes = new Map<string, { name: string; rate: number; amount: number }>();

    for (const line of lines) {
        const amount = round(Number(line.qty || 0) * Number(line.rate || 0));
        subtotal += amount;
        for (const tax of line.taxes) {
            const rate = Number(tax.tax_rate);
            if (!rate) {
                continue;
            }
            const key = `${tax.tax_name}|${rate}`;
            const current = taxes.get(key) ?? { name: tax.tax_name, rate, amount: 0 };
            current.amount += (amount / 100) * rate;
            taxes.set(key, current);
        }
    }

    const usePercent = discountPercent > 0;
    const useFixed = !usePercent && discountFixed > 0;
    let discount = 0;

    if (discountType === 'before_tax') {
        if (usePercent) {
            discount = (subtotal * discountPercent) / 100;
            taxes.forEach((t) => (t.amount -= (t.amount * discountPercent) / 100));
        } else if (useFixed && subtotal > 0) {
            discount = discountFixed;
            const share = (discountFixed / subtotal) * 100;
            taxes.forEach((t) => (t.amount -= (t.amount * share) / 100));
        }
    }

    const totalTax = [...taxes.values()].reduce((sum, t) => sum + t.amount, 0);
    let total = subtotal + totalTax;
    if (discountType === 'after_tax') {
        discount = usePercent ? (total * discountPercent) / 100 : useFixed ? discountFixed : 0;
    }
    total = total - discount + adjustment;

    return {
        subtotal: round(subtotal),
        taxes: [...taxes.entries()].map(([key, t]) => ({ key, name: t.name, rate: t.rate, amount: round(t.amount) })),
        totalTax: round(totalTax),
        discount: round(discount),
        total: round(total),
    };
}

export function money(value: number | string | null | undefined, currency?: { symbol: string; placement: string } | null): string {
    const formatted = Number(value ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const symbol = currency?.symbol ?? '₹';

    return currency?.placement === 'after' ? `${formatted} ${symbol}` : `${symbol}${formatted}`;
}

export function taxKey(tax: LineTax): string {
    return `${tax.tax_name}|${Number(tax.tax_rate)}`;
}

export function emptyLine(): SalesLine {
    return { description: '', long_description: '', hsn_code: '', qty: 1, rate: 0, unit: '', taxes: [] };
}

export const ESTIMATE_STATUSES = [
    { id: 1, name: 'Draft', color: '#6b7280' },
    { id: 2, name: 'Sent', color: '#2563eb' },
    { id: 3, name: 'Declined', color: '#dc2626' },
    { id: 4, name: 'Accepted', color: '#16a34a' },
    { id: 5, name: 'Expired', color: '#ea580c' },
];

export const PROPOSAL_STATUSES = [
    { id: 6, name: 'Draft', color: '#6b7280' },
    { id: 4, name: 'Sent', color: '#2563eb' },
    { id: 1, name: 'Open', color: '#0284c7' },
    { id: 5, name: 'Revised', color: '#d97706' },
    { id: 2, name: 'Declined', color: '#dc2626' },
    { id: 3, name: 'Accepted', color: '#16a34a' },
];

export const CREDIT_NOTE_STATUSES = [
    { id: 1, name: 'Open', color: '#0284c7' },
    { id: 2, name: 'Closed', color: '#16a34a' },
    { id: 3, name: 'Void', color: '#6b7280' },
];
