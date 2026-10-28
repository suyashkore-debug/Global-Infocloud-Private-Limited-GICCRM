<?php

namespace App\Support;

use Illuminate\Support\Facades\Auth;

/**
 * The company the current request works for: the signed-in staff member's, or in the customers
 * area the logged-in contact's customer's (set by AuthenticateContact). Null in the queue,
 * console and public pages, which pass the company explicitly.
 */
class CurrentCompany
{
    public static function id(): ?int
    {
        if ($id = Auth::user()?->company_id) {
            return (int) $id;
        }
        $portal = app()->bound('request') ? request()->attributes->get('portal_company_id') : null;

        return $portal ? (int) $portal : null;
    }
}
