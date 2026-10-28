import { useState } from 'react';
import { Link2, Upload } from 'lucide-react';
import { api, errorMessage } from '../../../lib/api';
import { useApi } from '../../../hooks/useApi';
import { AttachmentList } from '../../../components/comments/AttachmentList';
import { Button, Card, EmptyState, Field, Input, Modal, Spinner } from '../../../components/ui';
import { useToast } from '../../../components/ui/Toast';
import type { Attachment, Project } from '../../../types';

export default function FilesTab({ project }: { project: Project }) {
    const toast = useToast();
    const { data, reload } = useApi<{ data: Attachment[] }>(`/projects/${project.id}/files`);
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [linkOpen, setLinkOpen] = useState(false);
    const [link, setLink] = useState({ name: '', external_link: '' });

    async function upload(files: File[]) {
        if (!files.length) {
            return;
        }
        setUploading(true);
        const body = new FormData();
        files.forEach((f) => body.append('files[]', f));
        try {
            await api.post(`/projects/${project.id}/files`, body);
            toast(`${files.length} file(s) uploaded.`);
            reload();
        } catch (e) {
            toast(errorMessage(e), 'error');
        } finally {
            setUploading(false);
        }
    }

    async function saveLink() {
        try {
            await api.post(`/projects/${project.id}/files/link`, link);
            toast('Link added.');
            setLinkOpen(false);
            setLink({ name: '', external_link: '' });
            reload();
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    async function remove(file: Attachment) {
        if (!confirm(`Delete ${file.original_name}?`)) {
            return;
        }
        try {
            await api.delete(`/files/${file.id}`);
            toast('File deleted.');
            reload();
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    return (
        <div className="space-y-4">
            {project.can.contribute && (
                <>
                    <label
                        onDragOver={(e) => (e.preventDefault(), setDragOver(true))}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => {
                            e.preventDefault();
                            setDragOver(false);
                            upload(Array.from(e.dataTransfer.files));
                        }}
                        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-white hover:bg-gray-50'}`}
                    >
                        <Upload className="h-6 w-6 text-gray-400" />
                        <span className="mt-2 text-sm font-medium text-gray-700">{uploading ? 'Uploading…' : 'Drop files here or click to upload'}</span>
                        <span className="text-xs text-gray-500">Up to 20 MB per file</span>
                        <input type="file" multiple className="hidden" onChange={(e) => (upload(Array.from(e.target.files ?? [])), (e.target.value = ''))} />
                    </label>
                    <Button variant="secondary" size="sm" onClick={() => setLinkOpen(true)}>
                        <Link2 className="h-4 w-4" /> Add external link
                    </Button>
                </>
            )}
            {!data ? (
                <Spinner />
            ) : data.data.length === 0 ? (
                <EmptyState title="No files yet" />
            ) : (
                <Card className="p-2">
                    <AttachmentList files={data.data} canDelete={(f) => f.is_own || project.can.update} onDelete={remove} />
                </Card>
            )}
            <Modal
                open={linkOpen}
                onClose={() => setLinkOpen(false)}
                size="sm"
                title="Add external link"
                footer={
                    <Button onClick={saveLink} disabled={!link.name || !link.external_link}>
                        Save
                    </Button>
                }
            >
                <div className="space-y-4">
                    <Field label="Name" required>
                        <Input value={link.name} onChange={(e) => setLink({ ...link, name: e.target.value })} placeholder="e.g. Design in Figma" />
                    </Field>
                    <Field label="Link" required>
                        <Input type="url" value={link.external_link} onChange={(e) => setLink({ ...link, external_link: e.target.value })} placeholder="https://" />
                    </Field>
                </div>
            </Modal>
        </div>
    );
}
