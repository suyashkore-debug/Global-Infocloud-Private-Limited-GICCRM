import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, HelpCircle, PencilLine, Trash2, type LucideIcon } from 'lucide-react';

/**
 * The app's own confirm and prompt dialogs, in place of the browser's ("127.0.0.1 says …"): centred,
 * with the app's look, Enter to accept and Escape to cancel. Call confirmDialog() / promptDialog()
 * from anywhere; <DialogHost /> (mounted once at the root) shows them.
 */

export interface ConfirmOptions {
    /** The question, e.g. 'Delete the form "AS"?'. */
    title: string;
    /** More about it, e.g. "Leads already received are kept." */
    message?: string;
    /** The accept button; worked out from the question when left out ("Delete", "Remove" …). */
    confirmLabel?: string;
    cancelLabel?: string;
    /** Red button and icon (deleting, removing …); worked out from the question when left out. */
    danger?: boolean;
}

export interface PromptOptions {
    title: string;
    message?: string;
    label?: string;
    placeholder?: string;
    defaultValue?: string;
    confirmLabel?: string;
}

type Request =
    | { kind: 'confirm'; options: ConfirmOptions; resolve: (ok: boolean) => void }
    | { kind: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void };

let queue: Request[] = [];
let notify: (() => void) | null = null;

const push = (request: Request) => {
    queue = [...queue, request];
    notify?.();
};

/** Words that start a destructive question, and the button they give. */
const DANGER = /^(delete|remove|clear|discard|decline|leave|cancel the|reset|put the .* back)\b/i;

/**
 * A question split into its title (the first sentence, up to "?") and the rest, e.g.
 * 'Delete the form "AS"? Leads already received are kept.'
 */
function fromText(text: string): ConfirmOptions {
    const at = text.indexOf('? ');
    return at > 0 ? { title: text.slice(0, at + 1), message: text.slice(at + 2) } : { title: text };
}

/** Ask a yes / no question in the app's dialog; resolves true when accepted. */
export function confirmDialog(question: string | ConfirmOptions): Promise<boolean> {
    const options = typeof question === 'string' ? fromText(question) : question;

    return new Promise((resolve) => push({ kind: 'confirm', options, resolve }));
}

/** Ask for a line of text; resolves the text, or null when cancelled. */
export function promptDialog(options: PromptOptions | string): Promise<string | null> {
    return new Promise((resolve) => push({ kind: 'prompt', options: typeof options === 'string' ? { title: options } : options, resolve }));
}

/** Shows the dialogs asked for, one at a time, above everything else. */
export function DialogHost() {
    const [, setTick] = useState(0);
    useEffect(() => {
        notify = () => setTick((t) => t + 1);
        return () => {
            notify = null;
        };
    }, []);

    const current = queue[0];
    if (!current) {
        return null;
    }
    const finish = (value: boolean | string | null) => {
        queue = queue.slice(1);
        if (current.kind === 'confirm') {
            current.resolve(value === true);
        } else {
            current.resolve(typeof value === 'string' ? value : null);
        }
        setTick((t) => t + 1);
    };

    return createPortal(<Dialog key={queue.length + current.options.title} request={current} onDone={finish} />, document.body);
}

function Dialog({ request, onDone }: { request: Request; onDone: (value: boolean | string | null) => void }) {
    const { options } = request;
    const confirm = request.kind === 'confirm' ? request.options : null;
    const danger = confirm ? (confirm.danger ?? DANGER.test(confirm.title)) : false;
    const verb = confirm?.title.match(/^(\w+)/)?.[1] ?? '';
    const acceptLabel = options.confirmLabel ?? (request.kind === 'prompt' ? 'OK' : danger && /^(delete|remove|clear|discard|decline|leave|reset)$/i.test(verb) ? verb.charAt(0).toUpperCase() + verb.slice(1).toLowerCase() : danger ? 'Yes' : 'OK');
    const cancelLabel = (confirm?.cancelLabel ?? 'Cancel');
    const Icon: LucideIcon = request.kind === 'prompt' ? PencilLine : danger ? (/^(delete|remove|clear)/i.test(verb) ? Trash2 : AlertTriangle) : HelpCircle;
    const [value, setValue] = useState(request.kind === 'prompt' ? (request.options.defaultValue ?? '') : '');
    const accept = useRef<HTMLButtonElement>(null);
    const input = useRef<HTMLInputElement>(null);

    useEffect(() => {
        (request.kind === 'prompt' ? input.current : accept.current)?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onDone(request.kind === 'prompt' ? null : false);
            }
        };
        // Captured first, so the Escape does not also close a window behind the dialog.
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    }, [request, onDone]);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        onDone(request.kind === 'prompt' ? value : true);
    };

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="presentation">
            <div className="fade-in absolute inset-0 bg-slate-900/45 backdrop-blur-[3px]" onClick={() => onDone(request.kind === 'prompt' ? null : false)} />
            <form
                onSubmit={submit}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="app-dialog-title"
                className="pop-in relative w-full max-w-[420px] overflow-hidden rounded-3xl bg-white shadow-[0_30px_80px_-20px_rgba(11,44,86,0.45)] ring-1 ring-slate-200/70"
            >
                <div className="px-6 pb-5 pt-7 text-center">
                    <span className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ring-8 ${danger ? 'bg-red-50 text-red-600 ring-red-50/60' : 'bg-brand-50 text-brand ring-brand-50/60'}`}>
                        <Icon className="h-6 w-6" />
                    </span>
                    <h2 id="app-dialog-title" className="mt-4 text-[17px] font-bold leading-snug text-slate-900">
                        {options.title}
                    </h2>
                    {options.message && <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-500">{options.message}</p>}
                    {request.kind === 'prompt' && (
                        <div className="mt-4 text-left">
                            {request.options.label && <label className="mb-1.5 block text-[12.5px] font-semibold text-slate-600">{request.options.label}</label>}
                            <input
                                ref={input}
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                                placeholder={request.options.placeholder}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[14px] text-slate-800 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
                            />
                        </div>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-2.5 border-t border-slate-100 bg-slate-50/70 px-6 py-4">
                    <button
                        type="button"
                        onClick={() => onDone(request.kind === 'prompt' ? null : false)}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[14px] font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-200"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        ref={accept}
                        type="submit"
                        className={`rounded-xl px-4 py-2.5 text-[14px] font-semibold text-white shadow-sm transition focus:outline-none focus-visible:ring-4 ${danger ? 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-200' : 'bg-brand hover:bg-brand-light focus-visible:ring-brand/20'}`}
                    >
                        {acceptLabel}
                    </button>
                </div>
            </form>
        </div>
    );
}
