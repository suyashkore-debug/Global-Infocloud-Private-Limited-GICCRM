const dateFormatter = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFormatter = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const moneyFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

/** "2026-10-20" or an ISO timestamp → "20 Oct 2026". */
export function formatDate(value: string | null | undefined): string {
    if (!value) {
        return '—';
    }

    return dateFormatter.format(parseDate(value));
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
    return moneyFormatter.format(Number(value ?? 0));
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
