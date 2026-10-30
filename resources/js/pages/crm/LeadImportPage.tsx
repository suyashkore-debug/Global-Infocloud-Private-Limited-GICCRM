import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, FlaskConical, Info, Upload, UploadCloud, X } from 'lucide-react';
import { api, errorMessage, fieldErrors } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { useStaff } from '../../hooks/useStaff';
import { Button, Card, ErrorNote, Field, FormSection, Select, Spinner } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

interface Heading {
    key: string;
    heading: string;
    required: boolean;
}

interface Setup {
    headings: Heading[];
    unique_fields: string[];
    default_status_id: string;
    default_source_id: string;
    max_rows: number;
    preview_rows: number;
}

interface Result {
    simulation: boolean;
    total_rows: number;
    imported: number;
    skipped_duplicates: number;
    unique_fields: string[];
    warning: string | null;
    headings: Heading[];
    preview: ({ row: number } & Record<string, string>)[];
}

const UNIQUE_LABELS: Record<string, string> = { email: 'E-mail', phone: 'Phone', website: 'Website' };

/** What the sample table shows under each column before a file is simulated. */
const SAMPLE: Record<string, string> = { email: 'lead123@example.com', tags: 'tag1,tag2', lead_value: '25000', phone: '9876543210' };

/**
 * Leads → Import Leads (as in Perfex): the guidelines and the CSV's columns, a sample file, then a
 * CSV with fallback status and source and the staff member who gets the leads. "Simulate Import"
 * previews the rows without saving anything.
 */
