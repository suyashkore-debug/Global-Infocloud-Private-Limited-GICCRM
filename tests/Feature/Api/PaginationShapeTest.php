<?php

use App\Models\Customer;
use App\Models\Project;

/**
 * Every list page reads `meta.current_page / last_page / total`; a raw paginator puts them at
 * the top level and the page crashes.
 */
it('returns lists in the data + meta page format the screens expect', function (string $url) {
    $admin = signIn(companyAdmin());
    $project = Project::factory()->for(Customer::factory()->state(['company_id' => $admin->company_id]))->create();
    $url = str_replace('{project}', (string) $project->id, $url);

    $this->getJson($url)->assertOk()->assertJsonStructure(['data', 'meta' => ['current_page', 'last_page', 'total']]);
})->with([
    '/api/items', '/api/customers', '/api/projects', '/api/tasks', '/api/invoices', '/api/estimates', '/api/proposals',
    '/api/credit-notes', '/api/payments', '/api/expenses', '/api/contracts', '/api/tickets', '/api/leads',
    '/api/estimate-requests', '/api/activity-log', '/api/email-logs', '/api/accounting/journal-entries',
    '/api/purchase/vendors', '/api/purchase/requests', '/api/purchase/orders', '/api/purchase/invoices',
    '/api/projects/{project}/activity', '/api/projects/{project}/timesheets',
]);
