import { Outlet } from 'react-router-dom';
import { NgoPortalProvider, useNgoPortalGate } from '../../contexts/NgoPortalContext';
import NgoOnboardingPage from '../../pages/ngo/portal/NgoOnboardingPage';
import { QueryError } from '../ui';

export default function NgoPortalGate() {
  const portal = useNgoPortalGate();

  if (portal.loading) {
    return (
      <p className="font-mono text-xs uppercase tracking-wider text-ink-500 text-center py-16">
        Loading your portal…
      </p>
    );
  }

  if ((portal.error || portal.isLinked) && !portal.hasOrganization) {
    return (
      <div className="max-w-lg mx-auto py-16 px-4">
        <QueryError
          message={
            portal.error ||
            'Your account is linked but we could not load the organization record. Try again or contact support.'
          }
          onRetry={portal.refetch}
        />
      </div>
    );
  }

  if (portal.needsRegistration || !portal.hasOrganization) {
    return <NgoOnboardingPage portal={portal} />;
  }

  if (!portal.organization) return null;

  return (
    <NgoPortalProvider value={portal}>
      <Outlet />
    </NgoPortalProvider>
  );
}
