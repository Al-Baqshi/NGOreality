import { useOrganizations, useInquiries } from '../../hooks/useSupabase';
import { MetricCard, SectionHeader } from '../../components/ui';
import { ShieldCheck, Clock, Mail, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const { organizations, loading: orgLoading } = useOrganizations();
  const { inquiries, loading: inqLoading } = useInquiries();

  const stats = {
    total: organizations.length,
    listed: organizations.filter((o) => o.status === 'listed').length,
    verified: organizations.filter((o) => o.status === 'verified' || o.status === 'active').length,
    pending: organizations.filter((o) => o.status === 'onboarding' || o.status === 'under_review').length,
    outreachDue: organizations.filter(
      (o) => o.status === 'listed' && o.outreach_status === 'not_contacted',
    ).length,
    newInquiries: inquiries.filter((i) => i.status === 'new').length,
  };

  const recentOrgs = organizations.slice(0, 5);
  const recentInquiries = inquiries.filter((i) => i.status === 'new').slice(0, 5);

  return (
    <div className="max-w-6xl mx-auto">
      <SectionHeader>Dashboard</SectionHeader>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
        <MetricCard label="Total" value={orgLoading ? '—' : stats.total} />
        <MetricCard label="Registry Listed" value={orgLoading ? '—' : stats.listed} />
        <MetricCard label="NGOreality Verified" value={orgLoading ? '—' : stats.verified} accent />
        <MetricCard label="Outreach Due" value={orgLoading ? '—' : stats.outreachDue} />
        <MetricCard label="New Inquiries" value={inqLoading ? '—' : stats.newInquiries} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Organizations */}
        <div className="card-brutal">
          <div className="flex items-center justify-between border-b-3 border-ink-950 px-6 py-4">
            <h3 className="font-mono text-xs uppercase tracking-wider font-semibold">Recent Organizations</h3>
            <Link to="/organizations" className="flex items-center gap-1 font-mono text-2xs uppercase tracking-wider text-ink-500 hover:text-accent transition-colors">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-ink-100">
            {recentOrgs.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-ink-400">No organizations yet</div>
            ) : (
              recentOrgs.map((org) => (
                <Link key={org.id} to={`/organizations/${org.id}`} className="flex items-center justify-between px-6 py-3 hover:bg-ink-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center border-2 border-ink-200 bg-ink-50 font-mono text-xs font-bold text-ink-600">
                      {org.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{org.name}</div>
                      <div className="font-mono text-2xs text-ink-400 uppercase tracking-wider">{org.category || 'No category'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {org.status === 'verified' || org.status === 'active' ? (
                      <ShieldCheck size={14} className="text-teal" />
                    ) : (
                      <Clock size={14} className="text-ink-300" />
                    )}
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* New Inquiries */}
        <div className="card-brutal">
          <div className="flex items-center justify-between border-b-3 border-ink-950 px-6 py-4">
            <h3 className="font-mono text-xs uppercase tracking-wider font-semibold">New Inquiries</h3>
            <Link to="/inquiries" className="flex items-center gap-1 font-mono text-2xs uppercase tracking-wider text-ink-500 hover:text-accent transition-colors">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-ink-100">
            {recentInquiries.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-ink-400">No new inquiries</div>
            ) : (
              recentInquiries.map((inq) => (
                <div key={inq.id} className="flex items-center justify-between px-6 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center border-2 border-accent bg-accent-light font-mono text-xs font-bold text-accent">
                      <Mail size={14} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{inq.organization_name}</div>
                      <div className="font-mono text-2xs text-ink-400">{inq.contact_name} &middot; {inq.email}</div>
                    </div>
                  </div>
                  <span className="badge-pending">New</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Pipeline Overview */}
      <div className="mt-8 card-brutal">
        <div className="border-b-3 border-ink-950 px-6 py-4">
          <h3 className="font-mono text-xs uppercase tracking-wider font-semibold">Pipeline Overview</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-ink-100">
          {(['onboarding', 'under_review', 'verified', 'active', 'lapsed'] as const).map((status) => {
            const count = organizations.filter((o) => o.status === status).length;
            const labels: Record<string, string> = {
              onboarding: 'Onboarding',
              under_review: 'Under Review',
              verified: 'Verified',
              active: 'Active',
              lapsed: 'Lapsed',
            };
            const colors: Record<string, string> = {
              onboarding: 'text-ink-600',
              under_review: 'text-amber-600',
              verified: 'text-teal',
              active: 'text-teal',
              lapsed: 'text-accent',
            };
            return (
              <div key={status} className="px-6 py-6 text-center">
                <div className={`text-3xl font-black ${colors[status]}`}>{orgLoading ? '—' : count}</div>
                <div className="label-brutal mt-1">{labels[status]}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
