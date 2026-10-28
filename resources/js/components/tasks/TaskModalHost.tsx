import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { emit, TASKS_CHANGED } from '../../lib/events';
import type { Task } from '../../types';
import TaskDetailModal from './TaskDetailModal';
import TaskFormModal, { type TaskDefaults } from './TaskFormModal';

interface TaskModals {
    openTask: (id: number) => void;
    newTask: (defaults?: TaskDefaults) => void;
    editTask: (id: number) => void;
}

const TaskModalContext = createContext<TaskModals>({ openTask: () => {}, newTask: () => {}, editTask: () => {} });

/**
 * One task modal for the whole app, driven by ?task=ID so notification links and the browser
 * back button work.
 */
export function TaskModalHost({ children }: { children: ReactNode }) {
    const [params, setParams] = useSearchParams();
    const [creating, setCreating] = useState<TaskDefaults | null>(null);
    const [editing, setEditing] = useState<Task | null>(null);
    const editTask = useCallback((id: number) => {
        api.get<{ data: Task }>(`/tasks/${id}`).then((r) => setEditing(r.data.data));
    }, []);
    const taskId = Number(params.get('task')) || null;

    const openTask = useCallback(
        (id: number) =>
            setParams((current) => {
                const next = new URLSearchParams(current);
                next.set('task', String(id));
                return next;
            }),
        [setParams],
    );

    const close = useCallback(
        () =>
            setParams((current) => {
                const next = new URLSearchParams(current);
                next.delete('task');
                return next;
            }),
        [setParams],
    );

    return (
        <TaskModalContext.Provider value={{ openTask, newTask: (defaults = {}) => setCreating(defaults), editTask }}>
            {children}
            <TaskDetailModal taskId={taskId} onClose={close} onOpenTask={openTask} />
            <TaskFormModal
                open={creating !== null}
                task={null}
                defaults={creating ?? {}}
                onClose={() => setCreating(null)}
                onSaved={(task) => {
                    setCreating(null);
                    emit(TASKS_CHANGED);
                    openTask(task.id);
                }}
            />
            {/* Edit straight from a list row (Perfex "Edit" row option). */}
            <TaskFormModal
                open={editing !== null}
                task={editing}
                onClose={() => setEditing(null)}
                onSaved={() => {
                    setEditing(null);
                    emit(TASKS_CHANGED);
                }}
            />
        </TaskModalContext.Provider>
    );
}

export function useTaskModals(): TaskModals {
    return useContext(TaskModalContext);
}
