<?php

use App\Models\Currency;
use App\Models\Proposal;
use App\Models\SalesItem;
use App\Services\Options;
use App\Support\MoneyFormat;

it('writes amounts the Indian way, with the currency\'s own separators', function () {
    $inr = new Currency(['name' => 'INR', 'symbol' => '₹', 'decimal_separator' => '.', 'thousand_separator' => ',', 'placement' => 'before']);
    $eur = new Currency(['name' => 'EUR', 'symbol' => '€', 'decimal_separator' => ',', 'thousand_separator' => '.', 'placement' => 'after']);

    expect(MoneyFormat::money(1234567.5, $inr))->toBe('₹12,34,567.50')
        ->and(MoneyFormat::money(123456, $inr))->toBe('₹1,23,456.00')
        ->and(MoneyFormat::money(999, $inr))->toBe('₹999.00')
        ->and(MoneyFormat::money(-25000.75, $inr))->toBe('-₹25,000.75')
        ->and(MoneyFormat::money(1234567.5, $eur))->toBe('1.234.567,50 €')
        ->and(MoneyFormat::words(10.5, $eur))->toBe('EUR Ten and Cents Fifty Only')
        ->and(MoneyFormat::words(10, $inr))->toStartWith('Rupees');
});

/** The sales PDF's HTML for a document (no dompdf needed). */
function salesPdfHtml(Proposal $document, int $companyId): string
{
    return view('pdf.sales', [
        'document' => $document, 'heading' => 'PROPOSAL', 'number' => 'PRO-1', 'status' => ['Open', '#000000'],
        'billTo' => ['name' => 'Acme', 'lines' => []], 'infoRows' => [], 'options' => Options::all($companyId),
        'companyName' => 'GIC', 'logo' => null,
    ])->render();
}

it('leaves out 0% tax rows, and the items table when there are no items', function () {
    $admin = companyAdmin();
    $currency = Currency::create(['company_id' => $admin->company_id, 'name' => 'INR', 'symbol' => '₹', 'decimal_separator' => '.', 'thousand_separator' => ',', 'is_default' => true]);

    $proposal = new Proposal(['company_id' => $admin->company_id, 'subtotal' => 150000, 'total' => 150000, 'total_tax' => 0, 'adjustment' => 0, 'discount_total' => 0]);
    $proposal->setRelation('currency', null);
    $item = new SalesItem(['description' => 'Design', 'qty' => 1, 'rate' => 150000]);
    $item->setRelation('taxes', collect([(object) ['tax_name' => 'Exempt', 'tax_rate' => 0]]));
    $proposal->setRelation('items', collect([$item]));

    $html = salesPdfHtml($proposal, $admin->company_id);
    expect($html)->toContain('₹1,50,000.00')->not->toContain('Exempt (0%)')->toContain('Rupees One Lakh Fifty Thousand');

    $proposal->setRelation('items', collect());
    expect(salesPdfHtml($proposal, $admin->company_id))->not->toContain('Amount in words')->not->toContain('Sub Total');
});
