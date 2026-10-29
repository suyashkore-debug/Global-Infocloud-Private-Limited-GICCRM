/**
 * Click-to-sort for every list table (.table-perfex): clicking a column heading sorts the rows by
 * that column, ascending, then descending. Values are read from the cells as shown, so dates
 * ("20 Oct 2026", "3 hours ago"), money ("₹1,250.00") and plain numbers sort by value, not as text;
 * empty cells ("—") always go last. The rows on screen are sorted (one page of a paged list).
 *
 * Tables opt out with data-nosort (document line items, grouped reports); tables with editable
 * rows or rows spanning several columns are left alone.
 *
 * React keeps rendering the rows; when it re-renders them (new page, reload) the chosen order is
 * applied again.
 */

type Dir = 'asc' | 'desc';
interface SortState {
    col: number;
    dir: Dir;
    observer: MutationObserver;
}

const states = new WeakMap<HTMLTableElement, SortState>();

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const UNIT_MS: Record<string, number> = { second: 1e3, minute: 6e4, hour: 36e5, day: 864e5, week: 6048e5, month: 2592e6, year: 31536e6 };
const EMPTY = new Set(['', '—', '-', '–', 'n/a']);

/** A cell's sort key: a number when the text is a date, an amount or a number, else the text. */
export function sortKey(text: string): number | string | null {
    const t = text.replace(/\s+/g, ' ').trim();
    if (EMPTY.has(t.toLowerCase())) {
        return null;
    }

    // "20 Oct 2026" or "20 Oct 2026, 06:44 pm"
    let m = t.match(/^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4})(?:,? (\d{1,2}):(\d{2})\s*([ap]m)?)?/i);
    if (m && MONTHS[m[2].toLowerCase()] !== undefined) {
        let hours = m[4] ? Number(m[4]) % 12 : 0;
        if (m[6]?.toLowerCase() === 'pm') {
            hours += 12;
        } else if (m[4] && !m[6]) {
            hours = Number(m[4]);
        }
        return new Date(Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]), hours, m[5] ? Number(m[5]) : 0).getTime();
    }
    // "2026-10-28" or "28-10-2026"
    m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
        return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
    }
    m = t.match(/^(\d{2})[-/.](\d{2})[-/.](\d{4})/);
    if (m) {
        return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime();
    }
    // "3 hours ago", "a day ago", "just now"
    if (/^just now$/i.test(t)) {
        return Date.now();
    }
    m = t.match(/^(\d+|an?) (second|minute|hour|day|week|month|year)s? ago$/i);
    if (m) {
        return Date.now() - (/^an?$/i.test(m[1]) ? 1 : Number(m[1])) * UNIT_MS[m[2].toLowerCase()];
    }
    // Money, numbers, percentages, durations "h:mm": "₹1,23,456.50", "-12.5%", "1,250 $", "3:45"
    m = t.match(/^(-)?\s*[₹$€£]?\s*(-)?([\d,]+(?:\.\d+)?)\s*(?:%|[₹$€£]|[A-Z]{3})?$/);
    if (m) {
        const value = Number(m[3].replace(/,/g, ''));
        return m[1] || m[2] ? -value : value;
    }
    m = t.match(/^(\d+):(\d{2})$/);
    if (m) {
        return Number(m[1]) * 60 + Number(m[2]);
    }

    return t.toLowerCase();
}

