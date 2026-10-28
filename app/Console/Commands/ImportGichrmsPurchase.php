<?php

namespace App\Console\Commands;

use App\Models\Attachment;
use App\Models\Currency;
use App\Models\PaymentMode;
use App\Models\PurchaseApprovalSetting;
use App\Models\PurchaseInvoice;
use App\Models\PurchaseOrder;
use App\Models\PurchaseRequest;
use App\Models\User;
use App\Models\Vendor;
use App\Models\VendorCategory;
use App\Services\Options;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * One-off import of GIC's purchase data from the old Perfex system (GICHRMS): vendors,
 * contacts, categories, purchase requests, orders, invoices with their lines and payments,
 * attachments, numbering and the approval setting. Amounts are kept exactly as they were.
 *
 * The input is a folder of JSON exports of the GICHRMS tables (one file per table).
 */
class ImportGichrmsPurchase extends Command
{
    protected $signature = 'purchase:import-gichrms {dir : folder with the JSON exports} {--company= : company id to import into} {--uploads= : GICHRMS modules/purchase/uploads folder} {--dry-run : roll back at the end}';

    protected $description = 'Import purchase data from GICHRMS (old Perfex) into a company';

    private int $company;

    private int $fallbackUser;

    /** @var array<int, int> GICHRMS staff id => HRMS user id */
    private array $staff = [];

    /** @var array<string, array<int, int>> old id => new id per table */
    private array $map = [];

