import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileText, Pencil, Plus, Search, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import { api, errorMessage, fieldErrors } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useApi } from '../../hooks/useApi';
import { usePermission } from '../../hooks/usePermission';
import { Button, Checkbox, EmptyState, Field, IconButton, Input, Modal, Select, Spinner, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

interface ArticleRow {
    id: number;
    kb_group_id: number;
    subject: string;
    active: boolean;
    staff_article: boolean;
    views: number;
    helpful_count: number;
    not_helpful_count: number;
    created_at: string;
}

interface Group {
    id: number;
    name: string;
    description: string | null;
    color: string;
    active: boolean;
    group_order: number;
    articles: ArticleRow[];
}

interface Article extends ArticleRow {
    description: string | null;
    article_order: number;
    group: { id: number; name: string; color: string };
    my_vote: boolean | null;
    related: { id: number; subject: string }[];
}

/** Perfex Knowledge Base: groups with their articles, the article page and votes. */
export default function KnowledgeBasePage() {
    const toast = useToast();
    const [params, setParams] = useSearchParams();
    const canCreate = usePermission('knowledge_base.create');
    const canEdit = usePermission('knowledge_base.edit');
    const canDelete = usePermission('knowledge_base.delete');
    const [search, setSearch] = useState('');
    const { data, reload } = useApi<{ data: Group[] }>('/kb', { search });
    const [articleForm, setArticleForm] = useState<{ open: boolean; article: Article | null }>({ open: false, article: null });
    const [groupForm, setGroupForm] = useState<{ open: boolean; group: Group | null }>({ open: false, group: null });
    const articleId = Number(params.get('article')) || null;

    const open = (id: number | null) => setParams(id ? { article: String(id) } : {});

    async function removeGroup(group: Group) {
        if (!confirm(`Delete group "${group.name}" and all its articles?`)) {
            return;
        }
        await api.delete(`/kb/groups/${group.id}`);
        toast('Group deleted.');
        reload();
    }

    if (articleId) {
        return (
            <ArticleView
                id={articleId}
                onBack={() => open(null)}
                onOpen={open}
                onEdit={canEdit ? (a) => setArticleForm({ open: true, article: a }) : undefined}
                onDeleted={() => (open(null), reload())}
                canDelete={canDelete}
                key={articleId}
                groups={data?.data ?? []}
                formOpen={articleForm}
                closeForm={() => setArticleForm({ open: false, article: null })}
                reloadList={reload}
            />
        );
    }

    return (
        <div className="w-full space-y-4">
            <h4 className="page-title">Knowledge Base</h4>
            <div className="flex flex-wrap items-center gap-2">
                {canCreate && (
                    <>
                        <Button onClick={() => setArticleForm({ open: true, article: null })}>
                            <Plus className="h-4 w-4" /> New Article
                        </Button>
                        <Button variant="secondary" onClick={() => setGroupForm({ open: true, group: null })}>
                            New Group
                        </Button>
                    </>
                )}
                <div className="relative ml-auto w-full sm:w-72">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search knowledge base..." className="pl-9" />
                </div>
            </div>
            {!data ? (
                <Spinner />
            ) : data.data.length === 0 ? (
                <EmptyState title="No articles yet" text="Create a group, then add articles to it." />
            ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {data.data
                        .filter((g) => !search || g.articles.length > 0)
                        .map((group) => (
                            <div key={group.id} className="panel_s !mb-0 border-t-4" style={{ borderTopColor: group.color }}>
                                <div className="panel-body !p-5">
                                    <div className="flex items-start gap-2">
                                        <div className="min-w-0 flex-1">
                                            <h5 className="font-semibold text-gray-800">
                                                {group.name} {!group.active && <span className="text-xs font-normal text-gray-400">(inactive)</span>}
                                            </h5>
                                            {group.description && <p className="text-[13px] text-gray-500">{group.description}</p>}
                                        </div>
                                        {canEdit && (
                                            <IconButton label="Edit group" onClick={() => setGroupForm({ open: true, group })}>
                                                <Pencil className="h-3.5 w-3.5" />
                                            </IconButton>
                                        )}
                                        {canDelete && (
                                            <IconButton label="Delete group" onClick={() => removeGroup(group)} className="hover:text-red-600">
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </IconButton>
                                        )}
                                    </div>
                                    <ul className="mt-3 space-y-1.5">
                                        {group.articles.map((a) => (
                                            <li key={a.id}>
                                                <button type="button" onClick={() => open(a.id)} className="flex w-full items-start gap-2 text-left text-[13.5px] text-blue-600 hover:underline">
                                                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                                                    <span className={a.active ? '' : 'text-gray-400'}>{a.subject}</span>
                                                    {a.staff_article && <span className="ml-auto shrink-0 rounded bg-amber-50 px-1 text-[10px] text-amber-700">Internal</span>}
                                                </button>
                                            </li>
                                        ))}
                                        {group.articles.length === 0 && <li className="text-[13px] text-gray-400">No articles.</li>}
                                    </ul>
                                </div>
                            </div>
                        ))}
                </div>
            )}
            <ArticleForm state={articleForm} groups={data?.data ?? []} onClose={() => setArticleForm({ open: false, article: null })} onSaved={(id) => (setArticleForm({ open: false, article: null }), reload(), open(id))} />
            <GroupForm state={groupForm} onClose={() => setGroupForm({ open: false, group: null })} onSaved={() => (setGroupForm({ open: false, group: null }), reload())} />
        </div>
    );
}

function ArticleView({
    id,
    onBack,
    onOpen,
    onEdit,
    onDeleted,
    canDelete,
    groups,
    formOpen,
    closeForm,
    reloadList,
}: {
    id: number;
    onBack: () => void;
    onOpen: (id: number) => void;
    onEdit?: (a: Article) => void;
    onDeleted: () => void;
    canDelete: boolean;
    groups: Group[];
    formOpen: { open: boolean; article: Article | null };
    closeForm: () => void;
    reloadList: () => void;
}) {
    const toast = useToast();
    const { data, reload } = useApi<{ data: Article }>(`/kb/articles/${id}`);
    const article = data?.data;

    async function vote(helpful: boolean) {
        await api.post(`/kb/articles/${id}/vote`, { helpful });
        toast('Thanks for your feedback.');
        reload();
    }

    async function remove() {
        if (!confirm('Delete this article?')) {
            return;
        }
        await api.delete(`/kb/articles/${id}`);
        toast('Article deleted.');
        onDeleted();
    }

    if (!article) {
        return <Spinner />;
    }

    return (
        <div className="w-full space-y-4">
            <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-[13.5px] text-gray-500 hover:text-gray-800">
                <ArrowLeft className="h-4 w-4" /> Knowledge Base
            </button>
            <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
                <div className="panel_s !mb-0">
                    <div className="panel-body">
                        <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium uppercase" style={{ color: article.group.color }}>
                                    {article.group.name}
                                </p>
                                <h2 className="mt-1 text-xl font-semibold text-gray-800">{article.subject}</h2>
                                <p className="mt-1 text-xs text-gray-400">
                                    {formatDate(article.created_at)} · {article.views} views {article.staff_article && '· Internal article'}
                                </p>
                            </div>
                            {onEdit && (
                                <Button size="sm" variant="secondary" onClick={() => onEdit(article)}>
                                    <Pencil className="h-3.5 w-3.5" /> Edit
                                </Button>
                            )}
                            {canDelete && (
                                <Button size="sm" variant="ghost" onClick={remove} className="!text-red-600">
                                    Delete
                                </Button>
                            )}
                        </div>
                        <div className="mt-5 whitespace-pre-wrap text-[14px] leading-relaxed text-gray-700">{article.description}</div>
                        <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4 text-[13.5px]">
                            <span className="text-gray-600">Did you find this article useful?</span>
                            <Button size="sm" variant={article.my_vote === true ? 'primary' : 'secondary'} onClick={() => vote(true)}>
                                <ThumbsUp className="h-3.5 w-3.5" /> Yes ({article.helpful_count})
                            </Button>
                            <Button size="sm" variant={article.my_vote === false ? 'primary' : 'secondary'} onClick={() => vote(false)}>
                                <ThumbsDown className="h-3.5 w-3.5" /> No ({article.not_helpful_count})
                            </Button>
                        </div>
                    </div>
                </div>
                <div className="panel_s !mb-0">
                    <div className="panel-body !p-5">
                        <h5 className="mb-2 font-semibold">Related Articles</h5>
                        <ul className="space-y-1.5">
                            {article.related.map((r) => (
                                <li key={r.id}>
                                    <button type="button" onClick={() => onOpen(r.id)} className="text-left text-[13.5px] text-blue-600 hover:underline">
                                        {r.subject}
                                    </button>
                                </li>
                            ))}
                            {article.related.length === 0 && <li className="text-[13px] text-gray-400">None.</li>}
                        </ul>
                    </div>
                </div>
            </div>
            <ArticleForm state={formOpen} groups={groups} onClose={closeForm} onSaved={() => (closeForm(), reload(), reloadList())} />
        </div>
    );
}

function ArticleForm({ state, groups, onClose, onSaved }: { state: { open: boolean; article: Article | null }; groups: Group[]; onClose: () => void; onSaved: (id: number) => void }) {
    const toast = useToast();
    const [form, setForm] = useState({ subject: '', kb_group_id: '', description: '', active: true, staff_article: false });
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        if (state.open) {
            const a = state.article;
            setForm({ subject: a?.subject ?? '', kb_group_id: String(a?.kb_group_id ?? groups[0]?.id ?? ''), description: a?.description ?? '', active: a?.active ?? true, staff_article: a?.staff_article ?? false });
            setErrors({});
        }
    }, [state, groups]);

    async function save() {
        try {
            const payload = { ...form, kb_group_id: Number(form.kb_group_id) };
            const { data } = state.article ? await api.put<{ data: { id: number } }>(`/kb/articles/${state.article.id}`, payload) : await api.post<{ data: { id: number } }>('/kb/articles', payload);
            toast('Article saved.');
            onSaved(data.data.id);
        } catch (e) {
            setErrors(fieldErrors(e));
            if (!Object.keys(fieldErrors(e)).length) {
                toast(errorMessage(e), 'error');
            }
        }
    }

    return (
        <Modal
            open={state.open}
            onClose={onClose}
            size="lg"
            title={state.article ? 'Edit Article' : 'New Article'}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Close
                    </Button>
                    <Button onClick={save}>Save</Button>
                </>
            }
        >
            <div className="space-y-4">
                <Field label="Subject" required error={errors.subject}>
                    <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
                </Field>
                <Field label="Group" required error={errors.kb_group_id} hint={groups.length ? undefined : 'Create a group first.'}>
                    <Select value={form.kb_group_id} onChange={(e) => setForm({ ...form, kb_group_id: e.target.value })}>
                        {groups.map((g) => (
                            <option key={g.id} value={g.id}>
                                {g.name}
                            </option>
                        ))}
                    </Select>
                </Field>
                <div className="flex gap-5">
                    <Checkbox label="Internal article (staff only)" checked={form.staff_article} onChange={(v) => setForm({ ...form, staff_article: v })} />
                    <Checkbox label="Active" checked={form.active} onChange={(v) => setForm({ ...form, active: v })} />
                </div>
                <Field label="Article">
                    <Textarea rows={14} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </Field>
            </div>
        </Modal>
    );
}

