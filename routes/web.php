<?php

use Illuminate\Support\Facades\Route;

// The React app handles every page; the API lives under /api.
Route::view('/{any?}', 'app')->where('any', '^(?!api).*$');
