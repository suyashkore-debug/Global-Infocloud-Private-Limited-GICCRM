{{-- Fixed footer: the company line. The page number is written by App\Support\PdfBrand::pageNumbers(). --}}
<div class="footer">{{ collect([$companyName, $options['company_phone'] ?? null, ($options['company_vat'] ?? null) ? ($options['tax_id_label'] ?? 'GSTIN').': '.$options['company_vat'] : null])->filter()->implode('  ·  ') }}</div>
