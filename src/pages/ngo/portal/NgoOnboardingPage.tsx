import { Shield } from 'lucide-react';
import type { useNgoPortal } from '../../../hooks/useNgoPortal';
import { EmptyState } from '../../../components/ui';
import NgoOrganizationRegistrationForm from '../../../components/ngo/NgoOrganizationRegistrationForm';
import SEO from '../../../components/SEO';

type NgoOnboardingPageProps = {
  portal: ReturnType<typeof useNgoPortal>;
};

export default function NgoOnboardingPage({ portal }: NgoOnboardingPageProps) {
  const { refetch } = portal;

  return (
    <>
      <SEO title="NGO Portal" path="/ngo" />
      <EmptyState
        icon={<Shield size={40} />}
        title="Complete your registration"
        description="Link your charity from the NZ directory or register a new organization to unlock membership, trust standards, and website monitoring."
      />
      <div className="mt-6">
        <NgoOrganizationRegistrationForm
          loggedIn
          compact
          title="Link your organization"
          onSuccess={() => {
            void refetch();
          }}
        />
      </div>
    </>
  );
}
