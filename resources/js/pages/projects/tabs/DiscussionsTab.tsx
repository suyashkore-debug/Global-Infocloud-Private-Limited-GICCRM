import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, MessageSquare, Pencil, Plus, Reply, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../../lib/api';
import { formatDateTime, timeAgo } from '../../../lib/format';
import { useApi } from '../../../hooks/useApi';
import { useStaff } from '../../../hooks/useStaff';
import { AttachmentList } from '../../../components/comments/AttachmentList';
import { CommentBox, MentionText } from '../../../components/comments/Mentions';
import { Avatar, Button, Card, EmptyState, Field, IconButton, Input, Modal, Spinner, Textarea } from '../../../components/ui';
import { useToast } from '../../../components/ui/Toast';
import type { Comment, Discussion, Project } from '../../../types';

export default function DiscussionsTab({ project }: { project: Project }) {
    const [params, setParams] = useSearchParams();
    const discussionId = Number(params.get('discussion')) || null;
    const list = useApi<{ data: Discussion[] }>(discussionId ? null : `/projects/${project.id}/discussions`);
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<Discussion | null>(null);

    const open = (id: number | null) =>
        setParams((current) => {
            const next = new URLSearchParams(current);
            if (id) {
                next.set('discussion', String(id));
            } else {
                next.delete('discussion');
            }
            return next;
        });

    if (discussionId) {
        return <DiscussionView id={discussionId} project={project} onBack={() => open(null)} onEdit={(d) => (setEditing(d), setFormOpen(true))} formOpen={formOpen} />;
    }

    return (
        <div className="space-y-4">
            {project.can.contribute && (
                <Button onClick={() => (setEditing(null), setFormOpen(true))}>
                    <Plus className="h-4 w-4" /> New discussion
                </Button>
            )}
            {!list.data ? (
                <Spinner />
            ) : list.data.data.length === 0 ? (
                <EmptyState title="No discussions yet" text="Start a discussion with the project team." />
            ) : (
                <Card className="divide-y divide-gray-100">
                    {list.data.data.map((d) => (
                        <button key={d.id} type="button" onClick={() => open(d.id)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-gray-50">
                            <Avatar id={d.user?.id} name={d.user?.full_name} />
                            <div className="min-w-0 flex-1">
                                <p className="font-medium text-gray-900">{d.subject}</p>
                                {d.description && <p className="line-clamp-1 text-sm text-gray-500">{d.description}</p>}
                                <p className="mt-0.5 text-xs text-gray-400">
                                    {d.user?.full_name} · Last activity {d.last_activity_at ? timeAgo(d.last_activity_at) : '—'}
                                </p>
                            </div>
                            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                                <MessageSquare className="h-3.5 w-3.5" />
                                {d.comments_count ?? 0}
                            </span>
                        </button>
                    ))}
                </Card>
            )}
            <DiscussionFormModal
                open={formOpen}
                project={project}
                discussion={editing}
                onClose={() => setFormOpen(false)}
                onSaved={(d) => {
                    setFormOpen(false);
                    list.reload();
                    if (!editing) {
                        open(d.id);
                    }
                }}
            />
        </div>
    );
}

function DiscussionView({ id, project, onBack, onEdit, formOpen }: { id: number; project: Project; onBack: () => void; onEdit: (d: Discussion) => void; formOpen: boolean }) {
    const toast = useToast();
    const staff = useStaff();
    const { data, reload } = useApi<{ data: Discussion }>(`/discussions/${id}`);
    const [replyTo, setReplyTo] = useState<number | null>(null);
    useEffect(() => {
        if (!formOpen) {
            reload();
        }
    }, [formOpen, reload]);

    const discussion = data?.data;
    if (!discussion) {
        return <Spinner />;
    }

    async function post(content: string, files: File[], parentId: number | null) {
        const body = new FormData();
        if (content) {
            body.append('content', content);
        }
        if (parentId) {
            body.append('parent_id', String(parentId));
        }
        files.forEach((f) => body.append('files[]', f));
        try {
            await api.post(`/discussions/${id}/comments`, body);
            setReplyTo(null);
            reload();
        } catch (e) {
            toast(errorMessage(e), 'error');
            throw e;
        }
    }

    async function removeDiscussion() {
        if (!discussion || !confirm('Delete this discussion and all its comments?')) {
            return;
        }
        try {
            await api.delete(`/discussions/${discussion.id}`);
            toast('Discussion deleted.');
            onBack();
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    const comments = discussion.comments ?? [];
    const roots = comments.filter((c) => !c.parent_id);
    const replies = (parentId: number) => comments.filter((c) => c.parent_id === parentId);
    const canManage = discussion.is_own || project.can.update;

    return (
        <div className="space-y-4">
            <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800">
                <ArrowLeft className="h-4 w-4" /> All discussions
            </button>
            <Card className="p-5">
                <div className="flex items-start gap-3">
                    <Avatar id={discussion.user?.id} name={discussion.user?.full_name} />
                    <div className="min-w-0 flex-1">
                        <h2 className="text-lg font-semibold">{discussion.subject}</h2>
                        <p className="text-xs text-gray-500">
                            {discussion.user?.full_name} · {formatDateTime(discussion.created_at)}
                        </p>
                        {discussion.description && <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700">{discussion.description}</p>}
                    </div>
                    {canManage && (
                        <div className="flex gap-1">
                            <IconButton label="Edit" onClick={() => onEdit(discussion)}>
                                <Pencil className="h-4 w-4" />
                            </IconButton>
                            <IconButton label="Delete" onClick={removeDiscussion} className="hover:text-red-600">
                                <Trash2 className="h-4 w-4" />
                            </IconButton>
                        </div>
                    )}
                </div>
            </Card>

            <Card className="space-y-5 p-5">
                <h3 className="font-semibold">Comments ({comments.length})</h3>
                {roots.map((comment) => (
                    <div key={comment.id}>
                        <DiscussionComment comment={comment} project={project} onReply={() => setReplyTo(comment.id)} reload={reload} />
                        <div className="ml-11 mt-3 space-y-3 border-l-2 border-gray-100 pl-4">
                            {replies(comment.id).map((reply) => (
                                <DiscussionComment key={reply.id} comment={reply} project={project} reload={reload} />
                            ))}
                            {replyTo === comment.id && <CommentBox staff={staff} allowFiles placeholder="Write a reply…" submitLabel="Reply" onCancel={() => setReplyTo(null)} onSubmit={(content, files) => post(content, files, comment.id)} />}
                        </div>
                    </div>
                ))}
                <div className="border-t border-gray-100 pt-4">
                    <CommentBox staff={staff} allowFiles onSubmit={(content, files) => post(content, files, null)} />
                </div>
            </Card>
        </div>
    );
}

function DiscussionComment({ comment, project, onReply, reload }: { comment: Comment; project: Project; onReply?: () => void; reload: () => void }) {
    const toast = useToast();

    async function remove() {
        if (!confirm('Delete this comment?')) {
            return;
        }
        try {
            await api.delete(`/discussion-comments/${comment.id}`);
            reload();
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    return (
        <div className="flex gap-3">
            <Avatar id={comment.user?.id} name={comment.user?.full_name} />
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span className="font-semibold text-gray-800">{comment.user?.full_name}</span>
                    {timeAgo(comment.created_at)}
                    <span className="ml-auto flex gap-3">
                        {onReply && (
                            <button type="button" onClick={onReply} className="inline-flex items-center gap-1 hover:text-gray-800">
                                <Reply className="h-3 w-3" /> Reply
                            </button>
                        )}
                        {(comment.is_own || project.can.update) && (
                            <button type="button" onClick={remove} className="hover:text-red-600">
                                Delete
                            </button>
                        )}
                    </span>
                </div>
                {comment.content && (
                    <div className="mt-1 rounded-lg bg-gray-50 px-3 py-2">
                        <MentionText text={comment.content} />
                    </div>
                )}
                {comment.attachments && comment.attachments.length > 0 && (
                    <div className="mt-2">
                        <AttachmentList files={comment.attachments} canDelete={() => false} onDelete={() => {}} />
                    </div>
                )}
            </div>
        </div>
    );
}

function DiscussionFormModal({ open, project, discussion, onClose, onSaved }: { open: boolean; project: Project; discussion: Discussion | null; onClose: () => void; onSaved: (d: Discussion) => void }) {
    const toast = useToast();
    const [subject, setSubject] = useState('');
    const [description, setDescription] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) {
            setSubject(discussion?.subject ?? '');
            setDescription(discussion?.description ?? '');
        }
    }, [open, discussion]);

    async function save() {
        setSaving(true);
        try {
            const { data } = discussion
                ? await api.put<{ data: Discussion }>(`/discussions/${discussion.id}`, { subject, description })
                : await api.post<{ data: Discussion }>(`/projects/${project.id}/discussions`, { subject, description });
            toast(discussion ? 'Discussion updated.' : 'Discussion created.');
            onSaved(data.data);
        } catch (e) {
            toast(errorMessage(e), 'error');
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={discussion ? 'Edit discussion' : 'New discussion'}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={save} loading={saving} disabled={!subject.trim()}>
                        Save
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <Field label="Subject" required>
                    <Input value={subject} onChange={(e) => setSubject(e.target.value)} autoFocus />
                </Field>
                <Field label="Description">
                    <Textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
                </Field>
            </div>
        </Modal>
    );
}
