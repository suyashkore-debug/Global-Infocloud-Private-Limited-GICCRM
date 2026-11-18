import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, Columns3, Download, FileSpreadsheet, FlaskConical, Info, Upload, UploadCloud, Users, X } from 'lucide-react';
import { api, errorMessage, fieldErrors } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { useStaff } from '../../hooks/useStaff';
import { Button, Card, ErrorNote, Field, FormSection, Select, Spinner, StaffMultiSelect } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { appLocale } from '../../lib/format';

interface Heading {
    key: string;
    heading: string;
    required: boolean;
}

interface Setup {
    headings: Heading[];
    fields: Heading[];
    unique_fields: string[];
    default_status_id: string;
    default_source_id: string;
    max_rows: number;
    preview_rows: number;
}

/** A column of the chosen file and the lead field it fills (null: not imported). */
interface Column {
    index: number;
    heading: string;
    key: string | null;
    example: string;
}

interface Result {
    simulation: boolean;
    total_rows: number;
    imported: number;
    skipped_duplicates: number;
    skipped: { row: number; name: string; reason: string }[];
    invalid_emails: number;
    unique_fields: string[];
    assigned: { id: number; name: string | null; count: number }[];
    warning: string | null;
    columns: Column[];
    fields: Heading[];
    headings: Heading[];
    preview: ({ row: number } & Record<string, string>)[];
}

const UNIQUE_LABELS: Record<string, string> = { email: 'E-mail', phone: 'Phone', website: 'Website', company: 'Company' };

/** What the sample table shows under each column before a file is chosen. */
const SAMPLE: Record<string, string> = { email: 'lead123@example.com', tags: 'tag1,tag2', lead_value: '25000', phone: '9876543210' };

/** A column must fill one of these for a lead to have a name. */
const NAME_KEYS = ['name', 'first_name', 'last_name', 'company', 'email', 'phone'];

/**
 * Leads → Import Leads: the guidelines and a sample file, then a CSV whose columns are matched by
 * their headings (in any order; the match can be changed), the fallback status and source, and the
 * staff the leads go to (in turn when several). Choosing a file simulates it straight away; "Import"
 * saves the leads.
 */
