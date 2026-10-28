import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

interface ToastItem {
    id: number;
    message: string;
    kind: 'success' | 'error';
}

const ToastContext = createContext<(message: string, kind?: 'success' | 'error') => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const show = useCallback((message: string, kind: 'success' | 'error' = 'success') => {
        const id = Date.now() + Math.random();
        setToasts((list) => [...list, { id, message, kind }]);
        setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 4000);
    }, []);

    return (
        <ToastContext.Provider value={show}>
            {children}
            <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        role="status"
                        className="pointer-events-auto flex items-start gap-2.5 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm shadow-lg"
                    >
                        {toast.kind === 'success' ? (
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        ) : (
                            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                        )}
                        <span>{toast.message}</span>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    return useContext(ToastContext);
}
