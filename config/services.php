<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    // Phone / browser push notifications (PWA): VAPID keys made with Minishlink\WebPush\VAPID.
    'webpush' => [
        'public_key' => env('WEBPUSH_PUBLIC_KEY'),
        'private_key' => env('WEBPUSH_PRIVATE_KEY'),
        'subject' => env('WEBPUSH_SUBJECT') ?: env('APP_URL'),
    ],

    // WhatsApp Business Cloud API (Meta). Each company's number and token are in Setup → WhatsApp.
    'whatsapp' => [
        'graph_url' => env('WHATSAPP_GRAPH_URL', 'https://graph.facebook.com/v21.0'),
    ],

    'hrms' => [
        // Public URL of HRMS's storage (profile photos live there).
        'storage_url' => env('HRMS_STORAGE_URL', 'http://127.0.0.1:8002/storage'),
        // HRMS API that handles every login rule (OTP, 2FA, lockout, company status).
        'api_url' => rtrim((string) env('HRMS_API_URL', 'http://127.0.0.1:8002/api/v1'), '/'),
        'timeout' => (int) env('HRMS_API_TIMEOUT', 20),
    ],

];