export default function LeadImportPage() {
    const toast = useToast();
    const navigate = useNavigate();
    const staff = useStaff();
    const setup = useApi<{ data: Setup }>('/leads/import');
    const statuses = useApi<{ data: { id: number; name: string; pipeline_id?: number | null; pipeline_name?: string | null }[]; meta?: { workspace_id: number | null; workspace_ids?: number[] } }>('/setup/lead-statuses');
    const sources = useApi<{ data: { id: number; name: string }[] }>('/setup/lead-sources');
    const input = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [dragging, setDragging] = useState(false);
    const [form, setForm] = useState({ status_id: '', source_id: '' });
    // The workspace the leads go into (the one open in the header to begin with).
    const [workspace, setWorkspace] = useState<number | null>(null);
    const [assignees, setAssignees] = useState<number[]>([]);
    // What each column fills; null until the file is read (then matched by headings).
    const [mapping, setMapping] = useState<(string | null)[] | null>(null);
    const [busy, setBusy] = useState<'import' | 'simulate' | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [result, setResult] = useState<Result | null>(null);
    const [done, setDone] = useState<Result | null>(null);

    // Start from Setup → Leads defaults, else the first status / source.
    useEffect(() => {
        if (setup.data && statuses.data && sources.data) {
            const open = statuses.data.meta?.workspace_id ?? null;
            const inOpen = statuses.data.data.filter((s) => !open || s.pipeline_id === open);
            const fallback = inOpen.find((s) => String(s.id) === setup.data!.data.default_status_id) ?? inOpen[0];
            setWorkspace((w) => w ?? open);
            setForm((f) => ({
                ...f,
                status_id: f.status_id || String(fallback?.id ?? ''),
                source_id: f.source_id || setup.data!.data.default_source_id || String(sources.data!.data[0]?.id ?? ''),
            }));
        }
    }, [setup.data, statuses.data, sources.data]);

    // The workspaces this person works in.
    const mine = statuses.data?.meta?.workspace_ids;
    const workspaces = [...new Map((statuses.data?.data ?? []).filter((s) => s.pipeline_id && (!mine || mine.includes(s.pipeline_id))).map((s) => [s.pipeline_id!, { id: s.pipeline_id!, name: s.pipeline_name ?? '' }])).values()];
    if (setup.error) {
        return <ErrorNote message={setup.error} />;
    }
    if (!setup.data || !statuses.data || !sources.data) {
        return <Spinner />;
    }
    const info = setup.data.data;

    async function run(simulate: boolean, f: File | null = file, map: (string | null)[] | null = mapping) {
        const missing: Record<string, string> = {};
        if (!f) missing.file = 'Choose the CSV file to import.';
        if (!form.status_id) missing.status_id = 'Choose a status.';
        if (!form.source_id) missing.source_id = 'Choose a source.';
        if (Object.keys(missing).length) {
            setErrors(missing);
            return;
        }
        setBusy(simulate ? 'simulate' : 'import');
        setErrors({});
        const body = new FormData();
        body.append('file', f!);
        body.append('status_id', form.status_id);
        body.append('source_id', form.source_id);
        assignees.forEach((id) => body.append('assigned_ids[]', String(id)));
        if (map) body.append('mapping', JSON.stringify(map));
        body.append('simulate', simulate ? '1' : '0');
        try {
            const { data } = await api.post<{ data: Result }>('/leads/import', body);
            if (simulate) {
                setResult(data.data);
                setMapping(data.data.columns.map((c) => c.key));
            } else {
                setDone(data.data);
                setResult(null);
                setMapping(null);
                setFile(null);
                toast(`${data.data.imported} lead${data.data.imported === 1 ? '' : 's'} imported.`);
                window.scrollTo({ top: 0, behavior: 'smooth' });
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
        setDone(null);
        setMapping(null);
        setFile(f);
        // Read it straight away: its columns, how they match, and a preview.
        void run(true, f, null);
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

    function remap(index: number, key: string) {
        const next = [...(mapping ?? [])].map((k) => (key && k === key ? null : k));
        next[index] = key || null;
        setMapping(next);
        void run(true, file, next);
    }

    const simulated = result?.simulation ? result : null;
    const headings = simulated?.headings ?? info.headings;
    const fields = result?.fields ?? info.fields;
    const hasName = (mapping ?? []).some((k) => k && NAME_KEYS.includes(k));

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
                            <b>1.</b> The first line of the CSV must be the <b>column headings</b>. Columns are matched <b>by their headings, in any order</b> (e.g. "Mobile" or "Contact No" → Phone, "E-mail ID" → Email); you can change the match after choosing the file. Save the file as <b>CSV UTF-8</b>.
                        </li>
                        <li>
                            <b>2.</b> <b>Status</b>, <b>Source</b> and <b>Assigned</b> (staff name or e-mail) are matched by name; when they don't match, the choices below are used. <b>Next Follow-up</b>: YYYY-MM-DD or DD-MM-YYYY, with an optional time ({new Date().toISOString().slice(0, 10)} 15:30).
                        </li>
                        <li>
                            <b>3.</b> Separate several <b>tags</b> with commas (tag1,tag2). A row without a name gets its first / last name, company, e-mail or phone as the name. Invalid e-mails are left empty.
                        </li>
                        {info.unique_fields.length > 0 && (
                            <li className="text-red-700">
                                <b>4.</b> Based on your leads <b>unique validation</b>{' '}
                                <Link to="/settings?tab=leads&focus=lead_unique_validation" target="_blank" rel="noopener" className="font-semibold text-brand underline">
                                    options
                                </Link>
                                , a lead <b>won't</b> be imported if a lead with the same {info.unique_fields.map((f) => UNIQUE_LABELS[f] ?? f).join(' or ')} already exists (phones are compared by their digits, so +91 98765 43210 = 9876543210).
                            </li>
                        )}
                        <li>
                            <b>{info.unique_fields.length > 0 ? 5 : 4}.</b> Up to {info.max_rows.toLocaleString(appLocale())} rows per file; we recommend files of about 500 rows. Choosing a file shows the first {info.preview_rows} rows as they would be imported; nothing is saved until you click <b>Import</b>.
                        </li>
                    </ol>
                </div>
            </Card>

            {/* Result of the last import */}
            {done && (
                <div className="pop-in space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                    <div className="flex flex-wrap items-center gap-4">
                        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500 text-white">
                            <CheckCircle2 className="h-6 w-6" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="font-display text-[17px] font-bold text-emerald-800">
                                {done.imported} lead{done.imported === 1 ? '' : 's'} imported
                            </p>
                            <p className="text-[13px] text-emerald-700">
                                {done.total_rows} row{done.total_rows === 1 ? '' : 's'} in the file
                                {done.skipped_duplicates > 0 && ` · ${done.skipped_duplicates} skipped because they already exist`}
                                {done.invalid_emails > 0 && ` · ${done.invalid_emails} invalid e-mail${done.invalid_emails === 1 ? '' : 's'} left empty`}
                            </p>
                            {done.assigned.length > 0 && (
                                <p className="mt-1 text-[12.5px] text-emerald-700">
                                    Assigned: {done.assigned.map((a) => `${a.name ?? '#' + a.id} (${a.count})`).join(', ')}
                                </p>
                            )}
                        </div>
                        <Button onClick={() => navigate('/leads')}>View leads</Button>
                    </div>
                    <SkippedRows rows={done.skipped} total={done.skipped_duplicates} />
                </div>
            )}

            {/* The file and options */}
            <Card className="p-5">
                <FormSection icon={UploadCloud} title="Import file" hint="Choose the CSV; its columns and a preview show below. Then pick what to use when a row has no matching status or source.">
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
                            {workspaces.length > 1 && (
                                <Field label="Workspace" hint="The leads go into this workspace; a Status column is matched to its statuses.">
                                    <Select
                                        value={String(workspace ?? '')}
                                        onChange={(e) => {
                                            const id = Number(e.target.value);
                                            setWorkspace(id);
                                            setForm({ ...form, status_id: String(statuses.data!.data.find((s) => s.pipeline_id === id)?.id ?? '') });
                                        }}
                                    >
                                        {workspaces.map((w) => (
                                            <option key={w.id} value={w.id}>
                                                {w.name}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>
                            )}
                            <Field label="Status (fallback)" required error={errors.status_id} hint="Used when a row's Status is empty or not found.">
                                <Select value={form.status_id} onChange={(e) => setForm({ ...form, status_id: e.target.value })}>
                                    {statuses.data.data.filter((s) => !workspace || s.pipeline_id === workspace).map((s) => (
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
                            <Field label="Assign to" error={errors.assigned_ids ?? errors['assigned_ids.0']} hint="One person gets all the leads; with several, the leads are shared out in turn. A row's own Assigned column comes first.">
                                <StaffMultiSelect staff={staff} value={assignees} onChange={setAssignees} placeholder="Nobody" />
                            </Field>
                        </div>
                    </div>
                </FormSection>
            </Card>

            {/* The file's columns and what each one fills */}
            {simulated && (
                <Card className="overflow-hidden">
                    <div className="border-b border-slate-100 px-5 py-4">
                        <h3 className="flex items-center gap-2 text-[15px] font-bold text-slate-800">
                            <Columns3 className="h-[18px] w-[18px] text-accent" /> Match columns
                        </h3>
                        <p className="text-[12.5px] text-slate-500">Each column of your file and the lead field it goes into. Change one to re-check the preview below.</p>
                    </div>
                    {!hasName && (
                        <p className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-5 py-2.5 text-[13px] text-amber-800">
                            <AlertTriangle className="h-4 w-4" /> Match a column to Name, First Name, Company, Email or Phone.
                        </p>
                    )}
                    <div className="grid gap-x-6 gap-y-2.5 p-5 md:grid-cols-2 xl:grid-cols-3">
                        {simulated.columns.map((c) => (
                            <div key={c.index} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${mapping?.[c.index] ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-slate-50/60'}`}>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[13px] font-semibold text-slate-800" title={c.heading}>
                                        {c.heading || `Column ${c.index + 1}`}
                                    </p>
                                    <p className="truncate text-[11.5px] text-slate-500" title={c.example}>
                                        {c.example || '—'}
                                    </p>
                                </div>
                                <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
                                <div className="w-44 shrink-0">
                                    <Select value={mapping?.[c.index] ?? ''} onChange={(e) => remap(c.index, e.target.value)} aria-label={`Field for ${c.heading}`}>
                                        <option value="">Don't import</option>
                                        {fields.map((f) => (
                                            <option key={f.key} value={f.key}>
                                                {f.heading}
                                            </option>
                                        ))}
                                    </Select>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/* The sample's columns, or the rows as they would be imported */}
            <Card className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
                    <div>
                        <h3 className="flex items-center gap-2 text-[15px] font-bold text-slate-800">
                            {simulated ? <FlaskConical className="h-[18px] w-[18px] text-accent" /> : <FileSpreadsheet className="h-[18px] w-[18px] text-brand" />}
                            {simulated ? 'Preview' : 'Sample file columns'}
                        </h3>
                        <p className="text-[12.5px] text-slate-500">
                            {simulated
                                ? `${simulated.imported} of ${simulated.total_rows} rows would be imported${simulated.skipped_duplicates ? `, ${simulated.skipped_duplicates} skipped as duplicates` : ''}${simulated.invalid_emails ? `, ${simulated.invalid_emails} invalid e-mail${simulated.invalid_emails === 1 ? '' : 's'} left empty` : ''}. Max ${info.preview_rows} rows are shown. Nothing has been saved yet.`
                                : 'The columns of the sample file, with an example row. Your file may have them in any order, and fewer of them.'}
                        </p>
                        {simulated && simulated.assigned.length > 0 && (
                            <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-slate-600">
                                <Users className="h-3.5 w-3.5 text-accent" /> {simulated.assigned.map((a) => `${a.name ?? '#' + a.id}: ${a.count}`).join(' · ')}
                            </p>
                        )}
                    </div>
                    {simulated && (
                        <button type="button" onClick={() => (setResult(null), setMapping(null), setFile(null))} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12.5px] font-semibold text-slate-500 hover:bg-slate-100">
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
                {simulated && simulated.skipped.length > 0 && (
                    <div className="border-t border-slate-100 p-5">
                        <SkippedRows rows={simulated.skipped} total={simulated.skipped_duplicates} />
                    </div>
                )}
            </Card>

            <div className="flex flex-wrap items-center justify-end gap-2">
                {simulated && (
                    <span className="mr-auto text-[13px] text-slate-500">
                        Ready: <b className="text-slate-800">{simulated.imported}</b> lead{simulated.imported === 1 ? '' : 's'} will be imported.
                    </span>
                )}
                <Button variant="secondary" onClick={() => run(true)} loading={busy === 'simulate'} disabled={!!busy || !file}>
                    <FlaskConical className="h-4 w-4" /> Check again
                </Button>
                <Button onClick={() => run(false)} loading={busy === 'import'} disabled={!!busy || !file || (!!mapping && !hasName)}>
                    <Upload className="h-4 w-4" /> Import
                </Button>
            </div>
        </div>
    );
}

/** The rows that were not imported, and why. */
function SkippedRows({ rows, total }: { rows: { row: number; name: string; reason: string }[]; total: number }) {
    if (rows.length === 0) {
        return null;
    }

    return (
        <details className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-2.5 text-[13px] text-amber-900">
            <summary className="cursor-pointer font-semibold">
                {total} row{total === 1 ? '' : 's'} skipped as duplicates{total > rows.length ? ` (first ${rows.length} shown)` : ''}
            </summary>
            <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                {rows.map((r) => (
                    <li key={r.row}>
                        Row {r.row} · <b>{r.name}</b>: {r.reason}
                    </li>
                ))}
            </ul>
        </details>
    );
}
