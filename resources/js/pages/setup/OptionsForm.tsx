import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, ChevronDown } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { Button, Field, Input, inputClass, Menu, Select, Spinner, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

type Choice = { value: string; label: string };

export interface OptionField {
    name: string;
    label: string;
    type?: 'text' | 'number' | 'textarea' | 'format' | 'yesno' | 'select' | 'color' | 'checks' | 'multiselect' | 'radios';
    hint?: string;
    /** Choices for "select", "checks", "multiselect" and "radios" (checks / multiselect are saved comma separated). */
    options?: Choice[];
    /** Shown in a multiselect with nothing chosen. */
    placeholder?: string;
    /** A second setting on the same line, as radio buttons on the right (e.g. a sort and its direction). */
    beside?: { name: string; options: Choice[] };
}

export interface OptionSection {
    title: string;
    fields: OptionField[];
    /** One setting per line with a divider between them (as Perfex's settings pages), instead of two columns. */
    stacked?: boolean;
}

const NUMBER_FORMATS = [
    { id: '1', name: 'Number based (000001)' },
    { id: '2', name: 'Year based (YYYY/000001)' },
    { id: '3', name: '000001-YY' },
    { id: '4', name: '000001/MM/YYYY' },
];

const YES_NO: Choice[] = [
    { value: '1', label: 'Yes' },
    { value: '0', label: 'No' },
];

/** Radio buttons in a row (Yes / No, Ascending / Descending…). */
function Radios({ name, options, value, onChange }: { name: string; options: Choice[]; value: string; onChange: (value: string) => void }) {
    return (
        <span className="flex flex-wrap items-center gap-x-5 gap-y-1.5 pt-1" role="radiogroup">
            {options.map((o) => (
                <label key={o.value} className="inline-flex cursor-pointer items-center gap-2 text-[13.5px] font-medium text-slate-700">
                    <input type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} />
                    {o.label}
                </label>
            ))}
        </span>
    );
}

