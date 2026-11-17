import { ListChecks } from 'lucide-react';
import TasksBoard from './TasksBoard';
import type { RelatedType } from './TaskFormModal';

/**
 * The tasks of a customer, invoice, estimate, proposal, contract, ticket or expense (Perfex
 * "Related to"), with "New task" creating one already related to it.
 */
export default function RelatedTasks({ type, id, name, panel = false }: { type: RelatedType; id: number; name: string; panel?: boolean }) {
    const board = <TasksBoard related={{ type, id, name }} />;
    if (!panel) {
        return board;
    }

    return (
        <div className="panel_s">
            <div className="panel-body">
                <h5 className="mb-3 flex items-center gap-2 font-semibold">
                    <ListChecks className="h-4 w-4 text-accent" /> Tasks
                </h5>
                {board}
            </div>
        </div>
    );
}
