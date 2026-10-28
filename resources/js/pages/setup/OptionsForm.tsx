import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import { Button, Field, Input, Select, Spinner, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

export interface OptionField {
    name: string;
    label: string;
    type?: 'text' | 'number' | 'textarea' | 'format' | 'yesno' | 'select' | 'color' | 'checks';
    hint?: string;
    /** Choices for "select" and "checks" (checks are saved comma separated). */
    options?: { value: string; label: string }[];
}

const NUMBER_FORMATS = [
    { id: '1', name: 'Number based (000001)' },
    { id: '2', name: 'Year based (YYYY/000001)' },
    { id: '3', name: '000001-YY' },
    { id: '4', name: '000001/MM/YYYY' },
];

/** A block of Setup options (Perfex Setup → Settings → Company / Finance). */
export default function OptionsForm({ sections }: { sections: { title: string; fields: OptionField[] }[] }) {
    const toast = useToast();
    const [values, setValues] = useState<Record<string, string> | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        api.get<{ data: Record<string, string> }>('/setup/options').then((r) => setValues(r.data.data));
    }, []);

    if (!values) {
        return <Spinner />;
    }

    async function save() {
        setSaving(true);
        const names = sections.flatMap((s) => s.fields.map((f) => f.name));
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

    return (
        <div className="space-y-4">
            {sections.map((section) => (
                <div key={section.title} className="panel_s">
                    <div className="panel-body">
                        <h5 className="mb-4 font-semibold text-gray-800">{section.title}</h5>
                        <div className="grid gap-4 sm:grid-cols-2">
                            {section.fields.map((field) => (
                                <Field key={field.name} label={field.label} hint={field.hint} className={field.type === 'textarea' || field.type === 'checks' ? 'sm:col-span-2' : ''}>
                                    {field.type === 'textarea' ? (
                                        <Textarea rows={4} value={values[field.name] ?? ''} onChange={(e) => setValues({ ...values, [field.name]: e.target.value })} />
                                    ) : field.type === 'select' ? (
                                        <Select value={values[field.name] ?? ''} onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}>
                                            {(field.options ?? []).map((o) => (
                                                <option key={o.value} value={o.value}>
                                                    {o.label}
                                                </option>
                                            ))}
                                        </Select>
                                    ) : field.type === 'color' ? (
                                        <span className="flex items-center gap-2">
                                            <input type="color" value={values[field.name] || '#000000'} onChange={(e) => setValues({ ...values, [field.name]: e.target.value })} className="h-9 w-12 cursor-pointer rounded border border-gray-300 bg-white p-0.5" />
                                            <Input value={values[field.name] ?? ''} onChange={(e) => setValues({ ...values, [field.name]: e.target.value })} className="w-28" />
                                        </span>
                                    ) : field.type === 'checks' ? (
                                        <span className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
                                            {(field.options ?? []).map((o) => {
                                                const list = (values[field.name] ?? '').split(',').filter(Boolean);
                                                const on = list.includes(o.value);

                                                return (
                                                    <label key={o.value} className="inline-flex items-center gap-1.5 text-[13.5px] text-gray-700">
                                                        <input type="checkbox" checked={on} onChange={() => setValues({ ...values, [field.name]: (on ? list.filter((v) => v !== o.value) : [...list, o.value]).join(',') })} />
                                                        {o.label}
                                                    </label>
                                                );
                                            })}
                                        </span>
                                    ) : field.type === 'yesno' ? (
                                        <Select value={values[field.name] ?? '0'} onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}>
                                            <option value="1">Yes</option>
                                            <option value="0">No</option>
                                        </Select>
                                    ) : field.type === 'format' ? (
                                        <Select value={values[field.name] ?? '1'} onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}>
                                            {NUMBER_FORMATS.map((f) => (
                                                <option key={f.id} value={f.id}>
                                                    {f.name}
                                                </option>
                                            ))}
                                        </Select>
                                    ) : (
                                        <Input type={field.type === 'number' ? 'number' : 'text'} value={values[field.name] ?? ''} onChange={(e) => setValues({ ...values, [field.name]: e.target.value })} />
                                    )}
                                </Field>
                            ))}
                        </div>
                    </div>
                </div>
            ))}
            <div className="flex justify-end">
                <Button onClick={save} loading={saving}>
                    Save Settings
                </Button>
            </div>
        </div>
    );
}
