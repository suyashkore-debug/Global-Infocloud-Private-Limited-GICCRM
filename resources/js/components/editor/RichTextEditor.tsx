import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Bold, Code, Eraser, Heading2, Heading3, Italic, Link2, List, ListOrdered, Minus, Pilcrow, Redo2, Strikethrough, Underline, Undo2 } from 'lucide-react';

/** Old plain text becomes HTML with its line breaks, so it edits like formatted content. */
export function asHtml(value: string | null | undefined): string {
    const v = value ?? '';
    if (!v.trim() || /<(p|br|div|span|strong|b|em|i|u|h[1-6]|ul|ol|li|table|a|img|blockquote|font|hr)\b[^>]*>/i.test(v)) {
        return v;
    }
    const div = document.createElement('div');
    div.textContent = v;

    return div.innerHTML.replace(/\n/g, '<br>');
}

export type RichTextEditorHandle = { insertHtml: (html: string) => void };

/**
 * Formatted text editor for proposals, contracts and templates (Perfex uses TinyMCE here):
 * headings, bold / italic / underline, lists, alignment, links, and pasted tables. "HTML"
 * shows the source. The server cleans whatever is saved.
 */
const RichTextEditor = forwardRef<RichTextEditorHandle, { value: string; onChange: (html: string) => void; placeholder?: string; minHeight?: number }>(function RichTextEditor(
    { value, onChange, placeholder, minHeight = 260 },
    ref,
) {
    const box = useRef<HTMLDivElement>(null);
    const lastEmitted = useRef<string | null>(null);
    const savedRange = useRef<Range | null>(null);
    const [source, setSource] = useState(false);

    // Only replace the editor's HTML when the value changes from outside (not while typing).
    useEffect(() => {
        if (!source && box.current && value !== lastEmitted.current) {
            box.current.innerHTML = asHtml(value);
            lastEmitted.current = value;
        }
    }, [value, source]);

    const emit = () => {
        const html = box.current?.innerHTML ?? '';
        const clean = html === '<br>' ? '' : html;
        lastEmitted.current = clean;
        onChange(clean);
    };

    const remember = () => {
        const sel = window.getSelection();
        if (sel && sel.rangeCount && box.current?.contains(sel.anchorNode)) {
            savedRange.current = sel.getRangeAt(0).cloneRange();
        }
    };

    const restore = () => {
        box.current?.focus();
        const sel = window.getSelection();
        if (savedRange.current && sel) {
            sel.removeAllRanges();
            sel.addRange(savedRange.current);
        }
    };

    const exec = (command: string, arg?: string) => {
        restore();
        document.execCommand(command, false, arg);
        emit();
        remember();
    };

    useImperativeHandle(ref, () => ({
        insertHtml(html: string) {
            if (source) {
                onChange(`${value}${html}`);
                return;
            }
            if (savedRange.current) {
                restore();
                document.execCommand('insertHTML', false, html);
            } else if (box.current) {
                box.current.innerHTML += html;
            }
            emit();
        },
    }));

    const btn = (title: string, icon: ReactNode, onClick: () => void) => (
        <button key={title} type="button" title={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick} className="rounded p-1.5 text-gray-600 hover:bg-gray-200 hover:text-gray-900 disabled:opacity-40" disabled={source}>
            {icon}
        </button>
    );
    const sep = (k: string) => <span key={k} className="mx-1 h-5 w-px bg-gray-300" />;
    const ic = 'h-4 w-4';

    return (
        // preventDefault: inside a <label>, a click would otherwise also "click" the first toolbar button (Undo).
        <div onClick={(e) => e.preventDefault()} className="overflow-hidden rounded-md border border-gray-300 bg-white focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
            <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 bg-gray-50 px-1.5 py-1">
                {btn('Undo', <Undo2 className={ic} />, () => exec('undo'))}
                {btn('Redo', <Redo2 className={ic} />, () => exec('redo'))}
                {sep('s1')}
                {btn('Paragraph', <Pilcrow className={ic} />, () => exec('formatBlock', 'P'))}
                {btn('Heading', <Heading2 className={ic} />, () => exec('formatBlock', 'H2'))}
                {btn('Sub-heading', <Heading3 className={ic} />, () => exec('formatBlock', 'H3'))}
                {sep('s2')}
                {btn('Bold', <Bold className={ic} />, () => exec('bold'))}
                {btn('Italic', <Italic className={ic} />, () => exec('italic'))}
                {btn('Underline', <Underline className={ic} />, () => exec('underline'))}
                {btn('Strikethrough', <Strikethrough className={ic} />, () => exec('strikeThrough'))}
                {sep('s3')}
                {btn('Bulleted list', <List className={ic} />, () => exec('insertUnorderedList'))}
                {btn('Numbered list', <ListOrdered className={ic} />, () => exec('insertOrderedList'))}
                {btn('Align left', <AlignLeft className={ic} />, () => exec('justifyLeft'))}
                {btn('Align centre', <AlignCenter className={ic} />, () => exec('justifyCenter'))}
                {btn('Align right', <AlignRight className={ic} />, () => exec('justifyRight'))}
                {sep('s4')}
                {btn('Link', <Link2 className={ic} />, () => {
                    remember();
                    const url = prompt('Link address (https://…)');
                    if (url) {
                        exec('createLink', url);
                    }
                })}
                {btn('Horizontal line', <Minus className={ic} />, () => exec('insertHorizontalRule'))}
                {btn('Clear formatting', <Eraser className={ic} />, () => exec('removeFormat'))}
                <button
                    type="button"
                    onClick={() => setSource(!source)}
                    className={`ml-auto inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${source ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-200'}`}
                    title="Edit the HTML source"
                >
                    <Code className="h-3.5 w-3.5" /> HTML
                </button>
            </div>
            {source ? (
                <textarea value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} className="block w-full resize-y border-0 p-3 font-mono text-[12.5px] outline-none" style={{ minHeight }} />
            ) : (
                <div
                    ref={box}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={emit}
                    onBlur={() => (remember(), emit())}
                    onKeyUp={remember}
                    onMouseUp={remember}
                    data-placeholder={placeholder}
                    className="rich-content rich-editor max-h-[70vh] overflow-y-auto px-4 py-3 outline-none"
                    style={{ minHeight }}
                />
            )}
        </div>
    );
});

export default RichTextEditor;

/** Shows formatted content that the server has already made safe (content_html). */
export function RichContent({ html, empty, className = '' }: { html: string | null | undefined; empty?: ReactNode; className?: string }) {
    if (!html) {
        return <>{empty ?? null}</>;
    }

    return <div className={`rich-content ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
