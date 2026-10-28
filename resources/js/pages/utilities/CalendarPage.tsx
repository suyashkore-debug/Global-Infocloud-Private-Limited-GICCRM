import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { toIsoDate } from '../../lib/format';
import { useApi } from '../../hooks/useApi';
import { Button, Checkbox, Field, Input, Modal, Select, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { useAppOptions } from '../../hooks/useAppOptions';

interface CalendarItem {
    id: string;
    event_id?: number;
    type: string;
    title: string;
    description?: string | null;
    start: string;
    end?: string | null;
    color: string;
    public?: boolean;
    editable?: boolean;
    link?: string;
    author?: string | null;
    reminder_before?: number;
    reminder_before_type?: string;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Perfex Utilities → Calendar (month view). */
export default function CalendarPage() {
    const navigate = useNavigate();
    const toast = useToast();
    const [month, setMonth] = useState(() => {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth(), 1);
    });
    const [editing, setEditing] = useState<{ open: boolean; item: CalendarItem | null; date?: string }>({ open: false, item: null });
    const appOptions = useAppOptions();
    // Settings → Calendar "First day" (0 Sunday … 6 Saturday).
    const firstDay = Number(appOptions?.calendar_first_day ?? 1) || 0;
    const weekdays = [...WEEKDAYS.slice(firstDay), ...WEEKDAYS.slice(0, firstDay)];
    const days = useMemo(() => {
        const first = new Date(month);
        const offset = (first.getDay() - firstDay + 7) % 7;
        const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
        return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    }, [month, firstDay]);
    const { data, reload } = useApi<{ data: CalendarItem[] }>('/calendar', { start: toIsoDate(days[0]), end: toIsoDate(days[41]) });

    const byDay = useMemo(() => {
        const map = new Map<string, CalendarItem[]>();
        for (const item of data?.data ?? []) {
            const key = item.start.slice(0, 10);
            map.set(key, [...(map.get(key) ?? []), item]);
        }
        return map;
    }, [data]);

    function openItem(item: CalendarItem) {
        if (item.type === 'event') {
            setEditing({ open: true, item });
        } else if (item.link?.startsWith('?')) {
            navigate(`/tasks${item.link}`);
        } else if (item.link) {
            navigate(item.link);
        }
    }

    const today = toIsoDate(new Date());

    return (
        <div className="w-full space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <h4 className="page-title mr-auto">Calendar</h4>
                <Button variant="secondary" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="w-40 text-center font-semibold">{month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</span>
                <Button variant="secondary" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
                    <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="secondary" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>
                    Today
                </Button>
                <Button onClick={() => setEditing({ open: true, item: null, date: today })}>
                    <Plus className="h-4 w-4" /> New Event
                </Button>
            </div>
            <div className="panel_s overflow-hidden">
                <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50 text-center text-xs font-semibold text-gray-600">
                    {weekdays.map((d) => (
                        <div key={d} className="py-2">
                            {d}
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-7">
                    {days.map((day) => {
                        const key = toIsoDate(day);
                        const inMonth = day.getMonth() === month.getMonth();
                        const items = byDay.get(key) ?? [];

                        return (
                            <div
                                key={key}
                                onDoubleClick={() => setEditing({ open: true, item: null, date: key })}
                                className={`min-h-[110px] border-b border-r border-gray-100 p-1.5 ${inMonth ? 'bg-white' : 'bg-gray-50 text-gray-400'}`}
                            >
                                <div className={`mb-1 text-right text-xs ${key === today ? 'font-bold text-blue-600' : ''}`}>{day.getDate()}</div>
                                <div className="space-y-0.5">
                                    {items.slice(0, 4).map((item) => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => openItem(item)}
                                            title={item.title}
                                            className="block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-white"
                                            style={{ backgroundColor: item.color }}
                                        >
                                            {item.title}
                                        </button>
                                    ))}
                                    {items.length > 4 && <p className="px-1 text-[11px] text-gray-500">+{items.length - 4} more</p>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            <p className="text-xs text-gray-500">Double-click a day to add an event. Tasks, invoices, estimates, projects, contracts and your reminders are shown automatically.</p>
            <EventModal
                state={editing}
                onClose={() => setEditing({ open: false, item: null })}
                onSaved={() => {
                    setEditing({ open: false, item: null });
                    reload();
                }}
                onError={(e) => toast(errorMessage(e), 'error')}
            />
        </div>
    );
}

function EventModal({ state, onClose, onSaved, onError }: { state: { open: boolean; item: CalendarItem | null; date?: string }; onClose: () => void; onSaved: () => void; onError: (e: unknown) => void }) {
    const item = state.item;
    const readOnly = !!item && !item.editable;
    const [form, setForm] = useState({ title: '', description: '', start: '', end: '', public: false, color: '#28B8DA', reminder_before: '0', reminder_before_type: 'minutes' });
    const [lastKey, setLastKey] = useState('');
    const key = `${state.open}-${item?.id ?? state.date}`;
    if (state.open && key !== lastKey) {
        setLastKey(key);
        setForm({
            title: item?.title ?? '',
            description: item?.description ?? '',
            start: item ? item.start.slice(0, 16).replace(' ', 'T') : `${state.date}T09:00`,
            end: item?.end ? item.end.slice(0, 16).replace(' ', 'T') : '',
            public: item?.public ?? false,
            color: item?.color ?? '#28B8DA',
            reminder_before: String(item?.reminder_before ?? 0),
            reminder_before_type: item?.reminder_before_type ?? 'minutes',
        });
    }

    async function save() {
        const payload = { ...form, end: form.end || null, reminder_before: Number(form.reminder_before) };
        try {
            if (item?.event_id) {
                await api.put(`/calendar/events/${item.event_id}`, payload);
            } else {
                await api.post('/calendar/events', payload);
            }
            onSaved();
        } catch (e) {
            onError(e);
        }
    }

    async function remove() {
        if (item?.event_id && confirm('Delete this event?')) {
            await api.delete(`/calendar/events/${item.event_id}`);
            onSaved();
        }
    }

    return (
        <Modal
            open={state.open}
            onClose={onClose}
            title={item ? (readOnly ? item.title : 'Edit Event') : 'New Event'}
            footer={
                readOnly ? (
                    <Button variant="secondary" onClick={onClose}>
                        Close
                    </Button>
                ) : (
                    <>
                        {item && (
                            <Button variant="danger" onClick={remove} className="mr-auto">
                                Delete
                            </Button>
                        )}
                        <Button variant="secondary" onClick={onClose}>
                            Close
                        </Button>
                        <Button onClick={save}>Save</Button>
                    </>
                )
            }
        >
            {readOnly ? (
                <div className="space-y-2 text-[13.5px]">
                    <p>{item?.description}</p>
                    <p className="text-gray-500">{item?.start}</p>
                    {item?.author && <p className="text-gray-500">By {item.author}</p>}
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Event Title" required className="sm:col-span-2">
                        <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                    </Field>
                    <Field label="Description" className="sm:col-span-2">
                        <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                    </Field>
                    <Field label="Start Date" required>
                        <Input type="datetime-local" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
                    </Field>
                    <Field label="End Date">
                        <Input type="datetime-local" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
                    </Field>
                    <Field label="Notify before">
                        <div className="flex gap-2">
                            <Input type="number" min={0} value={form.reminder_before} onChange={(e) => setForm({ ...form, reminder_before: e.target.value })} className="w-24" />
                            <Select value={form.reminder_before_type} onChange={(e) => setForm({ ...form, reminder_before_type: e.target.value })}>
                                <option value="minutes">Minutes</option>
                                <option value="hours">Hours</option>
                                <option value="days">Days</option>
                                <option value="weeks">Weeks</option>
                            </Select>
                        </div>
                    </Field>
                    <Field label="Color">
                        <Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-10 w-20 p-1" />
                    </Field>
                    <Checkbox label="Public event (all staff see it)" checked={form.public} onChange={(v) => setForm({ ...form, public: v })} />
                </div>
            )}
        </Modal>
    );
}
