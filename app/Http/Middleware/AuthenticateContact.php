<?php

namespace App\Http\Middleware;

use App\Models\Company;
use App\Models\ContactToken;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Customers area requests: the Bearer token must belong to an active contact of an active
 * customer of an active company. The contact is put on the request as "contact".
 */
class AuthenticateContact
{
    public function handle(Request $request, Closure $next): Response
    {
        $plain = (string) $request->bearerToken();
        $token = $plain ? ContactToken::where('token', hash('sha256', $plain))->with('contact.customer')->first() : null;
        $contact = $token?->contact;
        $customer = $contact?->customer;

        if (! $token || ($token->expires_at && $token->expires_at->isPast()) || ! $contact->active || ! $customer?->is_active
            || Company::find($customer->company_id)?->status !== 'active') {
            return response()->json(['message' => 'Please log in.'], 401);
        }

        if (! $token->last_used_at || $token->last_used_at->lt(now()->subMinutes(5))) {
            $token->forceFill(['last_used_at' => now()])->save();
        }
        $request->attributes->set('contact', $contact);
        // Company scopes, options and new rows use the customer's company (see CurrentCompany).
        $request->attributes->set('portal_company_id', (int) $customer->company_id);

        return $next($request);
    }
}
