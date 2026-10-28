{{-- Top of every PDF: logo (or company name) on the left; title, number and status on the right; brand rule. --}}
<table>
    <tr>
        <td width="55%" style="vertical-align: middle;">
            @if ($logo)
                <img src="{{ $logo }}" style="max-height: 58px; max-width: 220px;" alt="">
            @else
                <div class="company-name" style="font-size: 20px;">{{ $companyName }}</div>
            @endif
        </td>
        <td width="45%" class="right" style="vertical-align: middle;">
            <div class="doc-title">{{ $title }}</div>
            @if (! empty($subtitle))<div class="doc-number">{{ $subtitle }}</div>@endif
            @if (! empty($pill))<span class="pill" style="background: {{ $pill[1] }};">{{ $pill[0] }}</span>@endif
        </td>
    </tr>
</table>
<div class="brand-rule"><span></span></div>
