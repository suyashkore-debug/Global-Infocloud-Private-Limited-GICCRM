<?php

namespace App\Models;

use Database\Factories\CompanyFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * An HRMS company (tenant). Read only, managed in HRMS.
 */
class Company extends Model
{
    /** @use HasFactory<CompanyFactory> */
    use HasFactory, SoftDeletes;

    protected $connection = 'hrms';

    protected $table = 'companies';

    /**
     * The company's part of its customers-area link (/portal/login?company=…): the HRMS careers
     * slug, else its short code, else its id.
     */
    public function portalSlug(): string
    {
        return strtolower((string) ($this->public_careers_slug ?: $this->short_code ?: $this->id));
    }

    /**
     * The active company a customers-area link points at, by slug, short code or id.
     */
    public static function findByPortalSlug(?string $slug): ?self
    {
        $slug = strtolower(trim((string) $slug));
        if ($slug === '') {
            return null;
        }

        return self::query()->where('status', 'active')
            ->where(fn ($q) => $q->whereRaw('lower(public_careers_slug) = ?', [$slug])->orWhereRaw('lower(short_code) = ?', [$slug])->orWhere('id', ctype_digit($slug) ? (int) $slug : 0))
            ->first();
    }

    /**
     * The company logo uploaded in HRMS (companies.logo), served from HRMS storage.
     */
    public function logoUrl(): ?string
    {
        $path = $this->getAttributes()['logo'] ?? null;
        if (! $path) {
            return null;
        }
        if (str_starts_with($path, 'http')) {
            return $path;
        }

        return rtrim(config('services.hrms.storage_url'), '/').'/'.ltrim(preg_replace('#^/?(storage/|public/)#', '', $path), '/');
    }
}
