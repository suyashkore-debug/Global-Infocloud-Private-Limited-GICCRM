{{-- Purchase order / purchase invoice PDF (GIC Folks layout). --}}
@php
    $symbol = $document->currency?->symbol ?? '';
    $money = fn ($v) => ($document->currency?->placement === 'after') ? number_format((float) $v, 2).' '.$symbol : $symbol.number_format((float) $v, 2);
    $vendor = $document->vendor;
@endphp
<html>
<head>
    <meta charset="utf-8">
    @include('pdf.partials.style')
</head>
<body>
@include('pdf.partials.footer')
@include('pdf.partials.masthead', ['title' => $heading, 'subtitle' => $number])

<table>
    <tr>
        <td width="34%" class="box">
            <div class="label">From</div>
            <div class="box-name">{{ $companyName }}</div>
            <div class="muted">
                @if ($options['company_address']){!! nl2br(e($options['company_address'])) !!}<br>@endif
                {{ collect([$options['company_city'], $options['company_state']])->filter()->implode(', ') }}
                {{ collect([$options['company_country'], $options['company_zip']])->filter()->implode(' ') }}<br>
                @if ($options['company_phone']){{ $options['company_phone'] }}<br>@endif
                @if ($options['company_vat'])GSTIN: {{ $options['company_vat'] }}@endif
            </div>
        </td>
        <td width="2%"></td>
        <td width="32%" class="box">
            <div class="label">Vendor</div>
            <div class="box-name">{{ $vendor?->name }}</div>
            <div class="muted">
                @if ($vendor?->address){!! nl2br(e((string) $vendor->address)) !!}<br>@endif
                {{ collect([$vendor?->city, $vendor?->state, $vendor?->zip])->filter()->implode(', ') }} {{ $vendor?->country }}<br>
                @if ($vendor?->vat)GSTIN: {{ $vendor->vat }}@endif
            </div>
        </td>
        <td width="2%"></td>
        <td width="30%" class="box">
            <div class="label">Details</div>
            <table class="details">
                @foreach ($infoRows as $label => $value)
                    @if ($value)<tr><td class="k">{{ $label }}</td><td class="v">{{ $value }}</td></tr>@endif
                @endforeach
            </table>
        </td>
    </tr>
</table>

<table class="items">
    <thead>
        <tr><th width="5%">#</th><th>Item</th><th class="right">Qty</th><th class="right">Unit Price</th><th class="right">Tax</th><th class="right">Amount</th></tr>
    </thead>
    <tbody>
        @foreach ($document->items as $i => $item)
            <tr class="{{ $i % 2 ? 'alt' : '' }}">
                <td class="muted">{{ $i + 1 }}</td>
                <td><b style="color: #0f172a;">{{ $item->description }}</b>@if ($item->long_description)<br><span class="muted">{{ $item->long_description }}</span>@endif</td>
                <td class="right">{{ rtrim(rtrim(number_format((float) $item->qty, 2), '0'), '.') }} {{ $item->unit }}</td>
                <td class="right">{{ $money($item->unit_price) }}</td>
                <td class="right">{{ $item->tax_name ? $item->tax_name.' ' : '' }}{{ (float) $item->tax_rate }}%</td>
                <td class="right" style="color: #0f172a;">{{ $money((float) $item->qty * (float) $item->unit_price) }}</td>
            </tr>
        @endforeach
    </tbody>
</table>

<table style="margin-top: 12px;">
    <tr>
        <td width="52%"></td>
        <td width="48%">
            <table class="totals">
                <tr><td class="k">Sub Total</td><td class="v">{{ $money($document->subtotal) }}</td></tr>
                @if ((float) $document->discount_total > 0)
                    <tr><td class="k">Discount</td><td class="v">-{{ $money($document->discount_total) }}</td></tr>
                @endif
                <tr><td class="k">Tax</td><td class="v">{{ $money($document->total_tax) }}</td></tr>
                @if ((float) $document->shipping_fee > 0)
                    <tr><td class="k">Shipping</td><td class="v">{{ $money($document->shipping_fee) }}</td></tr>
                @endif
                <tr class="grand"><td class="right">Total</td><td class="right">{{ $money($document->total) }}</td></tr>
            </table>
        </td>
    </tr>
</table>

@if ($document->vendor_note)
    <div><h4>Note</h4></div>
    <div>{!! nl2br(e($document->vendor_note)) !!}</div>
@endif
@if ($document->terms)
    <div><h4>Terms &amp; Conditions</h4></div>
    <div class="muted">{!! nl2br(e($document->terms)) !!}</div>
@endif
</body>
</html>
