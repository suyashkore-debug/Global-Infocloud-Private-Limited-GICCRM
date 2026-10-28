import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { SERIES_COLORS } from '../../components/charts/BarChart';
import { ErrorNote, Spinner } from '../../components/ui';

type Results = {
    survey: { id: number; subject: string };
    participants: number;
    questions: { id: number; type: string; question: string; answered: number; options: { id: number; description: string; count: number; percent: number }[]; answers: string[] }[];
};

/** Perfex survey results: share of participants per option, and the written answers. */
export default function SurveyResultsPage() {
    const { id } = useParams();
    const { data, error } = useApi<{ data: Results }>(`/surveys/${id}/results`);

    if (error) {
        return <ErrorNote message={error} />;
    }
    if (!data) {
        return <Spinner />;
    }
    const r = data.data;

    return (
        <div className="max-w-4xl space-y-4">
            <div className="flex items-center gap-2">
                <Link to={`/utilities/surveys/${r.survey.id}`} className="text-gray-500 hover:text-gray-800">
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <h4 className="page-title">Results: {r.survey.subject}</h4>
            </div>
            <p className="text-[13px] text-gray-600">
                Total participants: <span className="font-semibold text-gray-900">{r.participants}</span>
            </p>
            {r.questions.map((q, i) => (
                <div key={q.id} className="panel_s">
                    <div className="panel-body space-y-3">
                        <div className="flex items-start justify-between gap-3">
                            <p className="text-[14px] font-semibold text-gray-800">
                                {i + 1}. {q.question}
                            </p>
                            <span className="shrink-0 text-xs text-gray-500">{q.answered} answered</span>
                        </div>
                        {q.options.length > 0 ? (
                            <div className="space-y-2">
                                {q.options.map((o) => (
                                    <div key={o.id} className="grid grid-cols-[minmax(0,12rem)_1fr_5.5rem] items-center gap-3 text-[13px]" title={`${o.description}: ${o.count} (${o.percent}%)`}>
                                        <span className="truncate text-gray-700">{o.description}</span>
                                        <div className="h-3.5 rounded bg-gray-100">
                                            <div className="h-full rounded-r" style={{ width: `${o.percent}%`, minWidth: o.count ? 2 : 0, backgroundColor: SERIES_COLORS[0] }} />
                                        </div>
                                        <span className="text-right font-medium text-gray-900">
                                            {o.percent}% <span className="font-normal text-gray-500">({o.count})</span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : q.answers.length ? (
                            <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-100">
                                {q.answers.map((a, ai) => (
                                    <li key={ai} className="whitespace-pre-wrap px-3 py-2 text-[13px] text-gray-700">
                                        {a}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-[13px] text-gray-500">No answers yet.</p>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
