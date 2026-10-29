import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, Plus, Search } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { usePermission } from '../../hooks/usePermission';
import { formatDate } from '../../lib/format';
import { Button, EmptyState, ErrorNote, Input, Pagination, Select, Spinner, Tag } from '../../components/ui';
import type { CustomerFull, Paginated } from '../../types';
import { useCustomFieldColumns } from '../../components/customfields/CustomFields';
import SavedFilters, { savedIds, savedText } from '../../components/filters/SavedFilters';

/** Perfex Customers list. */
export default function CustomersPage() {
    const navigate = useNavigate();
    const canCreate = usePermission('customers.create');
    const [search, setSearch] = useState('');
    const [groupId, setGroupId] = useState('');
    const [active, setActive] = useState('');
    const [page, setPage] = useState(1);
    const { data, loading, error } = useApi<Paginated<CustomerFull>>('/customers', { search, page, group_id: groupId || undefined, active: active || undefined });
    const cfCols = useCustomFieldColumns('customers', (data?.data ?? []).map((r) => r.id));
    const groups = useApi<{ data: { id: number; name: string }[] }>('/setup/customer-groups');

    return (
        <div className="w-full space-y-4">
            <h4 className="page-title">Customers</h4>
            <div className="flex flex-wrap items-center gap-2">
                {canCreate && (
                    <Button onClick={() => navigate('/customers/new')}>
                        <Plus className="h-4 w-4" /> New Customer
                    </Button>
                )}
                <Select value={groupId} onChange={(e) => (setGroupId(e.target.value), setPage(1))} className="w-auto">
                    <option value="">All groups</option>
                    {groups.data?.data.map((g) => (
                        <option key={g.id} value={g.id}>
                            {g.name}
                        </option>
                    ))}
                </Select>
                <Select value={active} onChange={(e) => (setActive(e.target.value), setPage(1))} className="w-auto">
                    <option value="">Active & inactive</option>
                    <option value="1">Active</option>
                    <option value="0">Inactive</option>
                </Select>
                <span className="ml-auto" />
                {true && <SavedFilters identifier="customers" current={{ search, group_id: groupId, active }} onApply={(f) => { setSearch(savedText(f.search)); setGroupId(savedText(f.group_id)); setActive(savedText(f.active)); setPage(1); }} />}
                <div className="relative w-full sm:w-64">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} placeholder="Search..." className="pl-9" />
                </div>
            </div>
            <ErrorNote message={error} />
            {loading && !data ? (
                <Spinner />
            ) : !data || data.data.length === 0 ? (
                <EmptyState icon={Building2} title="No customers found" text="Customers are the companies you work with. Convert a lead or add one directly." action={canCreate && <Button onClick={() => navigate('/customers/new')}><Plus className="h-4 w-4" /> Add a customer</Button>} />
            ) : (
                <div className="panel_s overflow-hidden">
                    <div className="table-scroll overflow-x-auto">
                        <table className="table-perfex">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Company</th>
                                    <th>Primary Contact</th>
                                    <th>Primary Email</th>
                                    <th>Phone</th>
                                    <th>Active</th>
                                    <th>Groups</th>
                                    <th>Date Created</th>
                                    {cfCols.columns.map((cfc) => (
                                        <th key={`cf${cfc.id}`}>{cfc.name}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.data.map((c) => (
                                    <tr key={c.id}>
                                        <td>{c.id}</td>
                                        <td>
                                            <Link to={`/customers/${c.id}`} className="font-medium">
                                                {c.name}
                                            </Link>
                                            <div className="row-options">
                                                <Link to={`/customers/${c.id}`}>View</Link>
                                                <span className="divider">|</span>
                                                <Link to={`/customers/${c.id}?tab=contacts`}>Contacts</Link>
                                            </div>
                                        </td>
                                        <td>{c.primary_contact?.name ?? ''}</td>
                                        <td>{c.primary_contact ? <a href={`mailto:${c.primary_contact.email}`}>{c.primary_contact.email}</a> : c.email}</td>
                                        <td>{c.primary_contact?.phone ?? c.phone}</td>
                                        <td>
                                            <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${c.is_active ? 'bg-green-50 text-green-700 ring-green-600/20' : 'bg-gray-50 text-gray-600 ring-gray-500/10'}`}>
                                                {c.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="flex flex-wrap gap-1">{c.groups?.map((g) => <Tag key={g.id}>{g.name}</Tag>)}</div>
                                        </td>
                                        <td className="whitespace-nowrap">{formatDate((c as unknown as { created_at: string }).created_at)}</td>
                                        {cfCols.columns.map((cfc) => (
                                            <td key={`cf${cfc.id}`}>{cfCols.cell(cfc, c.id)}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="border-t border-gray-200 px-4 py-3">
                        <Pagination page={data.meta.current_page} lastPage={data.meta.last_page} total={data.meta.total} onChange={setPage} />
                    </div>
                </div>
            )}
        </div>
    );
}