    public function handle(): int
    {
        $this->company = (int) $this->option('company');
        if (! $this->company) {
            $this->error('Pass --company=ID');

            return self::FAILURE;
        }
        if (Vendor::withoutGlobalScopes()->where('company_id', $this->company)->exists() || PurchaseInvoice::withoutGlobalScopes()->where('company_id', $this->company)->exists()) {
            $this->error('This company already has purchase data; the import only runs into an empty purchase module.');

            return self::FAILURE;
        }
        $this->fallbackUser = (int) User::where('company_id', $this->company)->where('is_company_admin', true)->where('is_active', true)->orderBy('id')->value('id');

        DB::beginTransaction();
        try {
            $this->mapStaff();
            $currencies = $this->mapCurrencies();
            $modes = $this->mapPaymentModes();
            $this->importCategories();
            $this->importVendors($currencies);
            $this->importRequests($currencies);
            $this->importOrders($currencies);
            $this->importInvoices($currencies, $modes);
            $this->importFiles();
            $this->importOptions();
            $this->verify();

            if ($this->option('dry-run')) {
                DB::rollBack();
                $this->warn('Dry run: everything was rolled back.');
            } else {
                DB::commit();
                $this->info('Import finished.');
            }
        } catch (\Throwable $e) {
            DB::rollBack();
            $this->error('Import failed, nothing was saved: '.$e->getMessage());

            return self::FAILURE;
        }

        return self::SUCCESS;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function rows(string $table): array
    {
        $file = rtrim((string) $this->argument('dir'), '/')."/{$table}.json";
        if (! is_file($file)) {
            throw new RuntimeException("Missing {$file}");
        }

        return json_decode((string) file_get_contents($file), true, 512, JSON_THROW_ON_ERROR);
    }

    private function mapStaff(): void
    {
        foreach ($this->rows('tblstaff') as $s) {
            $id = User::where('company_id', $this->company)->where('email', strtolower(trim((string) $s['email'])))->value('id');
            $this->staff[(int) $s['staffid']] = (int) ($id ?: $this->fallbackUser);
            $this->line(sprintf('  staff %-40s => %s', $s['email'], $id ? "user #{$id}" : "company admin #{$this->fallbackUser} (not in HRMS)"));
        }
    }

    private function user(mixed $staffId): int
    {
        return $this->staff[(int) $staffId] ?? $this->fallbackUser;
    }

    /**
     * @return array<int, int|null>
     */
    private function mapCurrencies(): array
    {
        $map = [];
        foreach ($this->rows('tblcurrencies') as $c) {
            $map[(int) $c['id']] = Currency::withoutGlobalScopes()->where('company_id', $this->company)->where('name', $c['name'])->value('id');
        }
        $map[0] = Currency::withoutGlobalScopes()->where('company_id', $this->company)->where('is_default', true)->value('id');

        return $map;
    }

    /**
     * @return array<int, int>
     */
    private function mapPaymentModes(): array
    {
        $map = [];
        foreach ($this->rows('tblpayment_modes') as $m) {
            $name = trim((string) $m['name']);
            $mode = PaymentMode::withoutGlobalScopes()->firstOrCreate(['company_id' => $this->company, 'name' => $name], ['description' => $m['description'] ?? null, 'active' => (bool) ($m['active'] ?? true)]);
            $map[(int) $m['id']] = $mode->id;
        }

        return $map;
    }

    private function importCategories(): void
    {
        foreach ($this->rows('tblpur_vendor_cate') as $c) {
            $this->map['cat'][(int) $c['id']] = VendorCategory::withoutGlobalScopes()->firstOrCreate(
                ['company_id' => $this->company, 'name' => trim((string) $c['category_name'])],
                ['description' => $c['description'] ?: null],
            )->id;
        }
    }

    /**
     * @param  array<int, int|null>  $currencies
     */
    private function importVendors(array $currencies): void
    {
        $countries = collect($this->rows('tblcountries'))->pluck('short_name', 'country_id');
        $country = fn ($id) => $id ? ($countries[(int) $id] ?? null) : null;

        foreach ($this->rows('tblpur_vendor') as $v) {
            $categories = collect(explode(',', (string) $v['category']))->map(fn ($id) => $this->map['cat'][(int) $id] ?? null)->filter()->values()->all();
            $vendor = new Vendor([
                'company_id' => $this->company,
                'vendor_code' => $v['vendor_code'] ?: null,
                'name' => trim((string) preg_replace('/[\x{200B}-\x{200D}\x{FEFF}\x{00A0}\s]+/u', ' ', (string) $v['company'])) ?: 'Vendor #'.$v['userid'],
                'vat' => $v['vat'] ?: null,
                'phone' => $v['phonenumber'] ?: null,
                'website' => $v['website'] ?: null,
                'address' => $v['address'] ?: null,
                'city' => $v['city'] ?: null, 'state' => $v['state'] ?: null, 'zip' => $v['zip'] ?: null, 'country' => $country($v['country']),
                'billing_street' => $v['billing_street'] ?: null, 'billing_city' => $v['billing_city'] ?: null, 'billing_state' => $v['billing_state'] ?: null,
                'billing_zip' => $v['billing_zip'] ?: null, 'billing_country' => $country($v['billing_country']),
                'shipping_street' => $v['shipping_street'] ?: null, 'shipping_city' => $v['shipping_city'] ?: null, 'shipping_state' => $v['shipping_state'] ?: null,
                'shipping_zip' => $v['shipping_zip'] ?: null, 'shipping_country' => $country($v['shipping_country']),
                'category_ids' => $categories ?: null,
                'bank_detail' => $v['bank_detail'] ?: null,
                'payment_terms' => $v['payment_terms'] ?: null,
                'currency_id' => $currencies[(int) $v['default_currency']] ?? null,
                'balance' => $v['balance'] !== null && $v['balance'] !== '' ? $v['balance'] : null,
                'balance_as_of' => $v['balance_as_of'] ?: null,
                'active' => (bool) $v['active'],
                'created_by' => $this->user($v['addedfrom']),
            ]);
            $vendor->created_at = $v['datecreated'] ?: now();
            $vendor->save();
            $this->map['vendor'][(int) $v['userid']] = $vendor->id;
        }

        foreach ($this->rows('tblpur_contacts') as $c) {
            if (! isset($this->map['vendor'][(int) $c['userid']])) {
                continue;
            }
            DB::table('vendor_contacts')->insert([
                'vendor_id' => $this->map['vendor'][(int) $c['userid']],
                'is_primary' => (bool) $c['is_primary'],
                'first_name' => trim((string) $c['firstname']) ?: '-',
                'last_name' => $c['lastname'] ?: null,
                'email' => $c['email'] ?: null,
                'phone' => $c['phonenumber'] ?: null,
                'title' => $c['title'] ?: null,
                'active' => (bool) $c['active'],
                'created_at' => $c['datecreated'] ?: now(),
                'updated_at' => now(),
            ]);
        }
        $this->info(sprintf('  %d vendors, %d contacts', count($this->map['vendor'] ?? []), DB::table('vendor_contacts')->whereIn('vendor_id', $this->map['vendor'] ?? [])->count()));
    }

    /**
     * @param  array<int, int|null>  $currencies
     */
    private function importRequests(array $currencies): void
    {
        $lines = collect($this->rows('tblpur_request_detail'))->groupBy('pur_request');
        foreach ($this->rows('tblpur_request') as $r) {
            $request = new PurchaseRequest([
                'company_id' => $this->company,
                'number' => (int) $r['number'],
                'code' => $r['pur_rq_code'] ?: '#PR-'.$r['number'],
                'name' => $r['pur_rq_name'] ?: 'Purchase request',
                'description' => $r['rq_description'] ?: null,
                'requester_id' => $this->user($r['requester']),
                'currency_id' => $currencies[(int) $r['currency']] ?? $currencies[0],
                'request_date' => $r['request_date'] ?: now(),
                'status' => (int) $r['status'] ?: 1,
                'subtotal' => $r['subtotal'] ?? 0, 'total_tax' => $r['total_tax'] ?? 0, 'total' => $r['total'] ?? 0,
                'hash' => $r['hash'] ?: Str::random(32),
                'created_by' => $this->user($r['requester']),
            ]);
            $request->created_at = $r['request_date'] ?: now();
            $request->save();
            $this->map['request'][(int) $r['id']] = $request->id;
            $this->insertLines($request, $lines->get($r['id'], collect())->all(), 'item_text');
        }
        $this->info(sprintf('  %d purchase requests', count($this->map['request'] ?? [])));
    }

    /**
     * @param  array<int, int|null>  $currencies
     */
    private function importOrders(array $currencies): void
    {
        $lines = collect($this->rows('tblpur_order_detail'))->groupBy('pur_order');
        foreach ($this->rows('tblpur_orders') as $o) {
            $order = new PurchaseOrder([
                'company_id' => $this->company,
                'number' => (int) $o['number'],
                'code' => $o['pur_order_number'] ?: '#PO-'.$o['number'],
                'name' => $o['pur_order_name'] ?: 'Purchase order',
                'vendor_id' => $this->map['vendor'][(int) $o['vendor']] ?? throw new RuntimeException("Order {$o['id']}: unknown vendor {$o['vendor']}"),
                'purchase_request_id' => $this->map['request'][(int) $o['pur_request']] ?? null,
                'currency_id' => $currencies[(int) $o['currency']] ?? $currencies[0],
                'order_date' => $o['order_date'] ?: now()->toDateString(),
                'delivery_date' => $o['delivery_date'] ?: null,
                'status' => (int) $o['approve_status'] ?: 1,
                'delivery_status' => (int) $o['delivery_status'],
                'buyer_id' => $o['buyer'] ? $this->user($o['buyer']) : null,
                'subtotal' => $o['subtotal'] ?? 0,
                ...$this->discount($o, 'discount_percent', 'discount_total'),
                'total_tax' => $o['total_tax'] ?? 0,
                'shipping_fee' => $o['shipping_fee'] ?? 0,
                'total' => $o['total'] ?? 0,
                'vendor_note' => $o['vendornote'] ?: null,
                'terms' => $o['terms'] ?: null,
                'hash' => $o['hash'] ?: Str::random(32),
                'created_by' => $this->user($o['addedfrom']),
            ]);
            $order->created_at = $o['datecreated'] ?: now();
            $order->save();
            $this->map['order'][(int) $o['id']] = $order->id;
            $this->insertLines($order, $lines->get($o['id'], collect())->all(), 'item_name');
        }
        $this->info(sprintf('  %d purchase orders', count($this->map['order'] ?? [])));
    }

    /**
     * @param  array<int, int|null>  $currencies
     * @param  array<int, int>  $modes
     */
    private function importInvoices(array $currencies, array $modes): void
    {
        $lines = collect($this->rows('tblpur_invoice_details'))->groupBy('pur_invoice');
        foreach ($this->rows('tblpur_invoices') as $i) {
            $invoice = new PurchaseInvoice([
                'company_id' => $this->company,
                'number' => (int) $i['number'],
                'invoice_number' => $i['invoice_number'] ?: 'BILL# '.$i['number'],
                'vendor_invoice_number' => $i['vendor_invoice_number'] ?: null,
                'vendor_id' => $this->map['vendor'][(int) $i['vendor']] ?? throw new RuntimeException("Invoice {$i['id']}: unknown vendor {$i['vendor']}"),
                'purchase_order_id' => $this->map['order'][(int) $i['pur_order']] ?? null,
                'currency_id' => $currencies[(int) $i['currency']] ?? $currencies[0],
                'invoice_date' => $i['invoice_date'],
                'due_date' => $i['duedate'] ?: null,
                'subtotal' => $i['subtotal'] ?? 0,
                ...$this->discount($i, 'discount_percent', 'discount_total'),
                'total_tax' => $i['tax'] ?? 0,
                'shipping_fee' => $i['shipping_fee'] ?? 0,
                'total' => $i['total'] ?? 0,
                'payment_status' => in_array($i['payment_status'], ['unpaid', 'partially_paid', 'paid'], true) ? $i['payment_status'] : 'unpaid',
                'transaction_id' => $i['transactionid'] ?: null,
                'vendor_note' => $i['vendor_note'] ?: null,
                'admin_note' => $i['adminnote'] ?: null,
                'terms' => $i['terms'] ?: null,
                'created_by' => $this->user($i['add_from']),
            ]);
            $invoice->created_at = $i['date_add'] ?: $i['invoice_date'];
            $invoice->save();
            $this->map['invoice'][(int) $i['id']] = $invoice->id;
            $this->insertLines($invoice, $lines->get($i['id'], collect())->all(), 'item_name');
        }

        $payments = [];
        foreach ($this->rows('tblpur_invoice_payment') as $p) {
            if (! isset($this->map['invoice'][(int) $p['pur_invoice']])) {
                continue;
            }
            $payments[] = [
                'purchase_invoice_id' => $this->map['invoice'][(int) $p['pur_invoice']],
                'amount' => $p['amount'],
                'payment_mode_id' => is_numeric($p['paymentmode']) ? ($modes[(int) $p['paymentmode']] ?? null) : null,
                'date' => $p['date'],
                'transaction_id' => $p['transactionid'] ?: null,
                'note' => $p['note'] ?: null,
                'created_by' => $this->user($p['requester']),
                'created_at' => $p['daterecorded'] ?: $p['date'],
                'updated_at' => now(),
            ];
        }
        foreach (array_chunk($payments, 200) as $chunk) {
            DB::table('purchase_invoice_payments')->insert($chunk);
        }
        $this->info(sprintf('  %d purchase invoices, %d payments', count($this->map['invoice'] ?? []), count($payments)));
    }

    /**
     * Perfex lines may carry two taxes ("CGST|SGST" at "9.00|9.00"): kept as one line tax with
     * the combined rate, and the stored amounts.
     *
     * @param  array<int, array<string, mixed>>  $lines
     */
    private function insertLines(Model $document, array $lines, string $nameKey): void
    {
        $rows = [];
        foreach (array_values($lines) as $n => $l) {
            $names = array_values(array_filter(explode('|', (string) ($l['tax_name'] ?? ''))));
            $rates = array_map('floatval', array_filter(explode('|', (string) ($l['tax_rate'] ?? '')), fn ($r) => $r !== ''));
            $title = trim((string) ($l[$nameKey] ?? '')) ?: trim(strip_tags((string) ($l['description'] ?? ''))) ?: 'Item';
            $long = isset($l['description']) && $nameKey !== 'item_text' && trim(strip_tags((string) $l['description'])) !== $title ? trim(strip_tags((string) $l['description'])) : null;
            $qty = (float) ($l['quantity'] ?? 1);
            $price = (float) ($l['unit_price'] ?? 0);
            $amount = round($qty * $price, 2);
            $taxValue = round((float) ($l['tax_value'] ?? 0), 2);

            $rows[] = [
                'purchasable_type' => $document::class,
                'purchasable_id' => $document->getKey(),
                'description' => Str::limit($title, 497),
                'long_description' => $long ?: null,
                'unit' => null,
                'qty' => $qty,
                'unit_price' => $price,
                'tax_name' => $names ? implode(' + ', array_map(fn ($name, $i) => trim($name).(isset($rates[$i]) ? ' '.rtrim(rtrim(number_format($rates[$i], 2), '0'), '.').'%' : ''), $names, array_keys($names))) : null,
                'tax_rate' => array_sum($rates),
                'tax_value' => $taxValue,
                'total' => isset($l['total']) && (float) $l['total'] > 0 ? round((float) $l['total'], 2) : $amount + $taxValue,
                'item_order' => $n + 1,
            ];
        }
        if ($rows) {
            DB::table('purchase_items')->insert($rows);
        }
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    private function discount(array $row, string $percentKey, string $totalKey): array
    {
        $percent = (float) ($row[$percentKey] ?? 0);
        $total = (float) ($row[$totalKey] ?? 0);

        return [
            'discount_type' => $percent > 0 ? 'percent' : ($total > 0 ? 'fixed' : null),
            'discount_percent' => $percent,
            'discount_total' => $total,
        ];
    }

    /**
     * Bill and request attachments, copied into this app's storage.
     */
    private function importFiles(): void
    {
        $uploads = rtrim((string) $this->option('uploads'), '/');
        $copied = 0;
        foreach ($this->rows('tblfiles') as $f) {
            [$folder, $mapKey, $model] = match ($f['rel_type']) {
                'pur_invoice' => ['pur_invoice', 'invoice', PurchaseInvoice::class],
                'pur_request' => ['pur_request', 'request', PurchaseRequest::class],
                'pur_order' => ['pur_order', 'order', PurchaseOrder::class],
                default => [null, null, null],
            };
            $newId = $mapKey ? ($this->map[$mapKey][(int) $f['rel_id']] ?? null) : null;
            $source = "{$uploads}/{$folder}/{$f['rel_id']}/{$f['file_name']}";
            if (! $newId || ! $uploads || ! is_file($source)) {
                $this->warn("  file not found, skipped: {$source}");

                continue;
            }
            $path = "attachments/{$this->company}/{$folder}s/{$newId}/".Str::random(8).'-'.basename((string) $f['file_name']);
            Storage::disk('local')->put($path, (string) file_get_contents($source));
            Attachment::create([
                'company_id' => $this->company,
                'attachable_type' => $model,
                'attachable_id' => $newId,
                'user_id' => $this->user($f['staffid'] ?? 0),
                'disk_path' => $path,
                'original_name' => $f['file_name'],
                'mime_type' => $f['filetype'] ?? null,
                'size' => filesize($source),
            ]);
            $copied++;
        }
        $this->info("  {$copied} attachments");
    }

    private function importOptions(): void
    {
        $old = collect($this->rows('tblpurchase_option'))->pluck('option_val', 'option_name');
        $next = fn (string $option, string $table) => (string) max((int) ($old[$option] ?? 1), (int) DB::table($table)->where('company_id', $this->company)->max('number') + 1);

        foreach ([
            'pur_request_prefix' => $old['pur_request_prefix'] ?? '#PR',
            'pur_order_prefix' => $old['pur_order_prefix'] ?? '#PO',
            'pur_inv_prefix' => $old['pur_inv_prefix'] ?? 'BILL# ',
            'next_pr_number' => $next('next_pr_number', 'purchase_requests'),
            'next_po_number' => $next('next_po_number', 'purchase_orders'),
            'next_pur_inv_number' => $next('next_inv_number', 'purchase_invoices'),
            'pur_terms_and_conditions' => (string) ($old['terms_and_conditions'] ?? ''),
            'pur_vendor_note' => (string) ($old['vendor_note'] ?? ''),
        ] as $name => $value) {
            Options::set($name, (string) $value, $this->company);
        }

        // GIC's approval setting: purchase requests are approved by Vaibhav (GICHRMS staff #1).
        $approver = $this->staff[1] ?? null;
        if ($approver && ! PurchaseApprovalSetting::withoutGlobalScopes()->where('company_id', $this->company)->where('related', 'pur_request')->exists()) {
            PurchaseApprovalSetting::create(['company_id' => $this->company, 'name' => 'Purchase request approver', 'related' => 'pur_request', 'approver_ids' => [$approver]]);
        }
        $this->info('  numbering: next request '.Options::get('next_pr_number', $this->company).', next order '.Options::get('next_po_number', $this->company).', next bill '.Options::get('next_pur_inv_number', $this->company));
    }

    /**
     * Totals must match the old system exactly.
     */
    private function verify(): void
    {
        $oldTotal = round(collect($this->rows('tblpur_invoices'))->sum(fn ($i) => (float) $i['total']), 2);
        $oldPaid = round(collect($this->rows('tblpur_invoice_payment'))->sum(fn ($p) => (float) $p['amount']), 2);
        $newTotal = round((float) PurchaseInvoice::withoutGlobalScopes()->where('company_id', $this->company)->sum('total'), 2);
        $newPaid = round((float) DB::table('purchase_invoice_payments')->whereIn('purchase_invoice_id', $this->map['invoice'] ?? [])->sum('amount'), 2);
        $this->table(['', 'GICHRMS', 'Imported'], [['Invoices total', number_format($oldTotal, 2), number_format($newTotal, 2)], ['Payments total', number_format($oldPaid, 2), number_format($newPaid, 2)]]);
        if (abs($oldTotal - $newTotal) > 0.01 || abs($oldPaid - $newPaid) > 0.01) {
            throw new RuntimeException('Totals do not match.');
        }
    }
}
