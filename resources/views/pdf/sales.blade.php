@php
    /**
     * One Perfex-style PDF for every sales document.
     *
     * @var \Illuminate\Database\Eloquent\Model $document  invoice / estimate / credit note / proposal
     * @var string $heading  e.g. "INVOICE"
     * @var string $number
     * @var array{0: string, 1: string} $status  [label, colour]
     * @var array<string, string> $infoRows  shown on the right under the "To" block
     * @var array{name: string, lines: array<int, string>, vat?: ?string, pan?: ?string} $billTo
     * @var array<int, string>|null $shipTo
     * @var \Illuminate\Support\Collection|null $payments
     * @var float|null $amountPaid
     * @var float|null $amountCredited
     * @var float|null $amountDue
     */
    // The document's currency, else the company's default (never an amount without a symbol).
    $currency = $document->currency ?? \App\Models\Currency::withoutGlobalScopes()->where('company_id', $document->company_id)->where('is_default', true)->first();
    $money = fn ($v) => \App\Support\MoneyFormat::money($v, $currency);
    $num = fn ($v) => \App\Support\MoneyFormat::number($v, $currency);
    $lineAmount = fn ($item) => round((float) $item->qty * (float) $item->rate, 2);
    // Same sums as App\Services\SalesCalculator: rounded line amounts, 0% taxes left out.
    $taxSummary = [];
    foreach ($document->items as $item) {
        foreach ($item->taxes as $tax) {
            if ((float) $tax->tax_rate == 0.0) {
                continue;
            }
            $key = $tax->tax_name.' ('.rtrim(rtrim(number_format((float) $tax->tax_rate, 2), '0'), '.').'%)';
            $taxSummary[$key] = ($taxSummary[$key] ?? 0) + $lineAmount($item) * (float) $tax->tax_rate / 100;
        }
    }
    $hasItems = $document->items->isNotEmpty();
    if ($document->discount_type === 'before_tax' && $document->subtotal > 0) {
        $share = $document->discount_total / $document->subtotal;
        $taxSummary = array_map(fn ($t) => $t - $t * $share, $taxSummary);
    }
    $qtyHeading = [1 => 'Qty', 2 => 'Hours', 3 => 'Qty/Hours'][$document->show_quantity_as] ?? 'Qty';
    $payments ??= null;
    $paymentModes ??= collect();
    $amountPaid ??= null;
    $amountCredited ??= null;
    $amountDue ??= null;
    $shipTo ??= null;
    $intro ??= null;
@endphp
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    @include('pdf.partials.style')
</head>
<body>
@include('pdf.partials.footer')
@include('pdf.partials.masthead', ['title' => $heading, 'subtitle' => '# '.$number, 'pill' => $options['show_status_on_pdf_ei'] === '1' ? $status : null])
@php
    // Settings → PDF "Swap company / customer details": the customer block comes first.
    $swap = $options['swap_pdf_info'] === '1';
@endphp
@php ob_start(); @endphp
    <div class="label">From</div>
    <div class="box-name">{{ $companyName }}</div>
    <div class="muted">
        @if ($options['company_address']){!! nl2br(e($options['company_address'])) !!}<br>@endif
        @if ($options['company_city'] || $options['company_state']){{ collect([$options['company_city'], $options['company_state']])->filter()->implode(', ') }}<br>@endif
        @if ($options['company_country'] || $options['company_zip']){{ collect([$options['company_country'], $options['company_zip']])->filter()->implode(' ') }}<br>@endif
        @if ($options['company_phone']){{ $options['company_phone'] }}<br>@endif
        @if ($options['company_vat'])GSTIN: {{ $options['company_vat'] }}@endif
    </div>
@php $companyBlock = ob_get_clean(); ob_start(); @endphp
    <div class="label">{{ $billToLabel ?? 'Bill To' }}</div>
    <div class="box-name">{{ $billTo['name'] }}</div>
    <div class="muted">
        {!! collect($billTo['lines'])->filter()->map(fn ($l) => e($l))->implode('<br>') !!}
        @if (! empty($billTo['vat']))<br>GSTIN: {{ $billTo['vat'] }}@endif
        @if (! empty($billTo['pan']))<br>PAN: {{ $billTo['pan'] }}@endif
    </div>
    @if ($shipTo)
        <div class="label" style="margin-top: 8px;">Ship To</div>
        <div class="muted">{!! collect($shipTo)->filter()->map(fn ($l) => e($l))->implode('<br>') !!}</div>
    @endif
@php $customerBlock = ob_get_clean(); @endphp
<table>
    <tr>
        <td width="34%" class="box">{!! $swap ? $customerBlock : $companyBlock !!}</td>
        <td width="2%"></td>
        <td width="32%" class="box">{!! $swap ? $companyBlock : $customerBlock !!}</td>
        <td width="2%"></td>
        <td width="30%" class="box">
            <div class="label">Details</div>
            <table class="details">
                @foreach ($infoRows as $label => $value)
                    @if ($value)
                        <tr><td class="k">{{ $label }}</td><td class="v">{{ $value }}</td></tr>
                    @endif
                @endforeach
            </table>
        </td>
    </tr>
