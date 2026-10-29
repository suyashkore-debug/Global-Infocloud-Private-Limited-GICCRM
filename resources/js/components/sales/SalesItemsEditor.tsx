import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { calculateTotals, emptyLine, money, SHOW_QUANTITY_AS, taxKey } from '../../lib/sales';
import type { Item, LineTax, SalesLine, Tax } from '../../types';
import { Input, inputClass, Select } from '../ui';

export interface MoneyFields {
    discount_type: 'before_tax' | 'after_tax' | null;
    discount_percent: number;
    discount_total: number;
    adjustment: number;
    show_quantity_as: number;
}

/**
 * Perfex sales items table: pick a saved item or type a line, taxes per line, then discount and
 * adjustment with live totals.
 */
export default function SalesItemsEditor({
    lines,
    onLines,
    moneyFields,
    onMoney,
    currency,
    error,
}: {
    lines: SalesLine[];
    onLines: (lines: SalesLine[]) => void;
    moneyFields: MoneyFields;
    onMoney: (fields: MoneyFields) => void;
    currency?: { symbol: string; placement: string } | null;
    error?: string;
}) {
    const [items, setItems] = useState<Item[]>([]);
    const [taxes, setTaxes] = useState<Tax[]>([]);
    const [discountMode, setDiscountMode] = useState<'percent' | 'fixed'>(moneyFields.discount_percent > 0 || !moneyFields.discount_total ? 'percent' : 'fixed');

    useEffect(() => {
        api.get<{ data: Item[] }>('/items', { params: { all: 1 } }).then((r) => setItems(r.data.data));
        api.get<{ data: Tax[] }>('/setup/taxes').then((r) => setTaxes(r.data.data));
    }, []);

    const totals = useMemo(
        () =>
            calculateTotals(
                lines,
                moneyFields.discount_type,
                discountMode === 'percent' ? Number(moneyFields.discount_percent || 0) : 0,
                discountMode === 'fixed' ? Number(moneyFields.discount_total || 0) : 0,
                Number(moneyFields.adjustment || 0),
            ),
        [lines, moneyFields, discountMode],
    );

    const update = (index: number, patch: Partial<SalesLine>) => onLines(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));

    function addItem(id: string) {
        const item = items.find((i) => i.id === Number(id));
        if (!item) {
            return;
        }
        const lineTaxes: LineTax[] = [item.tax, item.tax2].filter((t): t is Tax => !!t).map((t) => ({ tax_name: t.name, tax_rate: t.rate }));
        const next = { description: item.description, long_description: item.long_description ?? '', hsn_code: item.hsn_code ?? '', qty: 1, rate: item.rate, unit: item.unit ?? '', taxes: lineTaxes };
        // Replace a blank first line instead of leaving it empty.
        onLines(lines.length === 1 && !lines[0].description ? [next] : [...lines, next]);
    }

    const qtyLabel = SHOW_QUANTITY_AS.find((q) => q.id === moneyFields.show_quantity_as)?.name ?? 'Qty';

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <Select value="" onChange={(e) => addItem(e.target.value)} className="w-auto min-w-[16rem]">
                    <option value="">Add Item</option>
                    {items.map((item) => (
                        <option key={item.id} value={item.id}>
                            {item.description} — {money(item.rate, currency)}
                        </option>
                    ))}
                </Select>
                <div className="flex items-center gap-3 text-[13.5px]">
                    <span className="text-gray-600">Show quantity as:</span>
                    {SHOW_QUANTITY_AS.map((option) => (
                        <label key={option.id} className="flex items-center gap-1.5">
                            <input type="radio" checked={moneyFields.show_quantity_as === option.id} onChange={() => onMoney({ ...moneyFields, show_quantity_as: option.id })} />
                            {option.name}
                        </label>
                    ))}
                </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table data-nosort className="table-perfex">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="w-[34%]">Item</th>
                            <th className="w-28">HSN/SAC</th>
                            <th className="w-28">{qtyLabel}</th>
                            <th className="w-32">Rate</th>
                            <th className="w-44">Tax</th>
                            <th className="w-32 text-right">Amount</th>
                            <th className="w-10" />
                        </tr>
                    </thead>
                    <tbody>
                        {lines.map((line, index) => (
                            <tr key={index}>
                                <td>
                                    <textarea rows={1} value={line.description} onChange={(e) => update(index, { description: e.target.value })} placeholder="Description" className={inputClass} />
                                    <textarea rows={2} value={line.long_description ?? ''} onChange={(e) => update(index, { long_description: e.target.value })} placeholder="Long description" className={`${inputClass} mt-1.5`} />
                                </td>
                                <td>
                                    <input value={line.hsn_code ?? ''} onChange={(e) => update(index, { hsn_code: e.target.value })} className={inputClass} />
                                </td>
                                <td>
                                    <input type="number" min={0} step="any" value={line.qty} onChange={(e) => update(index, { qty: e.target.value })} className={inputClass} />
                                    <input value={line.unit ?? ''} onChange={(e) => update(index, { unit: e.target.value })} placeholder="Unit" className={`${inputClass} mt-1.5`} />
                                </td>
                                <td>
                                    <input type="number" step="any" value={line.rate} onChange={(e) => update(index, { rate: e.target.value })} className={inputClass} />
                                </td>
                                <td>
                                    <TaxPicker taxes={taxes} value={line.taxes} onChange={(lineTaxes) => update(index, { taxes: lineTaxes })} />
                                </td>
                                <td className="text-right font-medium">{money(Number(line.qty || 0) * Number(line.rate || 0), currency)}</td>
                                <td>
                                    <button type="button" onClick={() => onLines(lines.length > 1 ? lines.filter((_, i) => i !== index) : [emptyLine()])} className="mt-1.5 text-gray-400 hover:text-red-600" title="Remove">
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button type="button" onClick={() => onLines([...lines, emptyLine()])} className="inline-flex items-center gap-1.5 rounded-xl bg-brand-50 px-3 py-2 text-[13px] font-semibold text-brand ring-1 ring-brand-100 transition hover:bg-brand-100">
                <Plus className="h-4 w-4" /> Add new line
            </button>

            <div className="flex justify-end">
                <table className="w-full max-w-lg overflow-hidden rounded-2xl bg-slate-50/80 text-[13.5px] ring-1 ring-slate-200/70">
                    <tbody>
                        <tr>
                            <td className="px-4 pb-1.5 pt-3.5 text-right font-medium text-slate-600">Sub Total</td>
                            <td className="w-40 px-4 pb-1.5 pt-3.5 text-right font-semibold text-slate-800">{money(totals.subtotal, currency)}</td>
                        </tr>
                        <tr>
                            <td className="px-4 py-1.5 text-right">
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                    <span className="font-medium text-slate-600">Discount</span>
                                    <Select
                                        value={moneyFields.discount_type ?? ''}
                                        onChange={(e) => onMoney({ ...moneyFields, discount_type: (e.target.value || null) as MoneyFields['discount_type'] })}
                                        className="!w-36 !py-1.5 !text-[13px]"
                                    >
                                        <option value="">No discount</option>
                                        <option value="before_tax">Before Tax</option>
                                        <option value="after_tax">After Tax</option>
                                    </Select>
                                    <Input
                                        type="number"
                                        min={0}
                                        step="any"
                                        disabled={!moneyFields.discount_type}
                                        value={discountMode === 'percent' ? moneyFields.discount_percent : moneyFields.discount_total}
                                        onChange={(e) =>
                                            onMoney(
                                                discountMode === 'percent'
                                                    ? { ...moneyFields, discount_percent: Number(e.target.value), discount_total: 0 }
                                                    : { ...moneyFields, discount_total: Number(e.target.value), discount_percent: 0 },
                                            )
                                        }
                                        className="!w-24 !py-1.5 text-right !text-[13px]"
                                    />
                                    <span className="inline-flex rounded-xl bg-white p-0.5 ring-1 ring-slate-200" role="group" aria-label="Discount as">
                                        {(['percent', 'fixed'] as const).map((mode) => (
                                            <button
                                                key={mode}
                                                type="button"
                                                aria-pressed={discountMode === mode}
                                                onClick={() => {
                                                    if (mode !== discountMode) {
                                                        setDiscountMode(mode);
                                                        onMoney({ ...moneyFields, discount_percent: 0, discount_total: 0 });
                                                    }
                                                }}
                                                className={`rounded-lg px-2.5 py-1 text-[12px] font-bold transition ${discountMode === mode ? 'bg-brand text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                                            >
                                                {mode === 'percent' ? '%' : 'Fixed'}
                                            </button>
                                        ))}
                                    </span>
                                </div>
                            </td>
                            <td className="px-4 py-1.5 text-right font-semibold text-red-600">-{money(totals.discount, currency)}</td>
                        </tr>
                        {totals.taxes.map((tax) => (
                            <tr key={tax.key}>
                                <td className="px-4 py-1.5 text-right font-medium text-slate-600">
                                    {tax.name} ({tax.rate}%)
                                </td>
                                <td className="px-4 py-1.5 text-right font-semibold text-slate-800">{money(tax.amount, currency)}</td>
                            </tr>
                        ))}
                        <tr>
                            <td className="px-4 py-1.5 text-right">
                                <span className="inline-flex items-center gap-2">
                                    <span className="font-medium text-slate-600">Adjustment</span>
                                    <Input type="number" step="any" value={moneyFields.adjustment} onChange={(e) => onMoney({ ...moneyFields, adjustment: Number(e.target.value) })} className="!w-28 !py-1.5 text-right !text-[13px]" />
                                </span>
                            </td>
                            <td className="px-4 py-1.5 text-right font-semibold text-slate-800">{money(moneyFields.adjustment, currency)}</td>
                        </tr>
                        <tr className="border-t border-slate-200 bg-white">
                            <td className="px-4 py-3.5 text-right font-display text-[15px] font-bold text-slate-800">Total</td>
                            <td className="px-4 py-3.5 text-right font-display text-[18px] font-extrabold text-brand">{money(totals.total, currency)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function TaxPicker({ taxes, value, onChange }: { taxes: Tax[]; value: LineTax[]; onChange: (taxes: LineTax[]) => void }) {
    const [open, setOpen] = useState(false);
    const selected = new Set(value.map(taxKey));
    const label = value.length ? value.map((t) => `${t.tax_name} ${Number(t.tax_rate)}%`).join(', ') : 'No Tax';

    return (
        <div className="relative">
            <button type="button" onClick={() => setOpen(!open)} className={`${inputClass} flex items-center justify-between text-left`}>
                <span className="truncate">{label}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
                    <ul className="absolute z-30 mt-1 max-h-56 w-full min-w-[11rem] overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                        {taxes.length === 0 && <li className="px-3 py-2 text-xs text-gray-500">No taxes. Add them in Setup → Taxes.</li>}
                        {taxes.map((tax) => {
                            const line = { tax_name: tax.name, tax_rate: tax.rate };
                            const on = selected.has(taxKey(line));

                            return (
                                <li key={tax.id}>
                                    <button
                                        type="button"
                                        onClick={() => onChange(on ? value.filter((t) => taxKey(t) !== taxKey(line)) : [...value, line])}
                                        className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px] hover:bg-gray-50"
                                    >
                                        {tax.name} {Number(tax.rate)}%{on && <Check className="h-4 w-4 text-blue-600" />}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}
        </div>
    );
}
