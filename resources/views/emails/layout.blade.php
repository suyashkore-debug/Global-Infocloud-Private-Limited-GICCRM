{{-- Branded e-mail layout (inline styles and tables, for mail clients). --}}
<!doctype html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin: 0; padding: 0; background: #f3f5f9; font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.6; color: #334155;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #f3f5f9;">
    <tr>
        <td align="center" style="padding: 28px 12px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 640px;">
                <tr>
                    <td style="background: #ffffff; border-radius: 12px 12px 0 0; padding: 20px 28px; border-bottom: 3px solid #0b2c56;">
                        @if ($logo)
                            <img src="{{ $logo }}" alt="{{ $companyName }}" style="max-height: 46px; max-width: 220px; display: block; border: 0;">
                        @else
                            <span style="font-size: 20px; font-weight: bold; color: #0b2c56;">{{ $companyName }}</span>
                        @endif
                    </td>
                </tr>
                <tr>
                    <td style="background: #fa6010; height: 3px; line-height: 3px; font-size: 0;">&nbsp;</td>
                </tr>
                <tr>
                    <td style="background: #ffffff; padding: 28px; border-radius: 0 0 12px 12px; color: #334155;">
                        {!! $body !!}
                    </td>
                </tr>
                <tr>
                    <td align="center" style="padding: 18px 12px 0; font-size: 12px; color: #94a3b8; line-height: 1.5;">
                        <strong style="color: #64748b;">{{ $companyName }}</strong><br>
                        {{ collect([$options['company_address'] ?? null, $options['company_city'] ?? null, $options['company_state'] ?? null])->filter()->implode(', ') }}
                        @if (! empty($options['company_phone']))<br>{{ $options['company_phone'] }}@endif
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>
</body>
</html>
