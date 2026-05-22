import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { MetricCard } from '../ui';

export interface RegistryReadinessStats {
  country: string;
  total_listed: number;
  without_website: number;
  with_website: number;
  heuristic_profile_ready: number;
  monitors_down: number;
  monitors_up: number;
  public_criteria_all_pass: number;
  with_public_criteria_initialized: number;
  active_members: number;
}

function pct(part: number, total: number): string {
  if (total <= 0) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

export default function RegistryInsights({
  country = 'NZ',
  layout = 'full',
}: {
  country?: string;
  /** full = dashboard width; compact = nested column (fewer grid cols, no clipped numbers). */
  layout?: 'full' | 'compact';
}) {
  const [stats, setStats] = useState<RegistryReadinessStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error: rpcError } = await supabase.rpc('registry_readiness_stats', {
        p_country: country,
      });
      if (cancelled) return;
      if (rpcError) {
        setError(rpcError.message);
        setStats(null);
      } else {
        setStats(data as RegistryReadinessStats);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [country]);

  if (loading) {
    return (
      <p className="font-mono text-2xs text-ink-400 py-4">Loading registry insights…</p>
    );
  }

  if (error) {
    return (
      <p className="text-xs text-accent border-2 border-accent px-3 py-2">
        Registry insights unavailable: {error}. Apply migration 018.
      </p>
    );
  }

  if (!stats) return null;

  const total = stats.total_listed || 1;

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-500 leading-relaxed">
        Passive monitoring runs on listed {country} charities (weekly checks) for outreach. Use these
        numbers in calls: who has no site, whose site is down, and who already meets public trust standards.
      </p>
      <div
        className={
          layout === 'compact'
            ? 'grid grid-cols-1 min-[420px]:grid-cols-2 gap-3'
            : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4'
        }
      >
        <MetricCard compact={layout === 'compact'} label="Listed (registry)" value={stats.total_listed} />
        <MetricCard
          compact={layout === 'compact'}
          label="No website"
          value={pct(stats.without_website, total)}
          sub={`${stats.without_website.toLocaleString()} orgs`}
        />
        <MetricCard
          compact={layout === 'compact'}
          label="Site down (monitored)"
          value={stats.monitors_down}
          sub={`${stats.monitors_up.toLocaleString()} up`}
        />
        <MetricCard
          compact={layout === 'compact'}
          label="Profile ready"
          value={pct(stats.heuristic_profile_ready, total)}
          sub="site · mission · email"
        />
        <MetricCard
          compact={layout === 'compact'}
          label="Public standards pass"
          value={stats.public_criteria_all_pass}
          sub={`${stats.with_public_criteria_initialized.toLocaleString()} evaluated`}
        />
        <MetricCard compact={layout === 'compact'} label="Paying members" value={stats.active_members} accent />
      </div>
    </div>
  );
}
