import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Globe, MessageSquare, Paperclip, Pin, PinOff, ThumbsUp, Trash2, Users, X } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { formatDateTime, timeAgo } from '../../lib/format';
import { useApi } from '../../hooks/useApi';
import { downloadAttachment } from '../../components/comments/AttachmentList';
import { AuthImage } from '../../components/comments/AuthImage';
import { Avatar, Button, Modal, Spinner, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../auth/AuthContext';
import type { Attachment } from '../../types';

type Person = { id: number; full_name: string; photo_url: string | null };
type Comment = { id: number; author: Person; content: string; created_at: string; likes_count: number; liked: boolean; can_delete: boolean };
type Post = {
    id: number;
    author: Person;
    content: string;
    visibility: string[] | null;
    pinned: boolean;
    created_at: string;
    likes_count: number;
    liked: boolean;
    likers: string[];
    can_delete: boolean;
    can_pin: boolean;
    attachments: Attachment[];
    comments: Comment[];
};

/** Perfex Newsfeed: share posts with all staff or some departments; like and comment. */
export default function NewsfeedPage() {
    const toast = useToast();
    const [params, setParams] = useSearchParams();
    const single = Number(params.get('post')) || null;
    const [page, setPage] = useState(1);
    const [posts, setPosts] = useState<Post[] | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [likersOf, setLikersOf] = useState<number | null>(null);

    useEffect(() => {
        let active = true;
        api.get<{ data: Post[]; meta: { has_more: boolean } }>('/newsfeed', { params: single ? { post: single } : { page } })
            .then((r) => {
                if (!active) {
                    return;
                }
                setPosts((prev) => (page > 1 && !single ? [...(prev ?? []), ...r.data.data] : r.data.data));
                setHasMore(r.data.meta.has_more);
            })
            .catch((e) => toast(errorMessage(e), 'error'));

        return () => {
            active = false;
        };
    }, [page, single, toast]);

    const replace = (post: Post) => setPosts((list) => list?.map((p) => (p.id === post.id ? post : p)) ?? null);
    const refreshFirstPage = () => {
        setPage(1);
        api.get<{ data: Post[]; meta: { has_more: boolean } }>('/newsfeed', { params: { page: 1 } }).then((r) => {
            setPosts(r.data.data);
            setHasMore(r.data.meta.has_more);
        });
    };

    async function act(call: () => Promise<{ data: { data: Post } }>) {
        try {
            replace((await call()).data.data);
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    async function remove(post: Post) {
        if (!confirm('Delete this post?')) {
            return;
        }
        await api.delete(`/newsfeed/${post.id}`);
        setPosts((list) => list?.filter((p) => p.id !== post.id) ?? null);
    }

    async function pin(post: Post) {
        await api.post(`/newsfeed/${post.id}/pin`, { pinned: !post.pinned });
        refreshFirstPage();
    }

    return (
        <div className="max-w-3xl space-y-4">
            <h4 className="page-title">Newsfeed</h4>
            {single ? (
                <button type="button" onClick={() => setParams({})} className="text-[13px] font-medium text-blue-600 hover:underline">
                    ← Show all posts
                </button>
            ) : (
                <Composer onPosted={refreshFirstPage} />
            )}
            {!posts ? (
                <Spinner />
            ) : posts.length === 0 ? (
                <p className="panel_s panel-body text-center text-[13px] text-gray-500">{single ? 'This post is not available.' : 'No posts yet. Share the first one!'}</p>
            ) : (
                posts.map((post) => (
                    <PostCard
                        key={post.id}
                        post={post}
                        onLike={() => act(() => (post.liked ? api.delete(`/newsfeed/${post.id}/like`) : api.post(`/newsfeed/${post.id}/like`)))}
                        onComment={(content) => act(() => api.post(`/newsfeed/${post.id}/comments`, { content }))}
                        onLikeComment={(c) => act(() => (c.liked ? api.delete(`/newsfeed-comments/${c.id}/like`) : api.post(`/newsfeed-comments/${c.id}/like`)))}
                        onDeleteComment={(c) => confirm('Delete this comment?') && act(() => api.delete(`/newsfeed-comments/${c.id}`))}
                        onDelete={() => remove(post)}
                        onPin={() => pin(post)}
                        onShowLikers={() => setLikersOf(post.id)}
                    />
                ))
            )}
            {hasMore && !single && (
                <div className="text-center">
                    <Button variant="secondary" onClick={() => setPage(page + 1)}>
                        Load More
                    </Button>
                </div>
            )}
            {likersOf && <LikersModal postId={likersOf} onClose={() => setLikersOf(null)} />}
        </div>
    );
}

function Composer({ onPosted }: { onPosted: () => void }) {
    const toast = useToast();
    const { user } = useAuth();
    const { data: departments } = useApi<{ data: { id: number; name: string }[] }>('/setup/support-departments');
    const [content, setContent] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const [visibility, setVisibility] = useState<number[]>([]);
    const [saving, setSaving] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);

    async function submit() {
        setSaving(true);
        const body = new FormData();
        body.append('content', content);
        visibility.forEach((id) => body.append('visibility[]', String(id)));
        files.forEach((f) => body.append('files[]', f));
        try {
            await api.post('/newsfeed', body);
            setContent('');
            setFiles([]);
            setVisibility([]);
            onPosted();
        } catch (e) {
            toast(errorMessage(e), 'error');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="panel_s">
            <div className="panel-body space-y-3">
                <div className="flex gap-3">
                    <Avatar id={user?.id} name={user?.full_name} photo={user?.photo_url} />
                    <Textarea rows={3} value={content} onChange={(e) => setContent(e.target.value)} placeholder="What's on your mind?" />
                </div>
                {files.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {files.map((f, i) => (
                            <span key={i} className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">
                                {f.name}
                                <button type="button" onClick={() => setFiles(files.filter((_, fi) => fi !== i))} className="text-gray-400 hover:text-red-600">
                                    <X className="h-3 w-3" />
                                </button>
                            </span>
                        ))}
                    </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-gray-600 hover:bg-gray-100">
                        <Paperclip className="h-4 w-4" /> Attach
                    </button>
                    <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => (setFiles([...files, ...Array.from(e.target.files ?? [])]), (e.target.value = ''))} />
                    <details className="relative">
                        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-gray-600 hover:bg-gray-100">
                            {visibility.length ? <Users className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
                            {visibility.length ? `${visibility.length} department(s)` : 'All staff'}
                        </summary>
                        <div className="absolute z-10 mt-1 w-56 rounded-md border border-gray-200 bg-white p-2 shadow-lg">
                            <p className="mb-1 text-xs text-gray-500">Visible to (none = all staff)</p>
                            {(departments?.data ?? []).map((d) => (
                                <label key={d.id} className="flex items-center gap-2 py-1 text-[13px]">
                                    <input type="checkbox" checked={visibility.includes(d.id)} onChange={(e) => setVisibility(e.target.checked ? [...visibility, d.id] : visibility.filter((v) => v !== d.id))} />
                                    {d.name}
                                </label>
                            ))}
                            {departments?.data.length === 0 && <p className="text-xs text-gray-500">No departments (Setup → Support Departments).</p>}
                        </div>
                    </details>
                    <Button className="ml-auto" onClick={submit} loading={saving} disabled={!content.trim() && files.length === 0}>
                        Post
                    </Button>
                </div>
            </div>
        </div>
    );
}

function PostCard(props: {
    post: Post;
    onLike: () => void;
    onComment: (content: string) => void;
    onLikeComment: (c: Comment) => void;
    onDeleteComment: (c: Comment) => void;
    onDelete: () => void;
    onPin: () => void;
    onShowLikers: () => void;
}) {
    const { post } = props;
    const [text, setText] = useState('');
    const [showAll, setShowAll] = useState(false);
    const images = post.attachments.filter((a) => a.is_image && a.download_url);
    const others = post.attachments.filter((a) => !a.is_image || !a.download_url);
    const comments = showAll ? post.comments : post.comments.slice(-3);

    return (
        <div className={`panel_s ${post.pinned ? 'ring-1 ring-amber-300' : ''}`}>
            <div className="panel-body space-y-3">
                <div className="flex items-start gap-3">
                    <Avatar id={post.author.id} name={post.author.full_name} photo={post.author.photo_url} />
                    <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold text-gray-900">{post.author.full_name}</p>
                        <p className="text-xs text-gray-500" title={formatDateTime(post.created_at)}>
                            {timeAgo(post.created_at)} · {post.visibility ? `Visible to: ${post.visibility.join(', ')}` : 'All staff'}
                            {post.pinned && <span className="ml-1 font-medium text-amber-600">· Pinned</span>}
                        </p>
                    </div>
                    {post.can_pin && (
                        <button type="button" onClick={props.onPin} className="p-1 text-gray-400 hover:text-amber-600" title={post.pinned ? 'Unpin post' : 'Pin post'}>
                            {post.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                        </button>
                    )}
                    {post.can_delete && (
                        <button type="button" onClick={props.onDelete} className="p-1 text-gray-400 hover:text-red-600" title="Delete post">
                            <Trash2 className="h-4 w-4" />
                        </button>
                    )}
                </div>
                {post.content && <p className="whitespace-pre-wrap text-[14px] text-gray-800">{post.content}</p>}
                {images.length > 0 && (
                    <div className={`grid gap-2 ${images.length > 1 ? 'grid-cols-2' : ''}`}>
                        {images.map((img) => (
                            <AuthImage key={img.id} url={img.download_url!} alt={img.original_name} onClick={() => downloadAttachment(img)} className="max-h-96 w-full cursor-pointer rounded-md object-cover" />
                        ))}
                    </div>
                )}
                {others.map((f) => (
                    <button key={f.id} type="button" onClick={() => downloadAttachment(f)} className="flex items-center gap-1.5 text-[13px] text-blue-600 hover:underline">
                        <Paperclip className="h-3.5 w-3.5" /> {f.original_name}
                    </button>
                ))}
                <div className="flex items-center gap-4 border-y border-gray-100 py-1.5 text-[13px]">
                    <button type="button" onClick={props.onLike} className={`inline-flex items-center gap-1.5 font-medium ${post.liked ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}>
                        <ThumbsUp className="h-4 w-4" /> {post.liked ? 'Unlike' : 'Like'}
                    </button>
                    <span className="inline-flex items-center gap-1.5 text-gray-600">
                        <MessageSquare className="h-4 w-4" /> {post.comments.length} comment(s)
                    </span>
                    {post.likes_count > 0 && (
                        <button type="button" onClick={props.onShowLikers} className="ml-auto text-xs text-gray-500 hover:underline">
                            {post.liked ? 'You' : post.likers[0]}
                            {post.likes_count > 1 ? ` and ${post.likes_count - 1} other(s)` : ''} like this
                        </button>
                    )}
                </div>
                {post.comments.length > 3 && !showAll && (
                    <button type="button" onClick={() => setShowAll(true)} className="text-xs font-medium text-blue-600 hover:underline">
                        View all {post.comments.length} comments
                    </button>
                )}
                <ul className="space-y-2">
                    {comments.map((c) => (
                        <li key={c.id} className="flex gap-2">
                            <Avatar id={c.author.id} name={c.author.full_name} photo={c.author.photo_url} size="sm" />
                            <div className="min-w-0 flex-1 rounded-md bg-gray-50 px-3 py-2">
                                <p className="text-[13px]">
                                    <span className="font-semibold">{c.author.full_name}</span> <span className="whitespace-pre-wrap text-gray-700">{c.content}</span>
                                </p>
                                <p className="mt-0.5 flex gap-3 text-xs text-gray-400">
                                    <span title={formatDateTime(c.created_at)}>{timeAgo(c.created_at)}</span>
                                    <button type="button" onClick={() => props.onLikeComment(c)} className={c.liked ? 'font-medium text-blue-600' : 'hover:text-gray-700'}>
                                        {c.liked ? 'Unlike' : 'Like'}
                                        {c.likes_count > 0 ? ` (${c.likes_count})` : ''}
                                    </button>
                                    {c.can_delete && (
                                        <button type="button" onClick={() => props.onDeleteComment(c)} className="hover:text-red-600">
                                            Delete
                                        </button>
                                    )}
                                </p>
                            </div>
                        </li>
                    ))}
                </ul>
                <div className="flex gap-2">
                    <Textarea
                        rows={1}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey && text.trim()) {
                                e.preventDefault();
                                props.onComment(text);
                                setText('');
                            }
                        }}
                        placeholder="Write a comment… (Enter to send)"
                    />
                </div>
            </div>
        </div>
    );
}

function LikersModal({ postId, onClose }: { postId: number; onClose: () => void }) {
    const { data } = useApi<{ data: Person[] }>(`/newsfeed/${postId}/likes`);

    return (
        <Modal open title="People who like this post" onClose={onClose} size="sm">
            {!data ? (
                <Spinner />
            ) : (
                <ul className="space-y-2">
                    {data.data.map((p) => (
                        <li key={p.id} className="flex items-center gap-2 text-[13.5px]">
                            <Avatar id={p.id} name={p.full_name} photo={p.photo_url} size="sm" /> {p.full_name}
                        </li>
                    ))}
                </ul>
            )}
        </Modal>
    );
}
