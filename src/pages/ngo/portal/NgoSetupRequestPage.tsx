import { useNgoPortalContext } from '../../../contexts/NgoPortalContext';
import NgoSetupRequestPanel from '../../../components/ngo/NgoSetupRequestPanel';
import NgoPortalPageShell from '../../../components/ngo/NgoPortalPageShell';

export default function NgoSetupRequestPage() {
  const { organization, setupRequests, refetch } = useNgoPortalContext();
  if (!organization) return null;

  return (
    <NgoPortalPageShell title="Setup request" path="/ngo/setup-request">
      <NgoSetupRequestPanel
        organization={organization}
        setupRequests={setupRequests}
        onUpdated={() => void refetch()}
      />
    </NgoPortalPageShell>
  );
}