function GroupForm({ state, onClose, onSaved }: { state: { open: boolean; group: Group | null }; onClose: () => void; onSaved: () => void }) {
    const toast = useToast();
    const [form, setForm] = useState({ name: '', description: '', color: '#28B8DA', active: true, group_order: '0' });

    useEffect(() => {
        if (state.open) {
            const g = state.group;
            setForm({ name: g?.name ?? '', description: g?.description ?? '', color: g?.color ?? '#28B8DA', active: g?.active ?? true, group_order: String(g?.group_order ?? 0) });
        }
    }, [state]);

    async function save() {
        try {
            const payload = { ...form, group_order: Number(form.group_order) };
            if (state.group) {
                await api.put(`/kb/groups/${state.group.id}`, payload);
            } else {
                await api.post('/kb/groups', payload);
            }
            toast('Group saved.');
            onSaved();
        } catch (e) {
            toast(errorMessage(e), 'error');
        }
    }

    return (
        <Modal
            open={state.open}
            onClose={onClose}
            size="sm"
            title={state.group ? 'Edit Group' : 'New Group'}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Close
                    </Button>
                    <Button onClick={save}>Save</Button>
                </>
            }
        >
            <div className="space-y-4">
                <Field label="Group Name" required>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </Field>
                <Field label="Short Description">
                    <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Color">
                        <Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-10 p-1" />
                    </Field>
                    <Field label="Order">
                        <Input type="number" value={form.group_order} onChange={(e) => setForm({ ...form, group_order: e.target.value })} />
                    </Field>
                </div>
                <Checkbox label="Active" checked={form.active} onChange={(v) => setForm({ ...form, active: v })} />
            </div>
        </Modal>
    );
}
