/** The company's way of writing dates, times and money (its country, Setup → Company Information). */
export type AppLocale = { locale: string; timeZone?: string; currency: { name: string; symbol: string; placement: string } };

let current: AppLocale = { locale: 'en-IN', timeZone: undefined, currency: { name: 'INR', symbol: '₹', placement: 'before' } };
let dateFormatter = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
let stampFormatter = dateFormatter;
let dateTimeFormatter = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Set once the company's settings are known (after login); unknown values keep the defaults. */
export function configureLocale(next: Partial<AppLocale>): void {
    const locale = next.locale && Intl.DateTimeFormat.supportedLocalesOf(next.locale).length ? next.locale : current.locale;
    let timeZone = next.timeZone || undefined;
    try {
        new Intl.DateTimeFormat(locale, { timeZone });
    } catch {
        timeZone = undefined;
    }
    current = { locale, timeZone, currency: next.currency ?? current.currency };
    dateFormatter = new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' });
    stampFormatter = new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric', timeZone });
    dateTimeFormatter = new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone });
}

export const appLocale = (): string => current.locale;

/** The company's timezone (undefined: the browser's). */
export const appTimeZone = (): string | undefined => current.timeZone;

export const appCurrency = (): AppLocale['currency'] => current.currency;

/** "2026-10-20" or an ISO timestamp → "20 Oct 2026". */
export function formatDate(value: string | null | undefined): string {
    if (!value) {
        return '—';
    }

    // A plain date is a calendar day; a timestamp is read in the company's timezone.
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? dateFormatter.format(parseDate(value)) : stampFormatter.format(new Date(value));
}

export function formatDateTime(value: string | null | undefined): string {
    return value ? dateTimeFormatter.format(new Date(value)) : '—';
}

/** Seconds → "h:mm" (Perfex shows logged time this way). */
export function formatDuration(seconds: number | null | undefined): string {
    const total = Math.max(0, Math.floor(seconds ?? 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);

    return `${hours}:${String(minutes).padStart(2, '0')}`;
}

/** Seconds → "01:02:03" for a running timer. */
export function formatClock(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    const pad = (n: number) => String(n).padStart(2, '0');

    return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

export function formatMoney(value: number | string | null | undefined): string {
    const amount = Number(value ?? 0).toLocaleString(current.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    return current.currency.placement === 'after' ? `${amount} ${current.currency.symbol}` : `${current.currency.symbol}${amount}`;
}

export function formatBytes(bytes: number): string {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function timeAgo(value: string): string {
    const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
    if (seconds < 60) {
        return 'just now';
    }
    const steps: [number, string][] = [
        [60, 'minute'],
        [3600, 'hour'],
        [86400, 'day'],
        [604800, 'week'],
    ];
    for (let i = steps.length - 1; i >= 0; i--) {
        const [size, unit] = steps[i];
        if (seconds >= size) {
            const count = Math.floor(seconds / size);
            if (unit === 'week' && count > 4) {
                return formatDate(value);
            }

            return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
        }
    }

    return formatDate(value);
}

export function todayIso(): string {
    return toIsoDate(new Date());
}

export function toIsoDate(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Date-only strings are read as local dates, so "2026-10-20" never shifts a day. */
export function parseDate(value: string): Date {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [y, m, d] = value.split('-').map(Number);

        return new Date(y, m - 1, d);
    }

    return new Date(value);
}

export function isOverdue(dueDate: string | null | undefined, status: number): boolean {
    return !!dueDate && status !== 5 && parseDate(dueDate) < parseDate(todayIso());
}

/**
 * The serial number shown in a list's "#" column: 1, 2, 3… continuing on later pages (page 2 of
 * 25 a page starts at 26), from the page's meta.
 */
export function rowNumber(meta: { from?: unknown; current_page?: unknown; per_page?: unknown } | undefined, index: number): number {
    const from = Number(meta?.from);
    if (from > 0) {
        return from + index;
    }

    return (Math.max(1, Number(meta?.current_page) || 1) - 1) * (Number(meta?.per_page) || 0) + index + 1;
}
