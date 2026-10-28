import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { api, errorMessage } from '../../../lib/api';
import { TASK_STATUSES, optionById } from '../../../lib/constants';
import { emit, TASKS_CHANGED } from '../../../lib/events';
import { parseDate, toIsoDate, todayIso } from '../../../lib/format';
import { useApi } from '../../../hooks/useApi';
import { useEvent } from '../../../hooks/useEvent';
import { Card, EmptyState, Select, Spinner } from '../../../components/ui';
import { useToast } from '../../../components/ui/Toast';
import { useTaskModals } from '../../../components/tasks/TaskModalHost';
import type { Project } from '../../../types';

type GanttTask = { id: number; name: string; start: string; end: string; status: number; assignees: string[]; can_move: boolean };
type GanttGroup = { key: string; name: string; color: string | null; start: string; end: string; tasks: GanttTask[] };
type GanttData = { project: { start: string; end: string | null }; groups: GanttGroup[] };
type ViewMode = 'day' | 'week' | 'month' | 'year';

const DAY = 86400000;
const ROW = 40;
const HEADER = 56;
/** Pixels per day in each view (Frappe Gantt's Day / Week / Month / Year). */
const SCALE: Record<ViewMode, number> = { day: 34, week: 12, month: 5, year: 1.2 };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const dayIndex = (iso: string, min: Date) => Math.round((parseDate(iso).getTime() - min.getTime()) / DAY);
const addDays = (iso: string, days: number) => toIsoDate(new Date(parseDate(iso).getTime() + days * DAY));

/**
 * Perfex project Gantt: tasks grouped by milestone, member or status, bars coloured by task
 * status, Day / Week / Month / Year views. Drag a bar to move a task, drag its right edge to
 * change the due date; click it to open the task.
 */
