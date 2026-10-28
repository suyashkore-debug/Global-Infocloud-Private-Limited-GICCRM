import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../../lib/api';
import { Button, Card, Textarea } from '../../../components/ui';
import { useToast } from '../../../components/ui/Toast';
import type { Project } from '../../../types';

/** Private notes: each staff member sees only their own note for the project. */
export default function NotesTab({ project }: { project: Project }) {
    const toast = useToast();
    const [content, setContent] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        api.get<{ data: { content: string | null } }>(`/projects/${project.id}/note`).then((r) => setContent(r.data.data.content ?? ''));
    }, [project.id]);

    async function save() {
        setSaving(true);
        try {
            await api.put(`/projects/${project.id}/note`, { content });
            toast('Note saved.');
        } catch (e) {
            toast(errorMessage(e), 'error');
        } finally {
            setSaving(false);
        }
    }

    return (
        <Card className="p-5">
            <p className="mb-3 text-sm text-gray-500">Only you can see this note.</p>
            <Textarea rows={12} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Write your private notes for this project…" />
            <div className="mt-3 flex justify-end">
                <Button onClick={save} loading={saving}>
                    Save note
                </Button>
            </div>
        </Card>
    );
}