/** Several choices in a dropdown, shown as chips (Perfex's multiple selectpicker). */
function MultiSelect({ options, value, placeholder, onChange }: { options: Choice[]; value: string[]; placeholder?: string; onChange: (value: string[]) => void }) {
    const chosen = options.filter((o) => value.includes(o.value));

    return (
        <Menu
            align="left"
            block
            trigger={(toggle) => (
                <button type="button" onClick={toggle} className={`${inputClass} flex min-h-[40px] flex-wrap items-center gap-1.5 pr-9 text-left relative`}>
                    {chosen.length === 0 && <span className="text-slate-400">{placeholder ?? 'Nothing selected'}</span>}
                    {chosen.map((o) => (
                        <span key={o.value} className="rounded-lg bg-brand-50 px-2 py-0.5 text-[12.5px] font-semibold text-brand">
                            {o.label}
                        </span>
                    ))}
                    <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                </button>
            )}
        >
            {() => (
                <div className="w-full min-w-[16rem]">
                    {options.map((o) => {
                        const on = value.includes(o.value);
                        return (
                            <button
                                key={o.value}
                                type="button"
                                onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
                                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13.5px] transition hover:bg-brand-50 ${on ? 'font-semibold text-brand' : 'text-slate-700'}`}
                            >
                                <span className={`flex h-4 w-4 items-center justify-center rounded border ${on ? 'border-brand bg-brand text-white' : 'border-slate-300'}`}>{on && <Check className="h-3 w-3" strokeWidth={3} />}</span>
                                {o.label}
                            </button>
                        );
                    })}
                </div>
            )}
        </Menu>
    );
}

/** A setting's label above a control that is not a single input (radios, multiselect): a plain block, not a <label>. */
function Block({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
    return (
        <div>
            <span className="mb-1.5 block text-[12.5px] font-semibold text-slate-600">{label}</span>
            {children}
            {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
        </div>
    );
}

/** A block of Setup options (Perfex Setup → Settings → Company / Finance / Leads …). */
export default function OptionsForm({ sections }: { sections: OptionSection[] }) {
    const toast = useToast();
    const [values, setValues] = useState<Record<string, string> | null>(null);
    const [saving, setSaving] = useState(false);
    // ?focus=<option name> (e.g. from Import Leads → "options"): scroll to that setting and highlight it.
    const [params] = useSearchParams();
    const [focused, setFocused] = useState<string | null>(params.get('focus'));

    useEffect(() => {
        api.get<{ data: Record<string, string> }>('/setup/options').then((r) => setValues(r.data.data));
    }, []);

    useEffect(() => {
        if (!values || !focused) {
            return;
        }
        document.getElementById(`option-${focused}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const timer = setTimeout(() => setFocused(null), 4000);

        return () => clearTimeout(timer);
    }, [values, focused]);

    if (!values) {
        return <Spinner />;
    }

    const set = (name: string, value: string) => setValues({ ...values, [name]: value });

    async function save() {
        setSaving(true);
        const names = sections.flatMap((s) => s.fields.flatMap((f) => (f.beside ? [f.name, f.beside.name] : [f.name])));
        try {
            const { data } = await api.put<{ data: Record<string, string> }>('/setup/options', { options: Object.fromEntries(names.map((n) => [n, values![n] ?? ''])) });
            setValues(data.data);
            toast('Settings saved.');
        } catch (e) {
            toast(errorMessage(e), 'error');
        } finally {
            setSaving(false);
        }
    }

    function control(field: OptionField): ReactNode {
        const value = values![field.name] ?? '';
        const list = value.split(',').filter(Boolean);

        switch (field.type) {
            case 'textarea':
                return <Textarea rows={4} value={value} onChange={(e) => set(field.name, e.target.value)} />;
            case 'select':
                return (
                    <Select value={value} onChange={(e) => set(field.name, e.target.value)}>
                        {(field.options ?? []).map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </Select>
                );
            case 'color':
                return (
                    <span className="flex items-center gap-2">
                        <input type="color" value={value || '#000000'} onChange={(e) => set(field.name, e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-gray-300 bg-white p-0.5" />
                        <Input value={value} onChange={(e) => set(field.name, e.target.value)} className="w-28" />
                    </span>
                );
            case 'checks':
                return (
                    <span className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
                        {(field.options ?? []).map((o) => {
                            const on = list.includes(o.value);
                            return (
                                <label key={o.value} className="inline-flex items-center gap-1.5 text-[13.5px] text-gray-700">
                                    <input type="checkbox" checked={on} onChange={() => set(field.name, (on ? list.filter((v) => v !== o.value) : [...list, o.value]).join(','))} />
                                    {o.label}
                                </label>
                            );
                        })}
                    </span>
                );
            case 'multiselect':
                return <MultiSelect options={field.options ?? []} value={list} placeholder={field.placeholder} onChange={(next) => set(field.name, next.join(','))} />;
            case 'yesno':
                return <Radios name={field.name} options={YES_NO} value={value || '0'} onChange={(v) => set(field.name, v)} />;
            case 'radios':
                return <Radios name={field.name} options={field.options ?? []} value={value} onChange={(v) => set(field.name, v)} />;
            case 'format':
                return (
                    <Select value={value || '1'} onChange={(e) => set(field.name, e.target.value)}>
                        {NUMBER_FORMATS.map((f) => (
                            <option key={f.id} value={f.id}>
                                {f.name}
                            </option>
                        ))}
                    </Select>
                );
            default:
                return <Input type={field.type === 'number' ? 'number' : 'text'} value={value} onChange={(e) => set(field.name, e.target.value)} />;
        }
    }

    function setting(field: OptionField, stacked: boolean): ReactNode {
        const block = field.type === 'yesno' || field.type === 'radios' || field.type === 'multiselect';
        const labelled = block ? (
            <Block label={field.label} hint={field.hint}>
                {control(field)}
            </Block>
        ) : (
            <Field label={field.label} hint={field.hint}>
                {control(field)}
            </Field>
        );

        return (
            <div
                key={field.name}
                id={`option-${field.name}`}
                className={`rounded-xl transition-all duration-500 ${stacked ? 'py-4 first:pt-0 last:pb-0' : field.type === 'textarea' || field.type === 'checks' ? 'sm:col-span-2' : ''} ${focused === field.name ? 'ring-2 ring-accent/50 ring-offset-[10px] ring-offset-accent-50' : ''}`}
            >
                {field.beside ? (
                    <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
                        {labelled}
                        <div className="sm:justify-self-end sm:pb-2">
                            <Radios name={field.beside.name} options={field.beside.options} value={values![field.beside.name] ?? ''} onChange={(v) => set(field.beside!.name, v)} />
                        </div>
                    </div>
                ) : (
                    labelled
                )}
            </div>
        );
    }

    // As Perfex: one panel holding the page's settings, "Save Settings" in its footer bar.
    return (
        <div className="panel_s !mb-0 overflow-hidden">
            <div className="divide-y divide-slate-100">
                {sections.map((section) => (
                    <div key={section.title} className="panel-body">
                        {sections.length > 1 && <h5 className="mb-4 font-semibold text-gray-800">{section.title}</h5>}
                        {section.stacked ? (
                            <div className="divide-y divide-slate-100">{section.fields.map((field) => setting(field, true))}</div>
                        ) : (
                            <div className="grid gap-4 sm:grid-cols-2">{section.fields.map((field) => setting(field, false))}</div>
                        )}
                    </div>
                ))}
            </div>
            <div className="flex justify-end border-t border-slate-200/80 bg-slate-50/80 px-6 py-3">
                <Button onClick={save} loading={saving}>
                    Save Settings
                </Button>
            </div>
        </div>
    );
}
