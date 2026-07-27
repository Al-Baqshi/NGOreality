import { Helmet } from 'react-helmet-async';
import { SITE_URL, absoluteUrl } from '../config/site';

const SITE_NAME = 'NGOreality';
const DEFAULT_DESCRIPTION = 'Digital trust infrastructure for nonprofits. Building the missing layer between intention and trust.';

export { SITE_URL, absoluteUrl };

interface SEOProps {
  title?: string;
  description?: string;
  path?: string;
  type?: 'website' | 'article';
  image?: string;
  publishedTime?: string;
  /**
   * Keeps a page out of search results. Set on anything behind a login —
   * particularly the workspace, where URLs relate to beneficiary records and
   * must never appear in an index or a referrer-derived crawl.
   */
  noindex?: boolean;
}

export default function SEO({ title, description, path, type = 'website', image, publishedTime, noindex = false }: SEOProps) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — Digital Trust Infrastructure for Nonprofits`;
  const desc = description || DEFAULT_DESCRIPTION;
  const url = absoluteUrl(path || '/');
  const ogImage = image || absoluteUrl('/og-default.png');

  if (noindex) {
    // Private pages get no canonical, no Open Graph and no description —
    // there is nothing here that should be shared, previewed or crawled.
    return (
      <Helmet>
        <title>{fullTitle}</title>
        <meta name="robots" content="noindex, nofollow, noarchive" />
        <meta name="googlebot" content="noindex, nofollow" />
        <meta name="referrer" content="no-referrer" />
      </Helmet>
    );
  }

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      <link rel="canonical" href={url} />

      {/* Open Graph */}
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:site_name" content={SITE_NAME} />
      {publishedTime && <meta property="article:published_time" content={publishedTime} />}

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      <meta name="twitter:image" content={ogImage} />
    </Helmet>
  );
}

export function OrganizationJsonLd() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'NGOreality',
    url: SITE_URL,
    description: DEFAULT_DESCRIPTION,
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'NZ',
    },
    sameAs: [],
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  );
}

export function ArticleJsonLd({ title, description, url, publishedTime, author, image }: {
  title: string; description: string; url: string; publishedTime: string; author: string; image?: string;
}) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    url,
    datePublished: publishedTime,
    author: { '@type': 'Organization', name: author || SITE_NAME },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    image: image || `${SITE_URL}/og-default.png`,
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  );
}

export function BreadcrumbJsonLd({ items }: { items: { name: string; path: string }[] }) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  );
}
