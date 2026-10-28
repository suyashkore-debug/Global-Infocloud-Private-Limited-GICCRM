<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * A support department (Perfex Setup → Support → Departments) with its staff members.
 */
class SupportDepartment extends Model
{
    use BelongsToCompany;

    protected $fillable = ['company_id', 'name', 'email', 'hide_from_client'];

    protected function casts(): array
    {
        return ['hide_from_client' => 'boolean'];
    }

    /**
     * @return array<int, int>
     */
    public function memberIds(): array
    {
        return DB::table('support_department_user')->where('support_department_id', $this->id)->pluck('user_id')->map(fn ($id) => (int) $id)->all();
    }

    /**
     * @param  array<int, int>  $userIds
     */
    public function syncMembers(array $userIds): void
    {
        DB::table('support_department_user')->where('support_department_id', $this->id)->delete();
        DB::table('support_department_user')->insert(array_map(fn ($id) => ['support_department_id' => $this->id, 'user_id' => $id], array_unique($userIds)));
    }
}
