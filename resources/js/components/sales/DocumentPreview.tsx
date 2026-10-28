import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { money } from '../../lib/sales';
import type { Address, SalesDocumentBase } from '../../types';
import { CustomFieldsView, type FieldTo } from '../customfields/CustomFields';

/**
 * The on-screen version of a sales document (what the PDF shows): who it is for, dates, lines,
 * totals, notes.
 */
export default function DocumentPreview({
    document,
    to,
    info,
    extraTotals,
    notes,
    customFields,
}: {
    document: SalesDocumentBase & { billing?: Address; shipping?: Address; include_shipping?: boolean; show_shipping?: boolean; client_note?: string | null; terms?: string | null; admin_note?: string | null };
    to?: ReactNode;
    info: [string, ReactNode][];
    extraTotals?: [string, string, boolean?][];
    notes?: ReactNode;
    /** Show this record's custom fields (Perfex lists them with the document). */
    customFields?: { to: FieldTo; id: number };
}) {
    const cur = document.currency;
    const taxSummary = new Map<string, number>();
    for (const item of document.items ?? []) {
        for (const t of item.taxes) {
            const key = `${t.tax_name} (${Number(t.tax_rate)}%)`;
            taxSummary.set(key, (taxSummary.get(key) ?? 0) + (Number(item.qty) * Number(item.rate) * Number(t.tax_rate)) / 100);
        }
    }
    if (document.discount_type === 'before_tax' && Number(document.subtotal) > 0) {
        const share = Number(document.discount_total) / Number(document.subtotal);
        taxSummary.forEach((v, k) => taxSummary.set(k, v - v * share));
    }

    return (
        <div className="panel_s">
            <div className="panel-body space-y-6 text-[13.5px]">
                <div className="flex flex-wrap justify-between gap-6">
                    <div>
                        {to ?? (
                            <>
                                <p className="font-semibold text-gray-800">Bill To:</p>
                                <Link to={`/customers/${document.customer?.id}`} className="font-semibold">
                                    {document.customer?.name}
                                </Link>
                                {document.billing && <AddressLines address={document.billing} />}
                                {document.customer?.vat && <p>GSTIN: {document.customer.vat}</p>}
                                {document.include_shipping && document.show_shipping && document.shipping && (
                                    <div className="mt-3">
                                        <p className="font-semibold text-gray-800">Ship To:</p>
                                        <AddressLines address={document.shipping} />
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                    <div className="space-y-0.5 text-right">
                        {info
                            .filter(([, v]) => v)
                            .map(([label, value]) => (
                                <p key={label}>
                                    <span className="text-gray-500">{label}:</span> {value}
                                </p>
                            ))}
                    </div>
                </div>

                {(document.items?.length ?? 0) > 0 && (
                    <>
                        <div className="overflow-x-auto">
                            <table className="table-perfex">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th>#</th>
                                        <th>Item</th>
                                        <th className="text-right">{['Qty', 'Hours', 'Qty/Hours'][document.show_quantity_as - 1]}</th>
                                        <th className="text-right">Rate</th>
                                        <th className="text-right">Tax</th>
                                        <th className="text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {document.items?.map((item, i) => (
                                        <tr key={item.id ?? i}>
                                            <td>{i + 1}</td>
                                            <td>
                                                <p className="font-medium">{item.description}</p>
                                                {item.long_description && <p className="whitespace-pre-wrap text-gray-500">{item.long_description}</p>}
                                                {item.hsn_code && <p className="text-xs text-gray-500">HSN/SAC: {item.hsn_code}</p>}
                                            </td>
                                            <td className="text-right">
                                                {Number(item.qty)} {item.unit}
                                            </td>
                                            <td className="text-right">{Number(item.rate).toFixed(2)}</td>
                                            <td className="text-right">{item.taxes.map((t) => `${t.tax_name} ${Number(t.tax_rate)}%`).join(', ') || '0%'}</td>
                                            <td className="text-right">{(Number(item.qty) * Number(item.rate)).toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex justify-end">
                            <table className="w-full max-w-sm">
                                <tbody>
                                    <Row label="Sub Total" value={money(document.subtotal, cur)} />
                                    {Number(document.discount_total) > 0 && (
                                        <Row label={`Discount${Number(document.discount_percent) > 0 ? ` (${Number(document.discount_percent)}%)` : ''}`} value={`-${money(document.discount_total, cur)}`} />
                                    )}
                                    {[...taxSummary.entries()].map(([name, amount]) => (
                                        <Row key={name} label={name} value={money(amount, cur)} />
                                    ))}
                                    {Number(document.adjustment) !== 0 && <Row label="Adjustment" value={money(document.adjustment, cur)} />}
                                    <Row label="Total" value={money(document.total, cur)} strong />
                                    {extraTotals?.map(([label, value, danger]) => (
                                        <Row key={label} label={label} value={value} strong={danger} danger={danger} />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {notes}
                {document.client_note && (
                    <div>
                        <p className="font-semibold">Note:</p>
                        <p className="whitespace-pre-wrap text-gray-600">{document.client_note}</p>
                    </div>
                )}
                {document.terms && (
                    <div>
                        <p className="font-semibold">Terms & Conditions:</p>
                        <p className="whitespace-pre-wrap text-gray-600">{document.terms}</p>
                    </div>
                )}
                {customFields && <CustomFieldsView to={customFields.to} id={customFields.id} />}
                {document.admin_note && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                        <p className="font-semibold">Admin Note (only staff see this):</p>
                        <p className="whitespace-pre-wrap">{document.admin_note}</p>
                    </div>
                )}
            </div>
        </div>
    );
}

export function AddressLines({ address }: { address: Address }) {
    return (
        <div className="text-gray-600">
            {address.street && <p className="whitespace-pre-wrap">{address.street}</p>}
            <p>{[address.city, address.state].filter(Boolean).join(', ')}</p>
            <p>{[address.country, address.zip].filter(Boolean).join(' ')}</p>
        </div>
    );
}

function Row({ label, value, strong, danger }: { label: string; value: string; strong?: boolean; danger?: boolean }) {
    return (
        <tr className={strong ? 'border-t border-gray-200' : ''}>
            <td className={`py-1.5 text-right ${strong ? 'font-semibold' : 'font-medium'} ${danger ? 'text-red-600' : ''}`}>{label}</td>
            <td className={`w-40 py-1.5 text-right ${strong ? 'font-semibold' : ''} ${danger ? 'text-red-600' : ''}`}>{value}</td>
        </tr>
    );
}
