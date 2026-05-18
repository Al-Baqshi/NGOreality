import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useOrganizations } from '../../hooks/useSupabase';
import { StatusPill, VerificationBadge, SectionHeader, EmptyState } from '../../components/ui';
import { Plus, Search, Building2, LayoutGrid, List } from 'lucide-react';
import type { OrgStatus } from '../../types';

export default function OrganizationsList() {
  const { organizations, loading } = useOrganizations();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrgStatus | 'all'>('all');
  const [view, setView] = useState<'list' | 'grid'>('list');

  const filtered = organizations.filter((org) => {
    const matchesSearch = org.name.toLowerCase().includes(search.toLowerCase()) ||
      org.category.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || org.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="max-w-6xl mx-auto">
      <SectionHeader action={
        <Link to="/organizations/new" className="btn-brutal-accent text-sm flex items-center gap-2">
          <Plus size={16} /> Add Organization
        </Link>
      }>
        Organizations
      </SectionHeader>

      {/* Filters */}
      <div className="flex flex-col md:flex-row items-start md:items-center gap-4 mb-6">
        <div className="relative flex-1 w-full">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            placeholder="Search organizations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-brutal w-full pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as OrgStatus | 'all')}
            className="input-brutal text-sm"
          >
            <option value="all">All Statuses</option>
            <option value="listed">Listed (registry)</option>
            <option value="onboarding">Onboarding</option>
            <option value="under_review">Under Review</option>
            <option value="verified">Verified</option>
            <option value="active">Active</option>
            <option value="lapsed">Lapsed</option>
          </select>
          <div className="flex border-3 border-ink-950">
            <button
              onClick={() => setView('list')}
              className={`p-2 ${view === 'list' ? 'bg-ink-950 text-white' : 'bg-white text-ink-600'}`}
            >
              <List size={16} />
            </button>
            <button
              onClick={() => setView('grid')}
              className={`p-2 ${view === 'grid' ? 'bg-ink-950 text-white' : 'bg-white text-ink-600'}`}
            >
              <LayoutGrid size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-16 font-mono text-sm text-ink-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Building2 size={48} />}
          title="No organizations found"
          description={search || statusFilter !== 'all' ? 'Try adjusting your filters.' : 'Add your first organization to get started.'}
        />
      ) : view === 'list' ? (
        <div className="card-brutal overflow-hidden">
          <div className="grid grid-cols-[1fr_140px_140px_100px] border-b-3 border-ink-950 px-6 py-3 bg-ink-50">
            <div className="label-brutal mb-0">Name</div>
            <div className="label-brutal mb-0">Category</div>
            <div className="label-brutal mb-0">Status</div>
            <div className="label-brutal mb-0">Verified</div>
          </div>
          {filtered.map((org) => (
            <Link
              key={org.id}
              to={`/organizations/${org.id}`}
              className="grid grid-cols-[1fr_140px_140px_100px] items-center px-6 py-3 border-b border-ink-100 hover:bg-ink-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center border-2 border-ink-200 bg-ink-50 font-mono text-sm font-bold text-ink-600 shrink-0">
                  {org.name.charAt(0)}
                </div>
                <div>
                  <div className="text-sm font-semibold">{org.name}</div>
                  <div className="font-mono text-2xs text-ink-400">{org.location || 'No location'}</div>
                </div>
              </div>
              <div className="font-mono text-2xs uppercase tracking-wider text-ink-500">{org.category || '—'}</div>
              <div><StatusPill status={org.status} /></div>
              <div><VerificationBadge level={org.verification_level} showDisclaimer /></div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((org) => (
            <Link key={org.id} to={`/organizations/${org.id}`} className="card-brutal-hover p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center border-2 border-ink-200 bg-ink-50 font-mono text-sm font-bold text-ink-600">
                  {org.name.charAt(0)}
                </div>
                <div>
                  <div className="text-sm font-bold">{org.name}</div>
                  <div className="font-mono text-2xs text-ink-400 uppercase tracking-wider">{org.category || 'No category'}</div>
                </div>
              </div>
              <p className="text-xs text-ink-500 line-clamp-2 mb-4">{org.description || 'No description'}</p>
              <div className="flex items-center justify-between">
                <StatusPill status={org.status} />
                <VerificationBadge level={org.verification_level} showDisclaimer />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
