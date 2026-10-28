import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../../lib/api';
import { TASK_STATUSES, optionById } from '../../lib/constants';
import { formatDate, formatDateTime, formatMoney } from '../../lib/format';
import { Button, Checkbox, ErrorNote, Modal, Spinner, StatusBadge } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import type { Project } from '../../types';

type InvoiceType = 'single_line' | 'task_per_item' | 'timesheets_individually';
type Preview = {
    billing_type: number;
    project_cost: number;
    rate_per_hour: number;
    types: InvoiceType[];
    tasks: { id: number; name: string; status: number; hours: number; rate: number; amount: number; timesheets: { id: number; user: string | null; start: string; end: string; hours: number; note: string | null }[] }[];
    expenses: { id: number; name: string; date: string | null; amount: number }[];
};

const TYPE_LABELS: Record<InvoiceType, { title: string; text: string }> = {
    single_line: { title: 'Single line', text: 'One line with the project name.' },
    task_per_item: { title: 'Task per item', text: 'One line per task with its logged hours.' },
    timesheets_individually: { title: 'All timesheets individually', text: 'One line per timesheet entry.' },
};
const BILLING = ['', 'Fixed Rate', 'Project Hours', 'Task Hours'];

/**
 * Perfex "Invoice project": choose how to bill, which billable tasks and which expenses, then a
 * draft invoice opens for review.
 */