/** A cell may state its own sort value (data-sort-value), e.g. a star rating with no text. */
function cellKey(cell: HTMLTableCellElement): number | string | null {
    const own = cell.dataset.sortValue ?? cell.querySelector<HTMLElement>('[data-sort-value]')?.dataset.sortValue;
    return sortKey(own ?? cell.textContent ?? '');
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function compare(a: number | string | null, b: number | string | null): number {
    if (typeof a === 'number' && typeof b === 'number') {
        return a - b;
    }
    if (typeof a === 'number') {
        return -1;
    }
    if (typeof b === 'number') {
        return 1;
    }
    return collator.compare(a ?? '', b ?? '');
}

/** Whether the table's rows can be reordered: no data-nosort, no editable or grouped rows. */
function sortable(table: HTMLTableElement): boolean {
    if (table.hasAttribute('data-nosort') || !table.tHead || table.tBodies.length !== 1) {
        return false;
    }
    const body = table.tBodies[0];
    if (body.querySelector('input:not([type="checkbox"]), select, textarea, [contenteditable="true"]')) {
        return false;
    }
    const rows = Array.from(body.rows);
    // A lone "No records" / loading row is fine; several rows with a spanning cell are groups.
    return rows.length < 2 || !rows.some((r) => Array.from(r.cells).some((c) => c.colSpan > 1 || c.rowSpan > 1));
}

function headerSortable(th: HTMLTableCellElement): boolean {
    return th.textContent!.trim() !== '' && !th.querySelector('input, button, select') && !th.hasAttribute('data-nosort');
}

function apply(table: HTMLTableElement, state: SortState) {
    const body = table.tBodies[0];
    if (!body) {
        return;
    }
    const rows = Array.from(body.rows);
    if (rows.length < 2 || rows.some((r) => r.cells.length <= state.col)) {
        return;
    }
    const keyed = rows.map((row) => ({ row, key: cellKey(row.cells[state.col]) }));
    keyed.sort((x, y) => {
        // Empty values stay at the bottom either way.
        if (x.key === null || y.key === null) {
            return x.key === y.key ? 0 : x.key === null ? 1 : -1;
        }
        const c = compare(x.key, y.key);
        return state.dir === 'asc' ? c : -c;
    });
    if (keyed.every((k, i) => k.row === rows[i])) {
        return;
    }
    state.observer.disconnect();
    keyed.forEach((k) => body.appendChild(k.row));
    state.observer.takeRecords();
    state.observer.observe(body, { childList: true });
}

function markHeaders(table: HTMLTableElement, state: SortState | undefined) {
    table.tHead?.querySelectorAll<HTMLTableCellElement>('th').forEach((th) => {
        if (state && th.cellIndex === state.col) {
            th.dataset.sort = state.dir;
            th.setAttribute('aria-sort', state.dir === 'asc' ? 'ascending' : 'descending');
        } else {
            delete th.dataset.sort;
            th.removeAttribute('aria-sort');
        }
    });
}

function onClick(e: MouseEvent) {
    const target = e.target as Element | null;
    const th = target?.closest?.('th') as HTMLTableCellElement | null;
    if (!th || target!.closest('input, button, a, select, label')) {
        return;
    }
    const table = th.closest('table.table-perfex') as HTMLTableElement | null;
    if (!table || !table.tHead?.contains(th) || !sortable(table) || !headerSortable(th)) {
        return;
    }

    const previous = states.get(table);
    const dir: Dir = previous && previous.col === th.cellIndex && previous.dir === 'asc' ? 'desc' : 'asc';
    previous?.observer.disconnect();
    const state: SortState = {
        col: th.cellIndex,
        dir,
        // React re-rendered the rows (new page, reload): sort them again.
        observer: new MutationObserver(() => {
            if (table.isConnected && sortable(table)) {
                apply(table, state);
            }
        }),
    };
    states.set(table, state);
    markHeaders(table, state);
    apply(table, state);
    state.observer.observe(table.tBodies[0], { childList: true });
}

/** Tags sortable tables so their headings look clickable (see .table-perfex[data-sortable]). */
function tagTables() {
    document.querySelectorAll<HTMLTableElement>('table.table-perfex').forEach((table) => {
        const ok = sortable(table);
        if (ok !== table.hasAttribute('data-sortable')) {
            table.toggleAttribute('data-sortable', ok);
        }
        if (ok) {
            table.tHead?.querySelectorAll<HTMLTableCellElement>('th').forEach((th) => {
                const on = headerSortable(th);
                if (on !== th.hasAttribute('data-sortable')) {
                    th.toggleAttribute('data-sortable', on);
                }
            });
        }
    });
}

let started = false;

export function enableTableSorting() {
    if (started) {
        return;
    }
    started = true;
    document.addEventListener('click', onClick);

    let queued = false;
    const schedule = () => {
        if (!queued) {
            queued = true;
            requestAnimationFrame(() => {
                queued = false;
                tagTables();
            });
        }
    };
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    schedule();
}
