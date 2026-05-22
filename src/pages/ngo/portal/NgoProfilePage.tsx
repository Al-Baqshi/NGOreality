import { useNgoPortalContext } from '../../../contexts/NgoPortalContext';
import NgoProfilePanel from '../../../components/ngo/NgoProfilePanel';
import NgoPortalPageShell from '../../../components/ngo/NgoPortalPageShell';

export default function NgoProfilePage() {
  const { organization, refetch } = useNgoPortalContext();
  if (!organization) return null;

  return (
    <NgoPortalPageShell title="Profile" path="/ngo/profile">
      <NgoProfilePanel organization={organization} onUpdated={() => void refetch()} />
    </NgoPortalPageShell>
  );
}
