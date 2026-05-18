import { Link, useParams } from 'react-router-dom';
import { usePublicOrganizationBySlug } from '../../hooks/useSupabase';
import { DirectoryTrustBadge } from '../../components/ui';
import { COUNTRY_NAMES } from '../../data/countryNames';
import { isNgorealityVerified, isRegistryListed, REGISTRY_SOURCE_LABELS } from '../../types';
import { formatTagLabel } from '../../lib/tags';
import { Tag } from 'lucide-react';
import SEO, { BreadcrumbJsonLd } from '../../components/SEO';
import { ArrowLeft, Globe, MapPin, ExternalLink, Shield } from 'lucide-react';

export default function OrganizationProfile() {
  const { slug } = useParams<{ slug: string }>();
  const { organization, loading } = usePublicOrganizationBySlug(slug);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-24 text-center font-mono text-sm text-ink-400">
        Loading…
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-24 text-center">
        <h1 className="text-2xl font-black uppercase tracking-tight mb-2">Organization not found</h1>
        <Link to="/public/directory" className="text-sm text-teal hover:underline">
          Back to directory
        </Link>
      </div>
    );
  }

  const verified = isNgorealityVerified(organization);
  const registryListed = isRegistryListed(organization);
  const registryLabel = REGISTRY_SOURCE_LABELS[organization.source_registry] || organization.source_registry;

  return (
    <>
      <SEO
        title={organization.name}
        description={
          organization.description ||
          `View ${organization.name} in the NGOreality nonprofit directory.`
        }
        path={`/public/org/${organization.slug}`}
      />
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', path: '/public' },
          { name: 'Directory', path: '/public/directory' },
          { name: organization.name, path: `/public/org/${organization.slug}` },
        ]}
      />
      <div>
        <section className="border-b-3 border-ink-950 bg-ink-950 text-white">
          <div className="max-w-3xl mx-auto px-6 py-12 md:py-16">
            <Link
              to="/public/directory"
              className="inline-flex items-center gap-2 font-mono text-2xs uppercase tracking-wider text-ink-400 hover:text-white mb-6"
            >
              <ArrowLeft size={14} /> Directory
            </Link>
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center border-2 border-teal bg-teal/20 font-mono text-xl font-black text-teal shrink-0">
                {organization.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight mb-3">
                  {organization.name}
                </h1>
                <DirectoryTrustBadge org={organization} />
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-3xl mx-auto px-6 py-10 md:py-14 space-y-8">
          {registryListed && (
            <div className="card-brutal p-5 border-l-4 border-l-sky-500">
              <p className="text-sm text-ink-600 leading-relaxed">
                This organization is listed from the <strong>{registryLabel}</strong>. NGOreality has
                not yet verified its digital infrastructure or awarded the Reality Badge.
              </p>
              {organization.charity_registration_number && (
                <p className="font-mono text-2xs uppercase tracking-wider text-ink-500 mt-3">
                  Registration {organization.charity_registration_number}
                </p>
              )}
              {organization.registry_url && (
                <a
                  href={organization.registry_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-mono text-teal hover:underline mt-3"
                >
                  View official register <ExternalLink size={12} />
                </a>
              )}
            </div>
          )}

          <div>
            <div className="label-brutal">About</div>
            <p className="text-sm text-ink-700 leading-relaxed">
              {organization.description ||
                organization.mission_statement ||
                'No description available.'}
            </p>
          </div>

          <div className="flex flex-col gap-2 text-sm">
            {organization.tags && organization.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {organization.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-1 border border-ink-200 bg-ink-50 font-mono text-2xs uppercase tracking-wider text-ink-600"
                  >
                    <Tag size={10} />
                    {formatTagLabel(tag)}
                  </span>
                ))}
              </div>
            )}
            {(organization.location || organization.country) && (
              <div className="flex items-center gap-2 text-ink-600">
                <MapPin size={14} className="text-ink-400 shrink-0" />
                {organization.location || COUNTRY_NAMES[organization.country] || organization.country}
              </div>
            )}
            {organization.website_url && (
              <a
                href={organization.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-teal hover:underline"
              >
                <Globe size={14} /> Visit website <ExternalLink size={12} />
              </a>
            )}
          </div>

          {!verified && (
            <div className="card-brutal p-6 bg-surface-raised">
              <div className="flex items-center gap-2 mb-2">
                <Shield size={18} className="text-teal" />
                <h2 className="text-lg font-black uppercase tracking-tight">
                  {registryListed ? 'Claim this listing' : 'Get verified'}
                </h2>
              </div>
              <p className="text-sm text-ink-500 mb-4 leading-relaxed">
                {registryListed
                  ? 'Is this your organization? Contact us to confirm the listing and start NGOreality verification.'
                  : 'Apply for the NGOreality Reality Badge and digital independence standards review.'}
              </p>
              <Link
                to={`/public/contact?org=${encodeURIComponent(organization.slug)}`}
                className="btn-brutal-accent inline-flex text-sm"
              >
                Request verification
              </Link>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
