import { Link, useSearchParams } from 'react-router-dom';
import BrandLogo from '../../components/BrandLogo';
import SEO from '../../components/SEO';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Human confirm page for outreach opt-out. The edge function at
 * /functions/v1/unsubscribe redirects GET here because Safari (especially iOS)
 * downloads function HTML as a file instead of rendering it. RFC 8058 one-click
 * POST still hits the function directly and never loads this page.
 */
export default function Unsubscribe() {
  const [params] = useSearchParams();
  const done = params.get('done') === '1';
  const token = params.get('token') ?? '';
  const tokenOk = TOKEN_RE.test(token);
  const action = tokenOk && SUPABASE_URL
    ? `${SUPABASE_URL}/functions/v1/unsubscribe?token=${encodeURIComponent(token)}`
    : '';

  return (
    <>
      <SEO
        title={done ? 'Unsubscribed' : 'Email preferences'}
        description="Manage outreach email from NGOreality."
        path="/unsubscribe"
        noindex
      />
      <div className="min-h-screen bg-surface px-4 py-10 flex items-center justify-center">
        <div className="w-full max-w-md">
          <div className="mb-6">
            <BrandLogo linkToPublic showTagline={false} iconClassName="h-10 w-10" />
          </div>

          <div className="card-brutal p-6 sm:p-8">
            {done ? (
              <>
                <p
                  className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-teal/15 text-xl font-bold text-teal"
                  aria-hidden
                >
                  ✓
                </p>
                <h1 className="text-xl font-bold text-ink-950 dark:text-foreground mb-2">
                  You are unsubscribed
                </h1>
                <p className="text-sm text-ink-600 dark:text-muted-foreground mb-6 leading-relaxed">
                  We will not send you any more outreach email from NGOreality.
                </p>
                <Link to="/public" className="btn-brutal-outline text-sm min-h-[44px] inline-flex items-center justify-center w-full">
                  Back to NGOreality
                </Link>
              </>
            ) : !tokenOk ? (
              <>
                <h1 className="text-xl font-bold text-ink-950 dark:text-foreground mb-2">
                  This link is incomplete
                </h1>
                <p className="text-sm text-ink-600 dark:text-muted-foreground mb-6 leading-relaxed">
                  The unsubscribe link is missing its token. Please use the link exactly as it
                  appears in the email, or reply to the message and we will remove you manually.
                </p>
                <Link to="/public" className="btn-brutal-outline text-sm min-h-[44px] inline-flex items-center justify-center w-full">
                  Go to NGOreality
                </Link>
              </>
            ) : !action ? (
              <>
                <h1 className="text-xl font-bold text-ink-950 dark:text-foreground mb-2">
                  Unsubscribe is temporarily unavailable
                </h1>
                <p className="text-sm text-ink-600 dark:text-muted-foreground mb-6 leading-relaxed">
                  Please reply to the message and we will remove you manually.
                </p>
              </>
            ) : (
              <>
                <h1 className="text-xl font-bold text-ink-950 dark:text-foreground mb-2">
                  Unsubscribe from outreach email?
                </h1>
                <p className="text-sm text-ink-600 dark:text-muted-foreground mb-4 leading-relaxed">
                  You opened the unsubscribe link from an NGOreality outreach message. Click below
                  only if you no longer want invitation or follow-up emails from us.
                </p>
                <p className="text-xs text-ink-500 dark:text-muted-foreground mb-6 leading-relaxed border border-ink-200 dark:border-border bg-ink-50 dark:bg-muted/30 px-3 py-2">
                  Badge decisions, receipts, and monitoring alerts for sites you registered are
                  handled separately and are not affected by this preference.
                </p>
                <form method="POST" action={action} className="flex flex-col gap-3">
                  <input type="hidden" name="confirm" value="1" />
                  <button type="submit" className="btn-brutal text-sm min-h-[44px] w-full">
                    Unsubscribe from outreach emails
                  </button>
                  <Link
                    to="/public"
                    className="btn-brutal-outline text-sm min-h-[44px] inline-flex items-center justify-center w-full"
                  >
                    Keep receiving emails
                  </Link>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
