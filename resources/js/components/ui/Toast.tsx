import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, X } from 'lucide-react';

type Kind = 'success' | 'error';

interface ToastItem {
    id: number;
    message: string;
    kind: Kind;
}

/** How long a toast stays: errors a little longer, so there is time to read them. */
const DURATION: Record<Kind, number> = { success: 4000, error: 6500 };
const MAX_SHOWN = 4;

const STYLE: Record<Kind, { title: string; chip: string; bar: string; ring: string }> = {
    success: { title: 'Done', chip: 'bg-[linear-gradient(135deg,#34d399,#059669)]', bar: 'bg-emerald-500', ring: 'ring-emerald-100' },
    error: { title: 'Something went wrong', chip: 'bg-[linear-gradient(135deg,#f87171,#dc2626)]', bar: 'bg-red-500', ring: 'ring-red-100' },
};

const ToastContext = createContext<(message: string, kind?: Kind) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const show = useCallback((message: string, kind: Kind = 'success') => {
        const id = Date.now() + Math.random();
        setToasts((list) => [...list, { id, message, kind }].slice(-MAX_SHOWN));
    }, []);
    const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

    return (
        <ToastContext.Provider value={show}>
            {children}
            <div aria-live="polite" className="pointer-events-none fixed bottom-24 right-4 z-[100] lg:bottom-4 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2.5">
                {toasts.map((toast) => (
                    <ToastCard key={toast.id} toast={toast} onDismiss={dismiss} />
                ))}
            </div>
        </ToastContext.Provider>
    );
}

/**
 * One toast: a coloured icon chip, a title and the message, a close button and a bar that runs
 * down until it goes. Hovering pauses it.
 */
function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
    const style = STYLE[toast.kind];
    const total = DURATION[toast.kind];
    const [paused, setPaused] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const remaining = useRef(total);
    const startedAt = useRef(Date.now());

    const close = useCallback(() => {
        setLeaving(true);
        setTimeout(() => onDismiss(toast.id), 180);
    }, [onDismiss, toast.id]);

    useEffect(() => {
        if (paused || leaving) {
            return;
        }
        startedAt.current = Date.now();
        const timer = setTimeout(close, remaining.current);

        return () => {
            clearTimeout(timer);
            remaining.current -= Date.now() - startedAt.current;
        };
    }, [paused, leaving, close]);

    return (
        <div
            role={toast.kind === 'error' ? 'alert' : 'status'}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            className={`slide-in-right pointer-events-auto relative overflow-hidden rounded-2xl bg-white shadow-[0_18px_40px_-14px_rgba(8,33,63,0.35)] ring-1 transition duration-200 ${style.ring} ${leaving ? 'translate-x-6 opacity-0' : ''}`}
        >
            <div className="flex items-start gap-3 py-3 pl-3.5 pr-2.5">
                <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white shadow-sm ${style.chip}`}>
                    {toast.kind === 'success' ? <Check className="h-4 w-4" strokeWidth={3} /> : <X className="h-4 w-4" strokeWidth={3} />}
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-[13.5px] font-bold text-slate-800">{style.title}</p>
                    <p className="mt-0.5 break-words text-[13px] leading-snug text-slate-600">{toast.message}</p>
                </div>
                <button type="button" onClick={close} aria-label="Dismiss" className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                    <X className="h-4 w-4" />
                </button>
            </div>
            <span
                className={`toast-timer absolute bottom-0 left-0 h-[3px] w-full origin-left ${style.bar}`}
                style={{ animationDuration: `${total}ms`, animationPlayState: paused ? 'paused' : 'running' }}
            />
        </div>
    );
}

export function useToast() {
    return useContext(ToastContext);
}
