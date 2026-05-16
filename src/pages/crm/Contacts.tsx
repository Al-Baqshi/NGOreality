import { supabase } from '../../lib/supabase';
import { useState, useEffect } from 'react';
import { SectionHeader, EmptyState } from '../../components/ui';
import { Link } from 'react-router-dom';
import { Users, Search, Mail } from 'lucide-react';
import type { Contact, Organization } from '../../types';

type ContactWithOrg = Contact & { organizations: Organization };

export default function Contacts() {
  const [contacts, setContacts] = useState<ContactWithOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase
      .from('contacts')
      .select('*, organizations(*)')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setContacts(data as ContactWithOrg[]);
        setLoading(false);
      });
  }, []);

  const filtered = contacts.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.organizations?.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto">
      <SectionHeader>Contacts</SectionHeader>

      <div className="mb-6">
        <div className="relative max-w-md">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-brutal w-full pl-10"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 font-mono text-sm text-ink-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Users size={48} />}
          title="No contacts found"
          description="Contacts are added through organization profiles."
        />
      ) : (
        <div className="card-brutal overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_160px_120px_80px] border-b-3 border-ink-950 px-6 py-3 bg-ink-50">
            <div className="label-brutal mb-0">Name</div>
            <div className="label-brutal mb-0">Organization</div>
            <div className="label-brutal mb-0">Email</div>
            <div className="label-brutal mb-0">Role</div>
            <div className="label-brutal mb-0">Primary</div>
          </div>
          {filtered.map((c) => (
            <Link
              key={c.id}
              to={`/organizations/${c.organization_id}`}
              className="grid grid-cols-[1fr_1fr_160px_120px_80px] items-center px-6 py-3 border-b border-ink-100 hover:bg-ink-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center border-2 border-ink-200 bg-ink-50 font-mono text-xs font-bold text-ink-600 shrink-0">
                  {c.name.charAt(0)}
                </div>
                <span className="text-sm font-medium">{c.name}</span>
              </div>
              <div className="text-sm text-ink-600">{c.organizations?.name || '—'}</div>
              <div className="flex items-center gap-1 text-xs text-ink-500">
                <Mail size={12} /> {c.email || '—'}
              </div>
              <div className="font-mono text-2xs uppercase tracking-wider text-ink-500">{c.role || '—'}</div>
              <div>
                {c.is_primary ? (
                  <span className="badge-verified text-2xs py-0">Yes</span>
                ) : (
                  <span className="text-ink-300 text-xs">—</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
