import { Link } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { useNgoPortalContext } from '../../../contexts/NgoPortalContext';
import NgoPortalPageShell from '../../../components/ngo/NgoPortalPageShell';

export default function NgoMonitoringPage() {
  const { organization } = useNgoPortalContext();
  if (!organization) return null;

  return (
    <NgoPortalPageShell title="Website monitoring" path="/ngo/monitoring">
      <div className="card-brutal border-l-4 border-l-teal p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-3">
          <Activity size={18} className="text-teal" aria-hidden />
          <h2 className="text-lg font-black uppercase tracking-tight">Uptime monitoring</h2>
        </div>
        <p className="text-sm text-ink-600 dark:text-muted-foreground leading-relaxed">
          With an active membership we watch your public website and email you if it goes offline. Status is managed by
          the NGOreality team — you will receive alerts at your organisation contact email.
        </p>
        {organization.website_url?.trim() ? (
          <p className="mt-3 font-mono text-2xs text-ink-500 break-all">
            Monitored URL:{' '}
            <a
              href={
                /^https?:\/\//i.test(organization.website_url.trim())
                  ? organization.website_url.trim()
                  : `https://${organization.website_url.trim()}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="text-teal underline hover:text-ink-950"
            >
              {organization.website_url.trim()}
            </a>
          </p>
        ) : (
          <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">
            Add your website URL on{' '}
            <Link to="/ngo/profile" className="font-semibold underline">
              Profile
            </Link>{' '}
            so we can enable monitoring after membership is active.
          </p>
        )}
      </div>
    </NgoPortalPageShell>
  );
}
