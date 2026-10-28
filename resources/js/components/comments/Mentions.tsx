import { useMemo, useRef, useState } from 'react';
import { AtSign, Paperclip, Send } from 'lucide-react';
import type { Staff } from '../../types';
import { Avatar, Button, inputClass } from '../ui';

const TOKEN = /@\[([^\]]*)\]\((\d+)\)/g;

/** Plain-text comment with @[Name](id) mentions shown as highlighted names. */
export function MentionText({ text }: { text: string | null }) {
    if (!text) {
        return null;
    }
    const parts: (string | { name: string })[] = [];
    let last = 0;
    for (const match of text.matchAll(TOKEN)) {
        parts.push(text.slice(last, match.index));
        parts.push({ name: match[1] });
        last = (match.index ?? 0) + match[0].length;
    }
    parts.push(text.slice(last));

    return (
        <p className="whitespace-pre-wrap break-words text-sm text-gray-700">
            {parts.map((part, i) =>
                typeof part === 'string' ? (
                    part
                ) : (
                    <span key={i} className="rounded bg-blue-50 px-1 font-medium text-blue-700">
                        @{part.name}
                    </span>
                ),
            )}
        </p>
    );
}

/**
 * Comment input: typing "@" (or the @ button) opens a staff list; picking someone inserts
 * @[Name](id). Optional file attachments.
 */
export function CommentBox({
    staff,
    onSubmit,
    placeholder = 'Add comment… (type @ to mention)',
    allowFiles = false,
    initial = '',
    submitLabel = 'Comment',
    onCancel,
}: {
    staff: Staff[];
    onSubmit: (content: string, files: File[]) => Promise<void>;
    placeholder?: string;
    allowFiles?: boolean;
    initial?: string;
    submitLabel?: string;
    onCancel?: () => void;
}) {
    const [text, setText] = useState(initial);
    const [files, setFiles] = useState<File[]>([]);
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const ref = useRef<HTMLTextAreaElement>(null);

    const matches = useMemo(() => {
        if (mentionQuery === null) {
            return [];
        }
        const q = mentionQuery.toLowerCase();

        return staff.filter((s) => s.full_name.toLowerCase().includes(q)).slice(0, 6);
    }, [staff, mentionQuery]);

    function onChange(value: string) {
        setText(value);
        const caret = ref.current?.selectionStart ?? value.length;
        const before = value.slice(0, caret);
        const at = before.match(/(?:^|\s)@([\w ]{0,30})$/);
        setMentionQuery(at ? at[1] : null);
    }

    function pick(person: Staff) {
        const caret = ref.current?.selectionStart ?? text.length;
        const before = text.slice(0, caret).replace(/@([\w ]{0,30})$/, '');
        const after = text.slice(caret);
        const next = `${before}@[${person.full_name}](${person.id}) ${after}`;
        setText(next);
        setMentionQuery(null);
        requestAnimationFrame(() => ref.current?.focus());
    }

    async function submit() {
        if (!text.trim() && files.length === 0) {
            return;
        }
        setBusy(true);
        try {
            await onSubmit(text.trim(), files);
            setText('');
            setFiles([]);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="relative space-y-2">
            <textarea
                ref={ref}
                rows={3}
                value={text}
                placeholder={placeholder}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        submit();
                    }
                }}
                className={inputClass}
            />
            {matches.length > 0 && (
                <ul className="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                    {matches.map((person) => (
                        <li key={person.id}>
                            <button type="button" onClick={() => pick(person)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50">
                                <Avatar id={person.id} name={person.full_name} size="sm" />
                                {person.full_name}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {files.length > 0 && <p className="text-xs text-gray-500">{files.map((f) => f.name).join(', ')}</p>}
            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    title="Mention someone"
                    onClick={() => {
                        onChange(`${text}${text && !text.endsWith(' ') ? ' ' : ''}@`);
                        ref.current?.focus();
                    }}
                    className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
                >
                    <AtSign className="h-4 w-4" />
                </button>
                {allowFiles && (
                    <label className="cursor-pointer rounded-lg p-1.5 text-gray-500 hover:bg-gray-100" title="Attach files">
                        <Paperclip className="h-4 w-4" />
                        <input type="file" multiple className="hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
                    </label>
                )}
                <div className="ml-auto flex gap-2">
                    {onCancel && (
                        <Button variant="secondary" size="sm" onClick={onCancel}>
                            Cancel
                        </Button>
                    )}
                    <Button size="sm" onClick={submit} loading={busy} disabled={!text.trim() && files.length === 0}>
                        <Send className="h-3.5 w-3.5" /> {submitLabel}
                    </Button>
                </div>
            </div>
        </div>
    );
}
