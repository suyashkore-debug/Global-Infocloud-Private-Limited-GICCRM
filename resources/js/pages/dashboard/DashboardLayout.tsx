import { useCallback, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, RotateCcw } from 'lucide-react';
import { Button, Modal } from '../../components/ui';

export type Span = 'full' | 'two' | 'half' | 'third';

export interface DashWidget {
    id: string;
    label: string;
    span: Span;
    /** null when the user may not see it (or it has nothing to show yet). */
    node: ReactNode | null;
}

type Layout = { order: string[]; hidden: string[] };

const SPANS: Record<Span, string> = {
    full: 'lg:col-span-6',
    two: 'lg:col-span-4',
    half: 'lg:col-span-3',
    third: 'lg:col-span-2',
};

/** The user's own widget order and hidden widgets (Perfex lets each staff member arrange the dashboard), kept in this browser. */
export function useDashboardLayout(userId: number | undefined) {
    const key = `dashboard-layout:${userId ?? 0}`;
    const [layout, setLayout] = useState<Layout>(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
            if (saved && Array.isArray(saved.order) && Array.isArray(saved.hidden)) {
                return saved;
            }
        } catch {
            // No storage: the default layout.
        }
        return { order: [], hidden: [] };
    });
    const save = useCallback(
        (next: Layout) => {
            setLayout(next);
            try {
                localStorage.setItem(key, JSON.stringify(next));
            } catch {
                // Not saved; it still applies until the page reloads.
            }
        },
        [key],
    );

    return { layout, save };
}

/** Widgets in the user's order: saved ones first as arranged, new ones in their default place. */
function arrange(widgets: DashWidget[], order: string[]): DashWidget[] {
    const rank = new Map(order.map((id, i) => [id, i]));
    const defaults = new Map(widgets.map((w, i) => [w.id, i]));
    const pos = (w: DashWidget) => {
        if (rank.has(w.id)) {
            return rank.get(w.id)!;
        }
        // An unsaved widget goes right after the saved widget that precedes it by default.
        const before = widgets
            .slice(0, defaults.get(w.id))
            .reverse()
            .find((o) => rank.has(o.id));
        return before ? rank.get(before.id)! + 0.5 : -1 + defaults.get(w.id)! / 1000;
    };

    return [...widgets].sort((a, b) => pos(a) - pos(b));
}

export function WidgetGrid({ widgets, layout }: { widgets: DashWidget[]; layout: Layout }) {
    const shown = arrange(widgets, layout.order).filter((w) => w.node && !layout.hidden.includes(w.id));

    return (
        <div className="grid grid-flow-row-dense grid-cols-1 gap-5 lg:grid-cols-6">
            {shown.map((w) => (
                <div key={w.id} className={`min-w-0 ${SPANS[w.span]}`}>
                    {w.node}
                </div>
            ))}
        </div>
    );
}

/** "Customize dashboard": show or hide each widget and change the order (drag, or the arrows). */
export function CustomizeDashboard({ widgets, layout, onSave, onClose }: { widgets: DashWidget[]; layout: Layout; onSave: (l: Layout) => void; onClose: () => void }) {
    const available = widgets.filter((w) => w.node);
    const [order, setOrder] = useState(() => arrange(available, layout.order).map((w) => w.id));
    const [hidden, setHidden] = useState<string[]>(layout.hidden);
    const [dragging, setDragging] = useState<string | null>(null);
    const label = (id: string) => available.find((w) => w.id === id)?.label ?? id;
    const move = (from: number, to: number) =>
        setOrder((o) => {
            if (to < 0 || to >= o.length) {
                return o;
            }
            const next = [...o];
            next.splice(to, 0, next.splice(from, 1)[0]);
            return next;
        });

    return (
        <Modal
            open
            size="md"
            title="Customize dashboard"
            onClose={onClose}
            footer={
                <>
                    <Button variant="ghost" onClick={() => (onSave({ order: [], hidden: [] }), onClose())}>
                        <RotateCcw className="h-4 w-4" /> Reset to default
                    </Button>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={() => (onSave({ order, hidden }), onClose())}>Save</Button>
                </>
            }
        >
            <p className="mb-3 text-[13px] text-slate-500">Drag widgets to change their order; use the eye to show or hide one. Only widgets you have access to are listed.</p>
            <ul className="space-y-1.5">
                {order.map((id, i) => {
                    const off = hidden.includes(id);

                    return (
                        <li
                            key={id}
                            draggable
                            onDragStart={() => setDragging(id)}
                            onDragEnd={() => setDragging(null)}
                            onDragOver={(e) => {
                                e.preventDefault();
                                if (dragging && dragging !== id) {
                                    move(order.indexOf(dragging), i);
                                }
                            }}
                            className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition ${dragging === id ? 'border-brand bg-brand-50' : 'border-slate-200 bg-white'} ${off ? 'opacity-60' : ''}`}
                        >
                            <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-slate-400" />
                            <span className={`flex-1 text-[13.5px] font-semibold ${off ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{label(id)}</span>
                            <button
                                type="button"
                                onClick={() => move(i, i - 1)}
                                disabled={i === 0}
                                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                                aria-label="Move up"
                            >
                                <ArrowUp className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => move(i, i + 1)}
                                disabled={i === order.length - 1}
                                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                                aria-label="Move down"
                            >
                                <ArrowDown className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setHidden((h) => (off ? h.filter((x) => x !== id) : [...h, id]))}
                                className={`rounded p-1 hover:bg-slate-100 ${off ? 'text-slate-400' : 'text-brand'}`}
                                aria-label={off ? 'Show' : 'Hide'}
                                title={off ? 'Show' : 'Hide'}
                            >
                                {off ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </Modal>
    );
}
