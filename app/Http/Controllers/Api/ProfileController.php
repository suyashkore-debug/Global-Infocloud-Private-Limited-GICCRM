<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\Project;
use App\Models\StaffProfile;
use App\Models\SupportDepartment;
use App\Models\User;
use App\Services\HrmsAuthClient;
use App\Services\HrmsSync;
use App\Services\Timesheets;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

/**
 * Perfex "My Profile" / "Edit Profile". The person (name, phone, photo, password) belongs to
 * HRMS, so those changes are sent to the HRMS API; social links and the e-mail signature are
 * kept here.
 */
class ProfileController extends Controller
{
    public function __construct(private HrmsAuthClient $hrms) {}

    /**
     * A staff member's profile: contact details, departments, logged time and projects (the
     * last two only for yourself or an admin, as in Perfex).
     */
    public function show(Request $request, ?int $id = null): JsonResponse
    {
        $me = $request->user();
        $user = User::where('company_id', $me->company_id)->findOrFail($id ?? $me->id);
        $own = (int) $user->id === (int) $me->id;
        $extra = StaffProfile::where('user_id', $user->id)->first();

        $departmentIds = DB::table('support_department_user')->where('user_id', $user->id)->pluck('support_department_id');

        return response()->json(['data' => [
            'id' => $user->id,
            'full_name' => $user->full_name,
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'email' => $user->email,
            'mobile' => $user->mobile,
            'employee_code' => $user->employee_code,
            'photo_url' => $user->photoUrl(),
            'is_active' => (bool) $user->is_active,
            'is_own' => $own,
            'facebook' => $extra?->facebook,
            'linkedin' => $extra?->linkedin,
            'skype' => $extra?->skype,
            'email_signature' => $own ? $extra?->email_signature : null,
            'departments' => SupportDepartment::whereIn('id', $departmentIds)->orderBy('name')->pluck('name'),
            'logged_time' => $own || $me->isAdmin() ? Timesheets::stats($user->id) : null,
            'projects' => $own || $me->isAdmin()
                ? Project::whereHas('members', fn ($q) => $q->where('user_id', $user->id))->orderByDesc('id')
                    ->get(['id', 'name', 'start_date', 'deadline', 'status'])
                    ->map(fn ($p) => ['id' => $p->id, 'name' => $p->name, 'start_date' => $p->start_date?->toDateString(), 'deadline' => $p->deadline?->toDateString(), 'status' => $p->status])
                : [],
        ]]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'first_name' => ['required', 'string', 'max:50'],
            'last_name' => ['required', 'string', 'max:50'],
            'mobile' => ['required', 'string', 'max:20'],
            'facebook' => ['nullable', 'url', 'max:255'],
            'linkedin' => ['nullable', 'url', 'max:255'],
            'skype' => ['nullable', 'string', 'max:255'],
            'email_signature' => ['nullable', 'string', 'max:5000'],
        ]);
        $user = $request->user();

        if ($user->isCrmAccount()) {
            $user->forceFill([
                'first_name' => $data['first_name'],
                'last_name' => $data['last_name'],
                'full_name' => trim($data['first_name'].' '.$data['last_name']),
                'mobile' => $data['mobile'],
            ])->save();
        } else {
            $response = $this->send(fn () => $this->hrms->updateProfile($this->hrmsToken($request), [
                'firstname' => $data['first_name'], 'lastname' => $data['last_name'], 'phonenumber' => $data['mobile'],
            ]));
            if (! $response->successful()) {
                return $this->relayError($response);
            }
            $this->refreshFromHrms($user);
        }

        StaffProfile::updateOrCreate(['user_id' => $user->id], [
            'facebook' => $data['facebook'] ?? null,
            'linkedin' => $data['linkedin'] ?? null,
            'skype' => $data['skype'] ?? null,
            'email_signature' => $data['email_signature'] ?? null,
        ]);

        return response()->json(['message' => 'Profile updated.', 'data' => new UserResource($user->fresh())]);
    }

    public function changePassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'old_password' => ['required', 'string'],
            'new_password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $user = $request->user();
        if ($user->isCrmAccount()) {
            if (! Hash::check($data['old_password'], (string) $user->password)) {
                return response()->json(['message' => 'The current password is wrong.', 'errors' => ['old_password' => ['The current password is wrong.']]], 422);
            }
            $user->forceFill(['password' => Hash::make($data['new_password'])])->save();

            return response()->json(['message' => 'Password changed.']);
        }

        $response = $this->send(fn () => $this->hrms->changePassword($this->hrmsToken($request), [
            'old_password' => $data['old_password'],
            'new_password' => $data['new_password'],
            'new_password_confirmation' => $data['new_password'],
        ]));

        return $response->successful()
            ? response()->json(['message' => 'Password changed.'])
            : $this->relayError($response);
    }

    public function changePhoto(Request $request): JsonResponse
    {
        $request->validate(['photo' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048']]);
        $file = $request->file('photo');
        $format = $file->extension() === 'jpeg' ? 'jpg' : $file->extension();

        $user = $request->user();
        if ($user->isCrmAccount()) {
            $old = $user->profile_photo;
            $user->forceFill(['profile_photo' => $file->store('crm-staff', 'public')])->save();
            $old && Storage::disk('public')->delete($old);
        } else {
            $response = $this->send(fn () => $this->hrms->changePhoto($this->hrmsToken($request), "data:image/{$format};base64,".base64_encode($file->get())));
            if (! $response->successful()) {
                return $this->relayError($response);
            }
            $this->refreshFromHrms($user);
        }

        return response()->json(['message' => 'Profile photo updated.', 'data' => new UserResource($request->user()->fresh())]);
    }

    /**
     * The HRMS token kept with this login; without one (signed in while HRMS was down) HRMS
     * cannot be asked, so the change waits for the next HRMS login.
     */
    private function hrmsToken(Request $request): string
    {
        $token = $request->user()->currentAccessToken()?->hrms_token ?? null;
        abort_unless($token, response()->json(['message' => 'HRMS was not reachable when you signed in. Please sign out and sign in again to change your HRMS profile.'], 503));

        return $token;
    }

    /** Pick up what HRMS now has (best effort). */
    private function refreshFromHrms(User $user): void
    {
        try {
            HrmsSync::user($user->id);
        } catch (\Throwable) {
            // The next sync catches up.
        }
    }

    /**
     * @param  callable(): Response  $call
     */
    private function send(callable $call): Response
    {
        try {
            return $call();
        } catch (ConnectionException) {
            abort(response()->json(['message' => 'HRMS is not reachable right now. Please try again.'], 503));
        }
    }

    private function relayError(Response $response): JsonResponse
    {
        $status = in_array($response->status(), [400, 401, 403, 422], true) ? 422 : 502;

        return response()->json(['message' => (string) ($response->json('message') ?: 'HRMS could not save the change.')], $status);
    }
}
