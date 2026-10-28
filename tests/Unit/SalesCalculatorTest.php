<?php

use App\Services\SalesCalculator;
use App\Support\AmountInWords;

$items = [
    ['qty' => 2, 'rate' => 500, 'taxes' => [['tax_name' => 'CGST', 'tax_rate' => 9], ['tax_name' => 'SGST', 'tax_rate' => 9]]],
    ['qty' => 1, 'rate' => 1000, 'taxes' => [['tax_name' => 'CGST', 'tax_rate' => 9], ['tax_name' => 'SGST', 'tax_rate' => 9]]],
];

it('adds tax per line', function () use ($items) {
    $totals = SalesCalculator::calculate($items, null, 0, 0, 0);

    expect($totals['subtotal'])->toBe(2000.0)
        ->and($totals['total_tax'])->toBe(360.0)
        ->and($totals['taxes'])->toBe(['CGST|9' => 180.0, 'SGST|9' => 180.0])
        ->and($totals['total'])->toBe(2360.0);
});

it('applies a percent discount before tax to the taxes too, as Perfex does', function () use ($items) {
    $totals = SalesCalculator::calculate($items, 'before_tax', 10, 0, 0);

    expect($totals['discount_total'])->toBe(200.0)
        ->and($totals['total_tax'])->toBe(324.0)
        ->and($totals['total'])->toBe(2124.0);
});

it('applies a fixed discount after tax and an adjustment', function () use ($items) {
    $totals = SalesCalculator::calculate($items, 'after_tax', 0, 60, -0.5);

    expect($totals['discount_total'])->toBe(60.0)
        ->and($totals['total'])->toBe(2299.5);
});

it('writes amounts in Indian words', function () {
    expect(AmountInWords::convert(125050.5))->toBe('Rupees One Lakh Twenty Five Thousand Fifty and Paise Fifty Only')
        ->and(AmountInWords::convert(23600))->toBe('Rupees Twenty Three Thousand Six Hundred Only');
});
