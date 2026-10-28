import { useState, type DragEvent } from 'react';
import { GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { emit, TODOS_CHANGED } from '../../lib/events';
import { useApi } from '../../hooks/useApi';
import { Button, Modal, Spinner, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

export type TodoItem = { id: number; description: string; finished: boolean; finished_at: string | null; item_order: number; created_at: string };
type List = { data: TodoItem[]; meta: { total: number; unfinished: number } };

/** Perfex "To Do Items": unfinished and finished lists, drag to reorder or to move between them. */
export default function TodosPage() {
    const toast = useToast();
    const [pages, setPages] = useState({ open: 1, done: 1 });
    const open = useApi<List>('/todos', { finished: 0, page: pages.open });
    const done = useApi<List>('/todos', { finished: 1, page: pages.done });
    const [editing, setEditing] = useState<TodoItem | 'new' | null>(null);
    const [dragging, setDragging] = useState<TodoItem | null>(null);

    const reload = () => {
        open.reload();
        done.reload();
        emit(TODOS_CHANGED);
    };

    async function toggle(todo: TodoItem) {
        await api.patch(`/todos/${todo.id}`, { finished: !todo.finished });
        reload();
    }

    async function remove(todo: TodoItem) {
        if (!confirm('Delete this to do item?')) {
            return;
        }
        await api.delete(`/todos/${todo.id}`);
        reload();
    }

    async function drop(e: DragEvent, finished: boolean, before: TodoItem | null) {
        e.preventDefault();
        e.stopPropagation();
        if (!dragging) {
            return;
        }
        const list = ((finished ? done.data : open.data)?.data ?? []).filter((t) => t.id !== dragging.id);
        const index = before ? list.findIndex((t) => t.id === before.id) : list.length;
        list.splice(index < 0 ? list.length : index, 0, dragging);
        setDragging(null);
        try {
            await api.post('/todos/reorder', { finished, order: list.map((t) => t.id) });
        } catch (err) {
            toast(errorMessage(err), 'error');
        }
        reload();
    }

    const column = (title: string, finished: boolean, state: typeof open, page: number, setPage: (p: number) => void) => (
        <div className="panel_s" onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, finished, null)}>
            <div className="panel-body">
                <h4 className={`mb-3 text-[15px] font-semibold ${finished ? 'text-green-700' : 'text-gray-800'}`}>{title}</h4>
                {!state.data ? (
                    <Spinner />
                ) : (
                    <ul className="min-h-16 space-y-1">
                        {state.data.data.map((todo) => (
                            <li
                                key={todo.id}
                                draggable
                                onDragStart={() => setDragging(todo)}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => drop(e, finished, todo)}
                                className={`group flex items-start gap-2 rounded-md border border-transparent px-2 py-2 hover:border-gray-200 hover:bg-gray-50 ${dragging?.id === todo.id ? 'opacity-40' : ''}`}
                            >
                                <GripVertical className="mt-0.5 h-4 w-4 shrink-0 cursor-move text-gray-300" />
                                <input type="checkbox" checked={todo.finished} onChange={() => toggle(todo)} className="mt-1" />
                                <div className="min-w-0 flex-1">
                                    <p className={`whitespace-pre-wrap text-[13.5px] ${todo.finished ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{todo.description}</p>
                                    <p className="text-xs text-gray-400">{finished && todo.finished_at ? `Finished ${formatDateTime(todo.finished_at)}` : formatDateTime(todo.created_at)}</p>
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                                    <button type="button" onClick={() => setEditing(todo)} className="p-1 text-gray-400 hover:text-gray-700" title="Edit">
                                        <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button type="button" onClick={() => remove(todo)} className="p-1 text-gray-400 hover:text-red-600" title="Delete">
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </li>
                        ))}
                        {state.data.data.length === 0 && <li className="py-3 text-center text-[13px] text-gray-500">{finished ? 'No finished todos found' : 'No unfinished todos found'}</li>}
                    </ul>
                )}
                {state.data && state.data.meta.total > state.data.data.length && (
                    <div className="mt-3 text-center">
                        <Button variant="secondary" size="sm" onClick={() => setPage(page + 1)}>
                            Load More
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <div className="w-full space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="page-title">To Do Items</h4>
                <Button onClick={() => setEditing('new')}>
                    <Plus className="h-4 w-4" /> New To Do
                </Button>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
                {column('Unfinished to do\'s', false, open, pages.open, (p) => setPages({ ...pages, open: p }))}
                {column('Latest finished to do\'s', true, done, pages.done, (p) => setPages({ ...pages, done: p }))}
            </div>
            {editing && (
                <TodoModal
                    todo={editing === 'new' ? null : editing}
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        setEditing(null);
                        reload();
                    }}
                />
            )}
        </div>
    );
}

export function TodoModal({ todo, onClose, onSaved }: { todo: TodoItem | null; onClose: () => void; onSaved: () => void }) {
    const toast = useToast();
    const [text, setText] = useState(todo?.description ?? '');
    const [saving, setSaving] = useState(false);

    async function save() {
        setSaving(true);
        try {
            await (todo ? api.patch(`/todos/${todo.id}`, { description: text }) : api.post('/todos', { description: text }));
            onSaved();
        } catch (err) {
            toast(errorMessage(err), 'error');
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal
            open
            title={todo ? 'Edit To Do' : 'Add New To Do'}
            onClose={onClose}
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Close
                    </Button>
                    <Button onClick={save} loading={saving} disabled={!text.trim()}>
                        Save
                    </Button>
                </>
            }
        >
            <Textarea autoFocus rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Description" />
        </Modal>
    );
}
