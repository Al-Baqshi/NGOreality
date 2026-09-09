import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useNgoPortal } from '../../hooks/useNgoPortal';
import SEO from '../../components/SEO';
import BrandLogo from '../../components/BrandLogo';
import ThemeToggle from '../../components/ThemeToggle';
import NgoOrganizationRegistrationForm from '../../components/ngo/NgoOrganizationRegistrationForm';
import { QueryError } from '../../components/ui';

export default function NgoSignup() {
  const { user, loading: authLoading } = useAuth();
  const { hasOrganization, isLinked, loading: portalLoading, refetch, error } = useNgoPortal();
  const [searchParams] = useSearchParams();
  const prefillOrgId = searchParams.get('org');
  const loggedIn = Boolean(user);

  if (authLoading || (loggedIn && portalLoading)) {
    return (
      <>
        <SEO
          title="Complete registration"
          description="Register your nonprofit for NGOreality membership and Reality Badge management."
          path="/ngo/signup"
        />
        <div className="min-h-screen bg-surface flex flex-col">
          <header className="border-b-3 border-ink-950 px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
            <Link to="/ngo" className="inline-flex items-center min-w-0">
              <BrandLogo iconClassName="h-11 w-11 sm:h-12 sm:w-12" />
            </Link>
            <ThemeToggle />
          </header>
          <p className="flex-1 px-4 py-16 text-center font-mono text-xs uppercase tracking-wider text-ink-500">
            Loading…
          </p>
        </div>
      </>
    );
  }

  if (loggedIn && hasOrganization) {
    return <Navigate to="/ngo/services" replace />;
  }

  const portalBlocked = Boolean(loggedIn && error && !hasOrganization);
  const linkedOrgMissing = Boolean(loggedIn && isLinked && !hasOrganization);

  return (
    <>
      <SEO
        title={loggedIn ? 'Complete registration' : 'NGO Sign Up'}
        description="Register your nonprofit for NGOreality membership and Reality Badge management."
        path="/ngo/signup"
      />
      <div className="min-h-screen bg-surface flex flex-col">
        <header className="border-b-3 border-ink-950 px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <Link to={loggedIn ? '/ngo' : '/public'} className="inline-flex items-center min-w-0">
            <BrandLogo iconClassName="h-11 w-11 sm:h-12 sm:w-12" />
          </Link>
          <ThemeToggle />
        </header>

        <div className="flex-1 px-4 py-8 sm:py-10 max-w-lg mx-auto w-full">
          {portalBlocked ? (
            <QueryError message={error ?? ''} onRetry={() => void refetch()} />
          ) : (
            <>
              {linkedOrgMissing && (
                <p className="mb-4 text-sm text-amber-800 dark:text-amber-200 border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
                  Your account is linked but we could not load the organization record. Try again or contact
                  support.
                </p>
              )}

              {linkedOrgMissing ? (
                <button
                  type="button"
                  onClick={() => void refetch()}
                  className="btn-brutal-outline min-h-[44px] px-4 text-sm"
                >
                  Try again
                </button>
              ) : (
                <NgoOrganizationRegistrationForm
                  loggedIn={loggedIn}
                  prefillOrgId={prefillOrgId}
                  title={loggedIn ? 'Complete registration' : 'NGO sign up'}
                  onSuccess={() => {
                    void refetch();
                    window.location.assign('/ngo/services');
                  }}
                />
              )}

              {!loggedIn && (
                <p className="text-center text-xs text-ink-500 mt-6">
                  Already registered?{' '}
                  <Link to="/ngo/login" className="font-semibold text-ink-950 underline dark:text-foreground">
                    Sign in
                  </Link>
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
