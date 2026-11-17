<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Options;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Setup → Menu Setup (Perfex's Menu Setup): the company's own order, names, icons and hidden
 * entries for the sidebar and for the Setup menu. Only how the menu looks: what a person may open
 * still comes from their permissions.
 */
class MenuSetupController extends Controller
{
    /** menu => the option it is kept in */
    private const MENUS = ['sidebar' => 'menu_setup', 'setup' => 'setup_menu_setup'];

    /** Entries that can never be hidden: the way back to Setup, and to Menu Setup itself. */
    private const ALWAYS_SHOWN = ['/settings', 'misc', 'menu-setup'];

    public function show(Request $request): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);

        return response()->json(['data' => collect(self::MENUS)->map(fn ($option) => json_decode(Options::get($option), true) ?: null)]);
    }

    public function update(Request $request, string $menu): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        abort_unless(isset(self::MENUS[$menu]), 404);

        $entry = fn (string $prefix) => [
            "{$prefix}.id" => ['required', 'string', 'max:100'],
            "{$prefix}.hidden" => ['boolean'],
            "{$prefix}.label" => ['nullable', 'string', 'max:60'],
            "{$prefix}.icon" => ['nullable', 'string', 'max:40', 'regex:/^[A-Za-z0-9]+$/'],
        ];
        $data = $request->validate([
            // null: back to the default menu.
            'items' => ['present', 'nullable', 'array', 'max:60'],
            ...$entry('items.*'),
            'items.*.children' => ['nullable', 'array', 'max:60'],
            ...$entry('items.*.children.*'),
        ]);

        $clean = fn (array $e) => array_filter([
            'id' => $e['id'],
            'hidden' => ! empty($e['hidden']) && ! in_array($e['id'], self::ALWAYS_SHOWN, true) ? true : null,
            'label' => trim((string) ($e['label'] ?? '')) ?: null,
            'icon' => $e['icon'] ?? null,
        ], fn ($v) => $v !== null);
        $items = $data['items'] === null ? null : array_map(fn (array $e) => [
            ...$clean($e),
            ...(isset($e['children']) ? ['children' => array_map($clean, $e['children'])] : []),
        ], $data['items']);

        Options::set(self::MENUS[$menu], $items === null ? '' : (string) json_encode($items, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

        return response()->json(['message' => $items === null ? 'Menu reset to default.' : 'Menu saved.', 'data' => $items]);
    }
}
