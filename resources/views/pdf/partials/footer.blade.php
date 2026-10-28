{{-- Fixed footer: the company line. The page number is written by App\Support\PdfBrand::pageNumbers(). --}}
<div class="footer">{{ collect([$companyName, $options['company_phone'] ?? null, ($options['company_vat'] ?? null) ? 'GSTIN: '.$options['company_vat'] : null])->filter()->implode('  ·  ') }}</div>