export default function InvoiceProjectModal({ project, onClose }: { project: Project; onClose: () => void }) {
    const toast = useToast();
    const navigate = useNavigate();
    const [data, setData] = useState<Preview | null>(null);
    const [type, setType] = useState<InvoiceType>('task_per_item');
    const [tasks, setTasks] = useState<number[]>([]);
    const [expenses, setExpenses] = useState<number[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        api.get<{ data: Preview }>(`/projects/${project.id}/invoice`)
            .then((r) => {
                setData(r.data.data);
                setType(r.data.data.types.includes('task_per_item') ? 'task_per_item' : r.data.data.types[0]);
                setTasks(r.data.data.tasks.filter((t) => t.hours > 0).map((t) => t.id));
            })
            .catch((e) => setError(errorMessage(e)));
    }, [project.id]);

    const toggle = (list: number[], id: number, on: boolean) => (on ? [...list, id] : list.filter((x) => x !== id));
    const fixed = data?.billing_type === 1;
    const chosen = data?.tasks.filter((t) => tasks.includes(t.id)) ?? [];
    const taskTotal = fixed ? data?.project_cost ?? 0 : chosen.reduce((sum, t) => sum + t.amount, 0);
    const expenseTotal = data?.expenses.filter((e) => expenses.includes(e.id)).reduce((sum, e) => sum + e.amount, 0) ?? 0;

    async function submit() {
        setBusy(true);
        setError(null);
        try {
            const r = await api.post<{ data: { id: number; number: string } }>(`/projects/${project.id}/invoice`, { type, task_ids: tasks, expense_ids: expenses });
            toast(`Draft invoice ${r.data.data.number} created. Review it and save.`);
            navigate(`/invoices/${r.data.data.id}/edit`);
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setBusy(false);
        }
    }

    return (
        <Modal
            open
            size="xl"
            title="Invoice project"
            onClose={onClose}
            footer={
                <>
                    <span className="mr-auto text-[13.5px] text-gray-600">
                        Total before tax: <strong className="text-gray-900">{formatMoney(taskTotal + expenseTotal)}</strong>
                    </span>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={submit} loading={busy} disabled={!data || (!fixed && tasks.length === 0 && expenses.length === 0)}>
                        Invoice project
                    </Button>
                </>
            }
        >
            <ErrorNote message={error} />
            {!data ? (
                !error && <Spinner />
            ) : (
                <div className="space-y-5 text-[13.5px]">
                    <p className="text-gray-600">
                        Billing type: <strong className="text-gray-800">{BILLING[data.billing_type]}</strong>
                        {data.billing_type === 1 && <> · Project cost {formatMoney(data.project_cost)}</>}
                        {data.billing_type === 2 && <> · Rate per hour {formatMoney(data.rate_per_hour)}</>}
                        {data.billing_type === 3 && <> · Each task's own hourly rate</>}
                    </p>

                    <div className="grid gap-2 sm:grid-cols-3">
                        {data.types.map((t) => (
                            <label key={t} className={`cursor-pointer rounded-lg border p-3 ${type === t ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500' : 'border-gray-200 hover:bg-gray-50'}`}>
                                <span className="flex items-center gap-2 font-medium text-gray-800">
                                    <input type="radio" checked={type === t} onChange={() => setType(t)} /> {TYPE_LABELS[t].title}
                                </span>
                                <span className="mt-1 block text-xs text-gray-500">{TYPE_LABELS[t].text}</span>
                            </label>
                        ))}
                    </div>

                    <div>
                        <div className="mb-2 flex items-center justify-between">
                            <h5 className="font-semibold text-gray-800">Billable tasks not yet invoiced ({data.tasks.length})</h5>
                            {data.tasks.length > 0 && (
                                <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => setTasks(tasks.length === data.tasks.length ? [] : data.tasks.map((t) => t.id))}>
                                    {tasks.length === data.tasks.length ? 'Select none' : 'Select all'}
                                </button>
                            )}
                        </div>
                        {data.tasks.length === 0 ? (
                            <p className="rounded-lg bg-gray-50 p-3 text-gray-500">No billable tasks left to invoice. Mark tasks as "Billable" and log time on them.</p>
                        ) : (
                            <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-200">
                                <table className="table-perfex">
                                    <thead>
                                        <tr>
                                            <th className="w-8" />
                                            <th>Task</th>
                                            <th>Status</th>
                                            <th className="text-right">Hours</th>
                                            {!fixed && <th className="text-right">Rate</th>}
                                            {!fixed && <th className="text-right">Amount</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.tasks.map((t) => (
                                            <tr key={t.id}>
                                                <td>
                                                    <input type="checkbox" checked={tasks.includes(t.id)} onChange={(e) => setTasks(toggle(tasks, t.id, e.target.checked))} />
                                                </td>
                                                <td>
                                                    <span className="font-medium">{t.name}</span>
                                                    {type === 'timesheets_individually' && t.timesheets.length > 0 && (
                                                        <ul className="mt-1 space-y-0.5 text-xs text-gray-500">
                                                            {t.timesheets.map((ts) => (
                                                                <li key={ts.id}>
                                                                    {ts.user} · {formatDateTime(ts.start)} · {ts.hours} h{ts.note ? ` · ${ts.note}` : ''}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </td>
                                                <td>
                                                    <StatusBadge option={optionById(TASK_STATUSES, t.status)} />
                                                </td>
                                                <td className={`text-right ${t.hours === 0 ? 'text-red-500' : ''}`}>{t.hours}</td>
                                                {!fixed && <td className="text-right">{formatMoney(t.rate)}</td>}
                                                {!fixed && <td className="text-right">{formatMoney(t.amount)}</td>}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {fixed && <p className="mt-2 text-xs text-gray-500">Fixed-rate project: the invoice has one line at the project cost; the ticked tasks are marked as billed.</p>}
                    </div>

                    <div>
                        <h5 className="mb-2 font-semibold text-gray-800">Billable expenses not yet invoiced ({data.expenses.length})</h5>
                        {data.expenses.length === 0 ? (
                            <p className="text-gray-500">None.</p>
                        ) : (
                            <div className="space-y-1.5">
                                {data.expenses.map((e) => (
                                    <Checkbox
                                        key={e.id}
                                        checked={expenses.includes(e.id)}
                                        onChange={(on) => setExpenses(toggle(expenses, e.id, on))}
                                        label={`${e.name} · ${formatDate(e.date)} · ${formatMoney(e.amount)}`}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                    <p className="text-xs text-gray-500">A draft invoice opens for you to review. The chosen tasks and expenses are marked as billed; deleting the invoice frees them again.</p>
                </div>
            )}
        </Modal>
    );
}