export default function GanttTab({ project }: { project: Project }) {
    const toast = useToast();
    const { openTask } = useTaskModals();
    const [status, setStatus] = useState('');
    const [type, setType] = useState<'milestones' | 'members' | 'status'>('milestones');
    const [view, setView] = useState<ViewMode>('month');
    const { data, reload } = useApi<{ data: GanttData }>(`/projects/${project.id}/gantt`, { type, status: status || undefined });
    useEvent([TASKS_CHANGED], reload);
    const gantt = data?.data;
    const scroller = useRef<HTMLDivElement>(null);
    const [drag, setDrag] = useState<{ id: number; mode: 'move' | 'end'; startX: number; delta: number } | null>(null);
    const moved = useRef(false);

    const layout = useMemo(() => {
        if (!gantt || gantt.groups.length === 0) {
            return null;
        }
        const all = gantt.groups.flatMap((g) => [g.start, g.end, ...g.tasks.flatMap((t) => [t.start, t.end])]).filter(Boolean);
        const times = all.map((d) => parseDate(d).getTime());
        let min = new Date(Math.min(...times));
        let max = new Date(Math.max(...times));
        // Whole months around the work, like Frappe Gantt.
        min = new Date(min.getFullYear(), min.getMonth() - (view === 'day' ? 0 : 1), view === 'day' ? min.getDate() - 3 : 1);
        max = new Date(max.getFullYear(), max.getMonth() + 2, 0);
        const days = Math.round((max.getTime() - min.getTime()) / DAY) + 1;

        type Row = { kind: 'group'; group: GanttGroup } | { kind: 'task'; task: GanttTask; group: GanttGroup };
        const rows: Row[] = [];
        for (const raw of gantt.groups) {
            // The group bar covers its own dates and all of its tasks.
            const dates = [raw.start, raw.end, ...raw.tasks.flatMap((t) => [t.start, t.end])].filter(Boolean).sort();
            const g = { ...raw, start: dates[0], end: dates[dates.length - 1] };
            rows.push({ kind: 'group', group: g });
            g.tasks.forEach((task) => rows.push({ kind: 'task', task, group: g }));
        }

        return { min, days, rows };
    }, [gantt, view]);

    // Like Perfex, the chart opens at its start; a new view keeps the left edge.
    useEffect(() => {
        if (scroller.current) {
            scroller.current.scrollLeft = 0;
        }
    }, [type, status, view]);

    // A short timeline stretches to the card's width instead of leaving it half empty.
    const [boxWidth, setBoxWidth] = useState(0);
    useEffect(() => {
        const el = scroller.current;
        if (!el) {
            return;
        }
        const ro = new ResizeObserver(([entry]) => setBoxWidth(entry.contentRect.width));
        ro.observe(el);

        return () => ro.disconnect();
    }, [layout !== null]);

    if (!gantt) {
        return <Spinner />;
    }

    const px = layout && boxWidth ? Math.max(SCALE[view], boxWidth / layout.days) : SCALE[view];
    const toolbar = (
        <div className="mb-3 flex flex-wrap justify-end gap-2">
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-52">
                <option value="">All</option>
                {TASK_STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>
                        {s.name}
                    </option>
                ))}
            </Select>
            <Select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="w-44">
                <option value="milestones">Milestones</option>
                <option value="members">Members</option>
                <option value="status">Status</option>
            </Select>
            <Select value={view} onChange={(e) => setView(e.target.value as ViewMode)} className="w-40">
                <option value="day">Days View</option>
                <option value="week">Weeks View</option>
                <option value="month">Months View</option>
                <option value="year">Years View</option>
            </Select>
        </div>
    );

    if (!layout) {
        return (
            <>
                {toolbar}
                <EmptyState title="Nothing to show yet" text="Add tasks with dates to see the timeline." />
            </>
        );
    }

    const { min, days, rows } = layout;
    const width = days * px;
    const height = HEADER + rows.length * ROW;
    const x = (iso: string) => dayIndex(iso, min) * px;
    const barWidth = (start: string, end: string) => Math.max(px * 0.8, (dayIndex(end, min) - dayIndex(start, min) + 1) * px);

    // Header cells: top line (months or years), bottom line (days, weeks or months).
    const top: { label: string; left: number; width: number }[] = [];
    const bottom: { label: string; left: number; width: number; shade?: boolean }[] = [];
    for (let i = 0; i < days; i++) {
        const d = new Date(min.getTime() + i * DAY);
        const topLabel = view === 'day' || view === 'week' ? `${MONTHS[d.getMonth()]} ${d.getFullYear()}` : String(d.getFullYear());
        if (top.length && top[top.length - 1].label === topLabel) {
            top[top.length - 1].width += px;
        } else {
            top.push({ label: topLabel, left: i * px, width: px });
        }
        if (view === 'day') {
            bottom.push({ label: String(d.getDate()), left: i * px, width: px, shade: d.getDay() === 0 || d.getDay() === 6 });
        } else if (view === 'week') {
            if (d.getDay() === 1 || i === 0) {
                bottom.push({ label: String(d.getDate()), left: i * px, width: 7 * px });
            }
        } else if (d.getDate() === 1 || i === 0) {
            const monthDays = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - d.getDate() + 1;
            bottom.push({ label: view === 'year' ? MONTHS[d.getMonth()].slice(0, 3) : MONTHS[d.getMonth()], left: i * px, width: monthDays * px });
        }
    }
    const today = x(todayIso());

    function begin(e: ReactPointerEvent, task: GanttTask, mode: 'move' | 'end') {
        e.stopPropagation();
        moved.current = false;
        if (!task.can_move) {
            return;
        }
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        setDrag({ id: task.id, mode, startX: e.clientX, delta: 0 });
    }

    function onMove(e: ReactPointerEvent) {
        if (!drag) {
            return;
        }
        const delta = Math.round((e.clientX - drag.startX) / px);
        if (delta !== drag.delta) {
            moved.current = true;
            setDrag({ ...drag, delta });
        }
    }

    async function finish(task: GanttTask) {
        const current = drag;
        setDrag(null);
        if (!current || current.delta === 0) {
            if (!moved.current) {
                openTask(task.id);
            }
            return;
        }
        const start = current.mode === 'move' ? addDays(task.start, current.delta) : task.start;
        let end = addDays(task.end, current.delta);
        if (end < start) {
            end = start;
        }
        try {
            await api.post(`/tasks/${task.id}/dates`, { start_date: start, due_date: end });
            toast(`"${task.name}" moved to ${start} → ${end}.`);
            emit(TASKS_CHANGED);
        } catch (err) {
            toast(errorMessage(err), 'error');
        }
        reload();
    }

    return (
        <>
            {toolbar}
            <Card className="overflow-hidden">
                <div ref={scroller} className="overflow-x-auto" onPointerMove={onMove}>
                    <svg width={width} height={height} className="block select-none text-[12.5px]" style={{ minWidth: '100%' }}>
                        {/* Rows */}
                        {rows.map((row, i) => (
                            <rect key={`bg${i}`} x={0} y={HEADER + i * ROW} width={width} height={ROW} className={i % 2 ? 'fill-white' : 'fill-slate-50'} />
                        ))}
                        {/* Header */}
                        <rect x={0} y={0} width={width} height={HEADER} className="fill-white" />
                        {top.map((c) => (
                            <text key={`t${c.left}`} x={c.left + Math.min(c.width / 2, 600)} y={20} textAnchor="middle" className="fill-slate-500 font-semibold" style={{ fontSize: 13 }}>
                                {c.width > 40 ? c.label : ''}
                            </text>
                        ))}
                        {bottom.map((c) => (
                            <g key={`b${c.left}`}>
                                {c.shade && <rect x={c.left} y={HEADER} width={c.width} height={rows.length * ROW} fill="#94a3b8" opacity={0.08} />}
                                <line x1={c.left} x2={c.left} y1={30} y2={height} className="stroke-slate-200" />
                                <text x={c.left + c.width / 2} y={46} textAnchor="middle" className="fill-slate-600" style={{ fontSize: view === 'day' ? 11 : 13, fontWeight: 500 }}>
                                    {c.width > 14 ? c.label : ''}
                                </text>
                            </g>
                        ))}
                        <line x1={0} x2={width} y1={HEADER} y2={HEADER} className="stroke-slate-300" />
                        {/* Today */}
                        {today >= 0 && today <= width && <rect x={today} y={HEADER} width={Math.max(2, px)} height={rows.length * ROW} className="fill-accent" opacity={0.22} />}

                        {/* Group → task connectors */}
                        {rows.map((row, i) => {
                            if (row.kind !== 'task') {
                                return null;
                            }
                            const groupIndex = rows.findIndex((r) => r.kind === 'group' && r.group.key === row.group.key);
                            const gx = x(row.group.start) + 8;
                            const ty = HEADER + i * ROW + ROW / 2;
                            const tx = x(row.task.start) + (drag?.id === row.task.id && drag.mode === 'move' ? drag.delta * px : 0);
                            const path = tx > gx + 12 ? `M${gx},${HEADER + groupIndex * ROW + ROW - 6} V${ty} H${tx - 4}` : `M${gx},${HEADER + groupIndex * ROW + ROW - 6} V${ty}`;

                            return (
                                <g key={`c${row.task.id}`}>
                                    <path d={path} fill="none" className="stroke-slate-500" strokeWidth={1.3} />
                                    {tx > gx + 12 && <path d={`M${tx - 9},${ty - 4} L${tx - 3},${ty} L${tx - 9},${ty + 4}`} fill="none" className="stroke-slate-500" strokeWidth={1.3} />}
                                </g>
                            );
                        })}

                        {/* Bars */}
                        {rows.map((row, i) => {
                            const y = HEADER + i * ROW + 8;
                            if (row.kind === 'group') {
                                const gx = x(row.group.start);
                                const gw = barWidth(row.group.start, row.group.end);

                                return (
                                    <g key={row.group.key}>
                                        <rect x={gx} y={y} width={gw} height={ROW - 16} rx={3} fill={row.group.color ?? '#4b5563'} opacity={0.9} />
                                        <text x={gw > 160 ? gx + 12 : gx + gw + 8} y={y + (ROW - 16) / 2 + 4.5} className={gw > 160 ? '' : 'fill-slate-700'} fill={gw > 160 ? '#ffffff' : undefined} style={{ fontSize: 13.5, fontWeight: 500 }}>
                                            {row.group.name}
                                        </text>
                                    </g>
                                );
                            }
                            const t = row.task;
                            const shift = drag?.id === t.id ? drag.delta : 0;
                            const start = drag?.id === t.id && drag.mode === 'move' ? addDays(t.start, shift) : t.start;
                            const end = drag?.id === t.id ? addDays(t.end, shift) : t.end;
                            const tx = x(start);
                            const tw = barWidth(start, end < start ? start : end);
                            const color = optionById(TASK_STATUSES, t.status)?.color ?? '#64748b';

                            return (
                                <g key={t.id} className={t.can_move ? 'cursor-grab' : 'cursor-pointer'} onPointerUp={() => finish(t)}>
                                    <title>{`${t.name}\n${start} → ${end}${t.assignees.length ? `\n${t.assignees.join(', ')}` : ''}${t.can_move ? '\nDrag to move · drag the right edge to change the due date' : ''}`}</title>
                                    <rect x={tx} y={y} width={tw} height={ROW - 16} rx={3} fill={color} onPointerDown={(e) => begin(e, t, 'move')} />
                                    {t.can_move && <rect x={tx + tw - 6} y={y} width={6} height={ROW - 16} fill="transparent" className="cursor-ew-resize" onPointerDown={(e) => begin(e, t, 'end')} />}
                                    <text x={tx + tw + 8} y={y + (ROW - 16) / 2 + 4.5} className="fill-slate-800" style={{ fontSize: 13.5 }} onPointerDown={(e) => begin(e, t, 'move')}>
                                        {t.name}
                                    </text>
                                </g>
                            );
                        })}
                    </svg>
                </div>
            </Card>
            <p className="mt-2 text-xs text-gray-500">Click a task to open it. Drag a bar to move the task, or drag its right edge to change the due date.</p>
        </>
    );
}
