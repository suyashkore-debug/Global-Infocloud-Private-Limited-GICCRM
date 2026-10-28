import { useCallback, useEffect, useState } from 'react';
import { FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { Button, Field, Input, Modal } from '../ui';
import { useToast } from '../ui/Toast';
import RichTextEditor from './RichTextEditor';

type TemplateRow = { id: number; name: string; author: string | null; is_own: boolean; can_manage: boolean };

/**
 * Perfex "Templates" next to the proposal / contract content: insert one into the editor, or
 * add, edit and delete templates (the author or an admin changes a template).
 */
export default function TemplatesPanel({ type, currentContent, onInsert }: { type: 'proposals' | 'contracts'; currentContent: string; onInsert: (html: string) => void }) {
    const toast = useToast();
    const [rows, setRows] = useState<TemplateRow[] | null>(null);
    const [editing, setEditing] = useState<{ id?: number; name: string; content: string } | null>(null);

    const load = useCallback(() => {
        api.get<{ data: TemplateRow[] }>('/templates', { params: { type } })
            .then((r) => setRows(r.data.data))
            .catch(() => setRows([]));
    }, [type]);
    useEffect(load, [load]);

    async function insert(row: TemplateRow) {
        try {
            const { data } = await api.get<{ data: { content_html: string } }>(`/templates/${row.id}`);
            onInsert(data.data.content_html);
            toast(`Template "${row.name}" inserted.`);
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    async function edit(row: TemplateRow) {
        const { data } = await api.get<{ data: { content: string | null } }>(`/templates/${row.id}`);
        setEditing({ id: row.id, name: row.name, content: data.data.content ?? '' });
    }

    async function remove(row: TemplateRow) {
        if (!confirm(`Delete the template "${row.name}"?`)) {
            return;
        }
        await api.delete(`/templates/${row.id}`);
        toast('Template deleted.');
        load();
    }

    async function save() {
        if (!editing) {
            return;
        }
        try {
            const body = { type, name: editing.name, content: editing.content };
            await (editing.id ? api.put(`/templates/${editing.id}`, body) : api.post('/templates', body));
            toast(editing.id ? 'Template updated.' : 'Template added.');
            setEditing(null);
            load();
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    return (
        <div className="rounded-lg border border-gray-200 bg-gray-50/60">
            <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
                <span className="text-[13px] font-semibold text-gray-700">Templates</span>
                <div className="flex gap-1">
                    {currentContent.trim() && (
                        <button type="button" onClick={() => setEditing({ name: '', content: currentContent })} className="rounded px-1.5 py-0.5 text-[12px] text-blue-600 hover:bg-blue-50" title="Save the current content as a template">
                            Save current
                        </button>
                    )}
                    <button type="button" onClick={() => setEditing({ name: '', content: '' })} className="rounded p-1 text-blue-600 hover:bg-blue-50" title="Add template">
                        <Plus className="h-4 w-4" />
                    </button>
                </div>
            </div>
            <div className="max-h-[420px] overflow-y-auto p-1.5">
                {rows === null && <p className="px-2 py-3 text-xs text-gray-400">Loading…</p>}
                {rows?.length === 0 && <p className="px-2 py-3 text-xs text-gray-500">No templates yet. Add one with +.</p>}
                {rows?.map((row) => (
                    <div key={row.id} className="group rounded-md px-2 py-1.5 hover:bg-white">
                        <div className="flex items-start gap-1.5">
                            <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-medium text-gray-800" title={row.name}>
                                    {row.name}
                                </span>
                                {!row.is_own && row.author && <span className="block truncate text-[11px] text-gray-400">by {row.author}</span>}
                            </span>
                        </div>
                        <div className="mt-1 flex gap-2 pl-5 text-[12px]">
                            <button type="button" onClick={() => insert(row)} className="font-medium text-blue-600 hover:underline">
                                Insert
                            </button>
                            {row.can_manage && (
                                <>
                                    <button type="button" onClick={() => edit(row)} className="text-gray-500 hover:text-gray-800" title="Edit">
                                        <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button type="button" onClick={() => remove(row)} className="text-gray-500 hover:text-red-600" title="Delete">
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {editing && (
                <Modal
                    open
                    size="xl"
                    title={editing.id ? 'Edit template' : 'Add template'}
                    onClose={() => setEditing(null)}
                    footer={
                        <>
                            <Button variant="secondary" onClick={() => setEditing(null)}>
                                Cancel
                            </Button>
                            <Button onClick={save} disabled={!editing.name.trim()}>
                                Save
                            </Button>
                        </>
                    }
                >
                    <div className="space-y-3">
                        <Field label="Template name" required>
                            <Input value={editing.name} onChange={(e) => setEditing((t) => (t ? { ...t, name: e.target.value } : t))} autoFocus />
                        </Field>
                        <div>
                            <p className="mb-1 text-[13.5px] font-medium text-gray-700">Content</p>
                            <RichTextEditor value={editing.content} onChange={(content) => setEditing((t) => (t ? { ...t, content } : t))} minHeight={320} />
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
