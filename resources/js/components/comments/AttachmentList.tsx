import { Download, ExternalLink, FileText, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { formatBytes, formatDateTime } from '../../lib/format';
import type { Attachment } from '../../types';
import { IconButton } from '../ui';

/** Downloads go through the API (they need the login token), then open as a browser download. */
export async function downloadAttachment(file: Attachment): Promise<void> {
    if (file.external_link) {
        window.open(file.external_link, '_blank', 'noopener');
        return;
    }
    if (!file.download_url) {
        return;
    }
    const response = await api.get(file.download_url.replace(/^\/api/, ''), { responseType: 'blob' });
    const url = URL.createObjectURL(response.data as Blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.original_name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AttachmentList({ files, canDelete, onDelete }: { files: Attachment[]; canDelete: (file: Attachment) => boolean; onDelete: (file: Attachment) => void }) {
    if (files.length === 0) {
        return null;
    }

    return (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {files.map((file) => (
                <li key={file.id} className="flex items-center gap-3 px-3 py-2">
                    <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                    <div className="min-w-0 flex-1">
                        <button type="button" onClick={() => downloadAttachment(file)} className="block max-w-full truncate text-left text-sm font-medium text-blue-700 hover:underline">
                            {file.original_name}
                        </button>
                        <p className="text-xs text-gray-500">
                            {file.external_link ? 'Link' : formatBytes(file.size)} · {file.user?.full_name} · {formatDateTime(file.created_at)}
                        </p>
                    </div>
                    <IconButton label={file.external_link ? 'Open link' : 'Download'} onClick={() => downloadAttachment(file)}>
                        {file.external_link ? <ExternalLink className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                    </IconButton>
                    {canDelete(file) && (
                        <IconButton label="Delete" onClick={() => onDelete(file)} className="hover:text-red-600">
                            <Trash2 className="h-4 w-4" />
                        </IconButton>
                    )}
                </li>
            ))}
        </ul>
    );
}
