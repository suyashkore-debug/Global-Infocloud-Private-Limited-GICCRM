import { formatDuration } from '../../lib/format';

export type LoggedTime = { total: number; this_month: number; last_month: number; this_week: number; last_week: number };

/** Perfex staff stats: total / last month / this month / last week / this week logged time. */
export default function LoggedTimeStats({ stats }: { stats: LoggedTime }) {
    const tiles: [string, number][] = [
        ['Total Logged Time', stats.total],
        ['Last Month Logged Time', stats.last_month],
        ['This Month Logged Time', stats.this_month],
        ['Last Week Logged Time', stats.last_week],
        ['This Week Logged Time', stats.this_week],
    ];

    return (
        <div>
            <h5 className="mb-3 text-[15px] font-semibold text-gray-800">Timesheets Summary</h5>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                {tiles.map(([label, seconds]) => (
                    <div key={label} className="panel_s">
                        <div className="panel-body">
                            <p className="truncate text-[13px] text-gray-500" title={label}>
                                {label}
                            </p>
                            <p className="mt-1 text-lg font-semibold text-gray-900">{formatDuration(seconds) || '00:00'}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
