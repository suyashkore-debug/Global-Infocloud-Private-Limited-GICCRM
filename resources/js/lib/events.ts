// Lists listen for these to refresh after a change made elsewhere (e.g. in the task modal).

export const TASKS_CHANGED = 'projects-app:tasks-changed';
export const PROJECT_CHANGED = 'projects-app:project-changed';
export const TIMERS_CHANGED = 'projects-app:timers-changed';

export function emit(name: string): void {
    window.dispatchEvent(new Event(name));
}

export function listen(name: string, handler: () => void): () => void {
    window.addEventListener(name, handler);

    return () => window.removeEventListener(name, handler);
}
export const TODOS_CHANGED = 'projects-app:todos-changed';
export const CHAT_CHANGED = 'projects-app:chat-changed';
