<?php

namespace App\Http\Middleware;

use App\Models\LeadPipeline;
use App\Services\Options;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Webhooks of a workspace with its own WhatsApp number or Exotel account carry ?workspace= in
 * their URL (shown in that workspace's Setup): they run with that workspace's settings.
 */
class WorkspaceFromQuery
{
    public function handle(Request $request, Closure $next): Response
    {
        $state = Options::state();
        $id = (int) $request->query('workspace');
        $company = (int) $request->route('company');
        Options::useWorkspace($id && LeadPipeline::withoutGlobalScopes()->where('company_id', $company)->whereKey($id)->exists() ? $id : null);
        try {
            return $next($request);
        } finally {
            Options::restore($state);
        }
    }
}
