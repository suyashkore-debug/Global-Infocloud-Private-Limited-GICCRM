import { useState } from 'react';
import { Upload } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { AttachmentList } from '../../components/comments/AttachmentList';
import { useToast } from '../../components/ui/Toast';
import type { Attachment } from '../../types';

/** The vendor's bill (scan / PDF) attached to a purchase invoice. */
export function FilesPanelFor({ invoiceId, files, canUpload, onChange }: { invoiceId: number; files: Attachment[]; canUpload: boolean; onChange: () => void }) {
    const toast = useToast();
    const [uploading, setUploading] = useState(false);

    async function upload(list: File[]) {
        if (!list.length) {
            return;
        }
        setUploading(true);
        const body = new FormData();
        list.forEach((f) => body.append('files[]', f));
        try {
            await api.post(`/purchase/invoices/${invoiceId}/files`, body);
            onChange();
        } catch (e) {
            toast(errorMessage(e), 'error');
        } finally {
            setUploading(false);
        }
    }

    return (
        <div className="panel_s">
            <div className="panel-body space-y-3">
                <h5 className="font-semibold">Attachments</h5>
                {canUpload && (
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-gray-300 px-3 py-2 text-[13px] text-gray-600 hover:bg-gray-50">
                        <Upload className="h-4 w-4" /> {uploading ? 'Uploading…' : "Upload the vendor's bill"}
                        <input type="file" multiple className="hidden" onChange={(e) => (upload(Array.from(e.target.files ?? [])), (e.target.value = ''))} />
                    </label>
                )}
                <AttachmentList files={files} canDelete={() => canUpload} onDelete={(f) => confirm(`Delete ${f.original_name}?`) && api.delete(`/files/${f.id}`).then(onChange)} />
                {files.length === 0 && <p className="text-[13px] text-gray-500">No files.</p>}
            </div>
        </div>
    );
}
