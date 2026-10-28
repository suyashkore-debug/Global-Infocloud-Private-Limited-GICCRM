@php
    // Shared PDF look (GIC Folks navy / orange). Settings → PDF colours and font size still apply.
    $pdfHead = \App\Support\PdfBrand::color($options['pdf_table_heading_color'] ?? null, \App\Support\PdfBrand::NAVY);
    $pdfHeadText = \App\Support\PdfBrand::color($options['pdf_table_heading_text_color'] ?? null, '#ffffff');
    $pdfFont = max(7, min(16, (int) ($options['pdf_font_size'] ?? 10)));
@endphp
<style>
    @page { margin: 34px 38px 46px 38px; }
    * { font-family: DejaVu Sans, sans-serif; }
    body { font-size: {{ $pdfFont }}px; color: #334155; margin: 0; line-height: 1.45; }
    table { width: 100%; border-collapse: collapse; }
    .muted { color: #64748b; }
    .right { text-align: right; }
    .brand-rule { height: 3px; background: {{ \App\Support\PdfBrand::NAVY }}; margin: 14px 0 16px; }
    .brand-rule span { display: block; width: 70px; height: 3px; background: {{ \App\Support\PdfBrand::ORANGE }}; }
    .doc-title { font-size: 26px; font-weight: bold; color: {{ \App\Support\PdfBrand::NAVY }}; letter-spacing: 1px; }
    .doc-number { font-size: 12px; font-weight: bold; color: #334155; margin-top: 2px; }
    .pill { display: inline-block; margin-top: 6px; padding: 3px 9px; border-radius: 9px; font-size: 8.5px; font-weight: bold; text-transform: uppercase; color: #ffffff; letter-spacing: 0.5px; }
    .company-name { font-size: 15px; font-weight: bold; color: {{ \App\Support\PdfBrand::NAVY }}; }
    .label { font-size: 8px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: {{ \App\Support\PdfBrand::ORANGE }}; margin-bottom: 4px; }
    .box { background: #f4f6fa; border-radius: 6px; padding: 10px 12px; vertical-align: top; }
    .box-name { font-weight: bold; color: #0f172a; font-size: {{ $pdfFont + 1 }}px; }
    .details td { padding: 1.5px 0; }
    .details .k { color: #64748b; }
    .details .v { text-align: right; font-weight: bold; color: #0f172a; }
    .items { margin-top: 18px; }
    .items th { background: {{ $pdfHead }}; color: {{ $pdfHeadText }}; padding: 7px 8px; font-weight: bold; text-align: left; font-size: {{ max(7, $pdfFont - 1) }}px; text-transform: uppercase; letter-spacing: 0.4px; }
    .items th.right { text-align: right; }
    .items td { padding: 7px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    .items tr.alt td { background: #f8fafc; }
    .totals td { padding: 5px 10px; }
    .totals .k { text-align: right; color: #475569; }
    .totals .v { text-align: right; font-weight: bold; color: #0f172a; }
    .totals tr.grand td { background: {{ \App\Support\PdfBrand::NAVY }}; color: #ffffff; font-size: {{ $pdfFont + 2 }}px; font-weight: bold; }
    .totals tr.due td { color: {{ \App\Support\PdfBrand::ORANGE }}; font-weight: bold; }
    h4 { margin: 18px 0 6px; font-size: {{ $pdfFont + 1 }}px; color: {{ \App\Support\PdfBrand::NAVY }}; padding-bottom: 3px; border-bottom: 1.5px solid {{ \App\Support\PdfBrand::ORANGE }}; display: inline-block; }
    .footer { position: fixed; bottom: -30px; left: 0; right: 0; border-top: 1px solid #e2e8f0; padding-top: 5px; font-size: 8px; color: #94a3b8; }
    .rich table { border-collapse: collapse; max-width: 100%; }
    .rich td, .rich th { padding: 4px 6px; vertical-align: top; }
    .rich img { max-width: 100%; }
    .rich p { margin: 0 0 8px; }
</style>