</table>

@if ($intro)
    {{-- Already safe HTML (App\Support\RichText). --}}
    <div class="rich" style="margin-top: 16px;">{!! $intro !!}</div>
@endif

@if ($hasItems)
<table class="items">
    <thead>
        <tr>
            <th width="5%">#</th>
            <th width="45%">Item</th>
            <th width="10%" class="right">{{ $qtyHeading }}</th>
            <th width="13%" class="right">Rate</th>
            <th width="12%" class="right">Tax</th>
            <th width="15%" class="right">Amount</th>
        </tr>
    </thead>
    <tbody>
        @foreach ($document->items as $i => $item)
            <tr class="{{ $i % 2 ? 'alt' : '' }}">
                <td class="muted">{{ $i + 1 }}</td>
                <td>
                    <b style="color: #0f172a;">{{ $item->description }}</b>
                    @if ($item->long_description)<br><span class="muted">{!! nl2br(e($item->long_description)) !!}</span>@endif
                    @if ($item->hsn_code)<br><span class="muted">HSN/SAC: {{ $item->hsn_code }}</span>@endif
                </td>
                <td class="right">{{ rtrim(rtrim(number_format((float) $item->qty, 2), '0'), '.') }} {{ $item->unit }}</td>
                <td class="right">{{ $num($item->rate) }}</td>
                <td class="right">{!! $item->taxes->map(fn ($t) => e($t->tax_name).' '.rtrim(rtrim(number_format((float) $t->tax_rate, 2), '0'), '.').'%')->implode('<br>') ?: '0%' !!}</td>
                <td class="right" style="color: #0f172a;">{{ $num($lineAmount($item)) }}</td>
            </tr>
        @endforeach
    </tbody>
</table>

<table style="margin-top: 12px;">
    <tr>
        <td width="52%" style="vertical-align: top; padding-right: 16px;">
            <div class="label">Amount in words</div>
            <div style="font-style: italic; color: #334155;">{{ \App\Support\MoneyFormat::words((float) $document->total, $currency) }}</div>
        </td>
        <td width="48%" style="vertical-align: top;">
            <table class="totals">
                <tr><td class="k">Sub Total</td><td class="v">{{ $money($document->subtotal) }}</td></tr>
                @if ($document->discount_total > 0)
                    <tr><td class="k">Discount @if ($document->discount_percent > 0)({{ rtrim(rtrim(number_format((float) $document->discount_percent, 2), '0'), '.') }}%)@endif</td><td class="v">-{{ $money($document->discount_total) }}</td></tr>
                @endif
                @foreach ($taxSummary as $name => $amount)
                    <tr><td class="k">{{ $name }}</td><td class="v">{{ $money($amount) }}</td></tr>
                @endforeach
                @if ((float) $document->adjustment != 0)
                    <tr><td class="k">Adjustment</td><td class="v">{{ $money($document->adjustment) }}</td></tr>
                @endif
                <tr class="grand"><td class="right">Total</td><td class="right">{{ $money($document->total) }}</td></tr>
                @if ($amountPaid)
                    <tr><td class="k">Total Paid</td><td class="v">-{{ $money($amountPaid) }}</td></tr>
                @endif
                @if ($amountCredited)
                    <tr><td class="k">Applied Credits</td><td class="v">-{{ $money($amountCredited) }}</td></tr>
                @endif
                @if ($amountDue !== null && ($amountPaid || $amountCredited))
                    <tr class="due"><td class="right">{{ $amountDueLabel ?? 'Amount Due' }}</td><td class="right">{{ $money($amountDue) }}</td></tr>
                @endif
            </table>
        </td>
    </tr>
</table>
@endif

@if ($payments && $payments->count())
    <h4>Transactions</h4>
    <table class="items" style="margin-top: 4px;">
        <thead><tr><th>Payment #</th><th>Payment Mode</th><th>Date</th><th class="right">Amount</th></tr></thead>
        <tbody>
            @foreach ($payments as $i => $payment)
                <tr class="{{ $i % 2 ? 'alt' : '' }}">
                    <td>{{ $payment->id }}</td>
                    <td>{{ $payment->paymentMode?->name }}{{ $payment->payment_method ? ' - '.$payment->payment_method : '' }}</td>
                    <td>{{ $payment->date->format('d-m-Y') }}</td>
                    <td class="right">{{ $money($payment->amount) }}</td>
                </tr>
            @endforeach
        </tbody>
    </table>
@endif

@if ($paymentModes->count() && ($amountDue ?? 0) > 0)
    <div><h4>Offline Payment</h4></div>
    @foreach ($paymentModes as $mode)
        <b style="color: #0f172a;">{{ $mode->name }}</b><br><span class="muted">{!! nl2br(e($mode->description)) !!}</span><br>
    @endforeach
@endif

@if ($document->client_note ?? null)
    <div><h4>Note</h4></div>
    <div>{!! nl2br(e($document->client_note)) !!}</div>
@endif

@if ($document->terms ?? null)
    <div><h4>Terms &amp; Conditions</h4></div>
    <div class="muted">{!! nl2br(e($document->terms)) !!}</div>
@endif
</body>
</html>