export default function LeadImportPage() {
    const toast = useToast();
    const navigate = useNavigate();
    const staff = useStaff();
    const setup = useApi<{ data: Setup }>('/leads/import');
    const statuses = useApi<{ data: { id: number; name: string }[] }>('/setup/lead-statuses');
    const sources = useApi<{ data: { id: number; name: string }[] }>('/setup/lead-sources');
    const input = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [dragging, setDragging] = useState(false);
    const [form, setForm] = useState({ status_id: '', source_id: '', assigned_id: '' });
    const [busy, setBusy] = useState<'import' | 'simulate' | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [result, setResult] = useState<Result | null>(null);

    // Start from Setup → Leads defaults, else the first status / source.
    useEffect(() => {
        if (setup.data && statuses.data && sources.data) {
            setForm((f) => ({
                ...f,
                status_id: f.status_id || setup.data!.data.default_status_id || String(statuses.data!.data[0]?.id ?? ''),
                source_id: f.source_id || setup.data!.data.default_source_id || String(sources.data!.data[0]?.id ?? ''),
            }));
        }
    }, [setup.data, statuses.data, sources.data]);

    if (setup.error) {
        return <ErrorNote message={setup.error} />;
    }
    if (!setup.data || !statuses.data || !sources.data) {
        return <Spinner />;
    }
    const info = setup.data.data;

    function pick(f: File | undefined | null) {
        if (!f) {
            return;
        }
        if (!/\.csv$/i.test(f.name)) {
            setErrors({ file: 'Choose a .csv file. In Excel: File → Save As → CSV UTF-8.' });
            return;
        }
        setErrors({});
        setResult(null);
        setFile(f);
    }

    function onDrop(e: DragEvent) {
        e.preventDefault();
        setDragging(false);
        pick(e.dataTransfer.files[0]);
    }

    async function downloadSample() {
        try {
            const response = await api.get('/leads/import/sample', { responseType: 'blob' });
            const url = URL.createObjectURL(new Blob([response.data as BlobPart], { type: 'text/csv' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = 'sample_leads_import.csv';
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    async function run(simulate: boolean) {
        const missing: Record<string, string> = {};
        if (!file) missing.file = 'Choose the CSV file to import.';
        if (!form.status_id) missing.status_id = 'Choose a status.';
        if (!form.source_id) missing.source_id = 'Choose a source.';
        if (Object.keys(missing).length) {
            setErrors(missing);
            return;
        }
        setBusy(simulate ? 'simulate' : 'import');
        setErrors({});
        const body = new FormData();
        body.append('file', file!);
        body.append('status_id', form.status_id);
        body.append('source_id', form.source_id);
        if (form.assigned_id) body.append('assigned_id', form.assigned_id);
        body.append('simulate', simulate ? '1' : '0');
        try {
            const { data } = await api.post<{ data: Result }>('/leads/import', body);
            setResult(data.data);
            if (!simulate) {
                toast(`${data.data.imported} lead${data.data.imported === 1 ? '' : 's'} imported.`);
                setFile(null);
            }
        } catch (e) {
            const fe = fieldErrors(e);
            setErrors(fe);
            if (!Object.keys(fe).length) {
                toast(errorMessage(e), 'error');
            }
        } finally {
            setBusy(null);
        }
    }

    const headings = result?.headings ?? info.headings;
    const simulated = result?.simulation ? result : null;

    return (
        <div className="w-full space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h4 className="page-title">Import Leads</h4>
                <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => navigate('/leads')}>
                        Back to leads
                    </Button>
                    <Button variant="secondary" onClick={downloadSample}>
                        <Download className="h-4 w-4" /> Download Sample
                    </Button>
                </div>
            </div>

            {/* Guidelines */}
            <Card className="overflow-hidden">
                <div className="flex items-start gap-3 bg-[linear-gradient(90deg,var(--color-brand-50),transparent)] p-5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
                        <Info className="h-[18px] w-[18px]" />
                    </span>
                    <ol className="space-y-2 text-[13.5px] text-slate-700">
                        <li>
                            <b>1.</b> Your CSV should have the columns below, <b>in this order</b>. The first line must be the column headings, as in the sample file. Save the file as <b>CSV UTF-8</b> to avoid problems with special characters.
                        </li>
                        <li>
                            <b>2.</b> Dates must be in the format <b>YYYY-MM-DD</b> ({new Date().toISOString().slice(0, 10)}). <b>Status</b> and <b>Source</b> can be the name or the id; when they don't match, the fallback chosen below is used.
                        </li>
                        <li>
                            <b>3.</b> Separate several <b>tags</b> with commas (tag1,tag2). An empty <b>Name</b> is saved as “/”, and cells with NULL are left empty.
                        </li>
                        {info.unique_fields.length > 0 && (
                            <li className="text-red-700">
                                <b>4.</b> Based on your leads <b>unique validation</b> configured{' '}
                                <Link to="/settings?tab=leads&focus=lead_unique_validation" target="_blank" rel="noopener" className="font-semibold text-brand underline">
                                    options
                                </Link>
                                , a lead <b>won't</b> be imported if a lead with the same {info.unique_fields.map((f) => UNIQUE_LABELS[f] ?? f).join(' or ')} already exists. If you still want to import all leads, untick all unique validation fields.
                            </li>
                        )}
                        <li>
                            <b>{info.unique_fields.length > 0 ? 5 : 4}.</b> Up to {info.max_rows.toLocaleString('en-IN')} rows per file; we recommend files of about 500 rows. <b>Simulate Import</b> shows the first {info.preview_rows} rows without saving anything.
                        </li>
                    </ol>
                </div>
            </Card>

            {/* Result of the last import / simulation */}
            {result && !result.simulation && (
                <div className="pop-in flex flex-wrap items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500 text-white">
                        <CheckCircle2 className="h-6 w-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="font-display text-[17px] font-bold text-emerald-800">
                            {result.imported} lead{result.imported === 1 ? '' : 's'} imported
                        </p>
                        <p className="text-[13px] text-emerald-700">
                            {result.total_rows} row{result.total_rows === 1 ? '' : 's'} in the file
                            {result.skipped_duplicates > 0 && ` · ${result.skipped_duplicates} skipped because they already exist (${result.unique_fields.map((f) => UNIQUE_LABELS[f] ?? f).join(' / ')})`}
                        </p>
                    </div>
                    <Button onClick={() => navigate('/leads')}>View leads</Button>
                </div>
            )}

            {/* Columns: the sample row, or the simulated rows */}
            <Card className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
                    <div>
                        <h3 className="flex items-center gap-2 text-[15px] font-bold text-slate-800">
                            {simulated ? <FlaskConical className="h-[18px] w-[18px] text-accent" /> : <FileSpreadsheet className="h-[18px] w-[18px] text-brand" />}
                            {simulated ? 'Simulation' : 'CSV columns'}
                        </h3>
                        <p className="text-[12.5px] text-slate-500">
                            {simulated
                                ? `${simulated.imported} of ${simulated.total_rows} rows would be imported${simulated.skipped_duplicates ? `, ${simulated.skipped_duplicates} skipped as duplicates` : ''}. Max ${info.preview_rows} rows are shown. Nothing has been saved.`
                                : 'The order of the columns in your file, with an example row. * = required.'}
                        </p>
                    </div>
                    {simulated && (
                        <button type="button" onClick={() => setResult(null)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12.5px] font-semibold text-slate-500 hover:bg-slate-100">
                            <X className="h-4 w-4" /> Clear
                        </button>
                    )}
                </div>
                {simulated?.warning && (
                    <p className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-5 py-2.5 text-[13px] text-amber-800">
                        <AlertTriangle className="h-4 w-4" /> {simulated.warning}
                    </p>
                )}
                <div className="table-scroll overflow-x-auto">
                    <table data-nosort className="table-perfex">
                        <thead>
                            <tr>
                                {simulated && <th>Row</th>}
                                {headings.map((h) => (
                                    <th key={h.key}>
                                        {h.required && <span className="text-red-500">* </span>}
                                        {h.heading}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {simulated ? (
                                simulated.preview.length === 0 ? (
                                    <tr>
                                        <td colSpan={headings.length + 1} className="text-center text-slate-500">
                                            No rows would be imported.
                                        </td>
                                    </tr>
                                ) : (
                                    simulated.preview.map((row) => (
                                        <tr key={row.row}>
                                            <td className="text-slate-400">{row.row}</td>
                                            {headings.map((h) => (
                                                <td key={h.key} className="whitespace-nowrap">
                                                    {row[h.key] || <span className="text-slate-300">/</span>}
                                                </td>
                                            ))}
                                        </tr>
                                    ))
                                )
                            ) : (
                                <tr>
                                    {headings.map((h) => (
                                        <td key={h.key} className="whitespace-nowrap text-slate-500">
                                            {SAMPLE[h.key] ?? 'Sample Data'}
                                        </td>
                                    ))}
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* The file and options */}
            <Card className="p-5">
                <FormSection icon={UploadCloud} title="Import file" hint="Choose the CSV, then pick what to use when a row has no matching status or source.">
                    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                        <div>
                            <label
                                onDragOver={(e) => (e.preventDefault(), setDragging(true))}
                                onDragLeave={() => setDragging(false)}
                                onDrop={onDrop}
                                className={`flex h-full min-h-[180px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition ${
                                    dragging ? 'border-accent bg-accent-50' : errors.file ? 'border-red-300 bg-red-50/50' : file ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-300 bg-white hover:border-brand/40 hover:bg-brand-50/40'
                                }`}
                            >
                                <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ''))} />
                                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl text-white ${file ? 'bg-emerald-500' : 'bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-light))]'}`}>
                                    {file ? <FileSpreadsheet className="h-6 w-6" /> : <Upload className="h-6 w-6" />}
                                </span>
                                {file ? (
                                    <>
                                        <p className="font-semibold text-slate-800">{file.name}</p>
                                        <p className="text-[12.5px] text-slate-500">{(file.size / 1024).toFixed(1)} KB · click to choose another file</p>
                                    </>
                                ) : (
                                    <>
                                        <p className="font-semibold text-slate-800">Choose CSV File</p>
                                        <p className="text-[12.5px] text-slate-500">Drag the file here, or click to browse</p>
                                    </>
                                )}
                            </label>
                            {errors.file && <p className="mt-1.5 text-xs text-red-600">{errors.file}</p>}
                        </div>
                        <div className="space-y-4">
                            <Field label="Status (fallback)" required error={errors.status_id} hint="Used when a row's Status is empty or not found.">
                                <Select value={form.status_id} onChange={(e) => setForm({ ...form, status_id: e.target.value })}>
                                    {statuses.data.data.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.name}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                            <Field label="Source (fallback)" required error={errors.source_id} hint="Used when a row's Source is empty or not found.">
                                <Select value={form.source_id} onChange={(e) => setForm({ ...form, source_id: e.target.value })}>
                                    {sources.data.data.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.name}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                            <Field label="Responsible (Assignee)" error={errors.assigned_id} hint="Every imported lead is assigned to this staff member.">
                                <Select value={form.assigned_id} onChange={(e) => setForm({ ...form, assigned_id: e.target.value })}>
                                    <option value="">Nobody</option>
                                    {staff.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.full_name}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                        </div>
                    </div>
                </FormSection>
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                    <Button variant="secondary" onClick={() => run(true)} loading={busy === 'simulate'} disabled={!!busy}>
                        <FlaskConical className="h-4 w-4" /> Simulate Import
                    </Button>
                    <Button onClick={() => run(false)} loading={busy === 'import'} disabled={!!busy}>
                        <Upload className="h-4 w-4" /> Import
                    </Button>
                </div>
            </Card>
        </div>
    );
}
