import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import TasksBoard from '../components/tasks/TasksBoard';

export default function TasksPage() {
    return (
        <div className="w-full space-y-4">
            <div>
                <h4 className="page-title">Tasks</h4>
                <Link to="/tasks/overview" className="inline-flex items-center gap-1 text-[14px] text-blue-600 hover:underline">
                    Tasks Overview <ArrowRight className="h-4 w-4" />
                </Link>
            </div>
            <TasksBoard />
        </div>
    );
}
