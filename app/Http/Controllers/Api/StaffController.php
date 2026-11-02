<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\StaffResource;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * The company's active staff (HRMS and CRM accounts), for member / assignee pickers.
 */
class StaffController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        return StaffResource::collection(
            User::where('company_id', $request->user()->company_id)
                ->where('is_active', true)
                ->orderBy('full_name')
                ->get(['id', 'source', 'full_name', 'first_name', 'last_name', 'email', 'employee_code', 'profile_photo'])
        );
    }
}
