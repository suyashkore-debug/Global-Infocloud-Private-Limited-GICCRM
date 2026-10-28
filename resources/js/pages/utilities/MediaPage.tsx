import { useState } from 'react';
import { ChevronRight, Download, FileText, Folder, FolderPlus, Trash2, Upload } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { formatBytes, formatDateTime } from '../../lib/format';
import { useAuth } from '../../auth/AuthContext';
import { useApi } from '../../hooks/useApi';
import { Button, IconButton, Spinner } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

interface MediaItem {
    id: number;
    original_name: string;
    mime_type: string | null;
    size: number;
    is_image: boolean;
    user: string | null;
    is_own: boolean;
    created_at: string;
}

/** Utilities → Media: shared files in folders. */
export default function MediaPage() {
    const toast = useToast();
    const { user } = useAuth();
    const [folder, setFolder] = useState('');
    const [extraFolders, setExtraFolders] = useState<string[]>([]);
    const { data, reload } = useApi<{ data: MediaItem[]; folders: string[] }>('/media', { folder });

    async function upload(files: File[]) {
        if (!files.length) {
            return;
        }
        const body = new FormData();
        body.append('folder', folder);
        files.forEach((f) => body.append('files[]', f));
        try {
            await api.post('/media', body);
            toast('Uploaded.');
            reload();
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    async function download(item: MediaItem) {
        const response = await api.get(`/media/${item.id}/download`, { responseType: 'blob' });
        const url = URL.createObjectURL(response.data as Blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = item.original_name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    const crumbs = folder ? folder.split('/') : [];
    const folders = [...new Set([...(data?.folders ?? []), ...extraFolders.filter((f) => f.startsWith(folder ? `${folder}/` : '')).map((f) => (folder ? f.slice(folder.length + 1) : f).split('/')[0])])];

    return (
        <div className="w-full space-y-4">
            <h4 className="page-title">Media</h4>
            <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-brand bg-brand px-3 py-1.5 text-[13.45px] font-medium text-white hover:bg-gray-900">
                    <Upload className="h-4 w-4" /> Upload
                    <input type="file" multiple className="hidden" onChange={(e) => (upload(Array.from(e.target.files ?? [])), (e.target.value = ''))} />
                </label>
                <Button
                    variant="secondary"
                    onClick={() => {
                        const name = prompt('Folder name')?.trim().replace(/[^\w\- ]/g, '');
                        if (name) {
                            setExtraFolders((f) => [...f, folder ? `${folder}/${name}` : name]);
                        }
                    }}
                >
                    <FolderPlus className="h-4 w-4" /> New Folder
                </Button>
            </div>
            <div className="flex flex-wrap items-center gap-1 text-[13.5px]">
                <button type="button" onClick={() => setFolder('')} className="text-blue-600 hover:underline">
                    Media
                </button>
                {crumbs.map((c, i) => (
                    <span key={i} className="flex items-center gap-1">
                        <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                        <button type="button" onClick={() => setFolder(crumbs.slice(0, i + 1).join('/'))} className="text-blue-600 hover:underline">
                            {c}
                        </button>
                    </span>
                ))}
            </div>
            {!data ? (
                <Spinner />
            ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                    {folders.map((f) => (
                        <button key={f} type="button" onClick={() => setFolder(folder ? `${folder}/${f}` : f)} className="flex flex-col items-center gap-2 rounded-lg border border-gray-200 bg-white p-4 hover:border-blue-300">
                            <Folder className="h-10 w-10 text-amber-400" />
                            <span className="w-full truncate text-center text-[13px]">{f}</span>
                        </button>
                    ))}
                    {data.data.map((m) => (
                        <div key={m.id} className="group relative flex flex-col items-center gap-2 rounded-lg border border-gray-200 bg-white p-4">
                            <FileText className="h-10 w-10 text-gray-400" />
                            <span className="w-full truncate text-center text-[13px]" title={m.original_name}>
                                {m.original_name}
                            </span>
                            <span className="text-[11px] text-gray-400" title={formatDateTime(m.created_at)}>
                                {formatBytes(m.size)} · {m.user}
                            </span>
                            <div className="absolute right-1 top-1 hidden gap-0.5 group-hover:flex">
                                <IconButton label="Download" onClick={() => download(m)}>
                                    <Download className="h-3.5 w-3.5" />
                                </IconButton>
                                {(m.is_own || user?.is_admin) && (
                                    <IconButton label="Delete" onClick={() => confirm(`Delete ${m.original_name}?`) && api.delete(`/media/${m.id}`).then(reload)} className="hover:text-red-600">
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </IconButton>
                                )}
                            </div>
                        </div>
                    ))}
                    {folders.length === 0 && data.data.length === 0 && <p className="col-span-full text-[13px] text-gray-500">This folder is empty.</p>}
                </div>
            )}
        </div>
    );
}
