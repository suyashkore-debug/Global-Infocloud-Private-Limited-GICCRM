{{-- Contract PDF (GIC Folks layout): parties, contract details, the contract text and the signature. --}}
<html>
<head>
    <meta charset="utf-8">
    @include('pdf.partials.style')
</head>
<body>
@include('pdf.partials.footer')
@include('pdf.partials.masthead', ['title' => 'CONTRACT', 'subtitle' => $contract->subject, 'pill' => ($contract->signed || $contract->marked_as_signed) ? ['Signed', '#16a34a'] : null])

<table>
    <tr>
        <td width="34%" class="box">
            <div class="label">From</div>
            <div class="box-name">{{ $companyName }}</div>
            <div class="muted">
                @if ($options['company_address']){!! nl2br(e($options['company_address'])) !!}<br>@endif
                {{ collect([$options['company_city'], $options['company_state']])->filter()->implode(', ') }}
                {{ collect([$options['company_country'], $options['company_zip']])->filter()->implode(' ') }}
            </div>
        </td>
        <td width="2%"></td>
        <td width="32%" class="box">
            <div class="label">Customer</div>
            <div class="box-name">{{ $contract->customer?->name }}</div>
        </td>
        <td width="2%"></td>
        <td width="30%" class="box">
            <div class="label">Details</div>
            <table class="details">
                @if ($contract->type)<tr><td class="k">Contract Type</td><td class="v">{{ $contract->type->name }}</td></tr>@endif
                @if ($contract->contract_value !== null)<tr><td class="k">Contract Value</td><td class="v">{{ number_format((float) $contract->contract_value, 2) }}</td></tr>@endif
                <tr><td class="k">Start Date</td><td class="v">{{ $contract->start_date?->format('d-m-Y') }}</td></tr>
                @if ($contract->end_date)<tr><td class="k">End Date</td><td class="v">{{ $contract->end_date->format('d-m-Y') }}</td></tr>@endif
            </table>
        </td>
    </tr>
</table>

{{-- Already safe HTML (App\Support\RichText). --}}
<div class="rich" style="margin-top: 18px; line-height: 1.6;">{!! \App\Support\RichText::toHtml($contract->content) !!}</div>

@if ($contract->signed || $contract->marked_as_signed)
    <div style="margin-top: 30px;" class="box">
        <div class="label">Signature</div>
        <b style="color: #0f172a;">Signed</b>
        @if ($contract->signer_name) by {{ $contract->signer_name }} @endif
        @if ($contract->signed_at) on {{ $contract->signed_at->format('d-m-Y H:i') }} @endif
    </div>
@endif
</body>
</html>
