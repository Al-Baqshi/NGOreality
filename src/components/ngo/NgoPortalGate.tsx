import { Outlet } from 'react-router-dom';
import { NgoPortalProvider, useNgoPortalGate } from '../../contexts/NgoPortalContext';
import NgoOnboardingPage from '../../pages/ngo/portal/NgoOnboardingPage';

export default function NgoPortalGate() {
  const portal = useNgoPortalGate();

  if (portal.loading) {
    return (
      <p className="font-mono text-xs uppercase tracking-wider text-ink-500 text-center py-16">
        Loading your portal…
      </p>
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
