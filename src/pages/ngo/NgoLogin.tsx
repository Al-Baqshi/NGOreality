import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getIdentity, CrmApiError } from '../../lib/crmApi';
import { supabase } from '../../lib/supabase';
import { getPendingRegistration } from '../../lib/ngoSignup';
import { captureError } from '../../lib/errorReporting';
import { BAQSHI_FORGOT_PASSWORD_URL } from '../../lib/baqshiAuth';
import SEO from '../../components/SEO';
import BrandLogo from '../../components/BrandLogo';
import ThemeToggle from '../../components/ThemeToggle';

export default function NgoLogin() {
  const { signIn, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/ngo';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && isAuthenticated) {
    return <Navigate to={from === '/ngo/login' ? '/ngo' : from} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const { error: signInError } = await signIn(email, password);
    if (signInError) {
      setError(signInError);
      setSubmitting(false);
      return;
    }

    let destination = from === '/ngo/login' ? '/ngo' : from;

    // FIRST: does this account have an organisation, or an unfinished signup?
    //
    // Signup deliberately parks the chosen organisation in Supabase user
    // metadata and tells the user "after confirming, sign in — your
    // organization will be set up automatically". The thing that actually
    // creates it is NgoOrganizationRegistrationForm's resume effect, which only
    // runs when that component mounts, i.e. on /ngo/signup. So sending an
    // organisation-less account there is not a fallback, it is the final step
    // of registration.
    //
    // An earlier version of this handler checked the CRM for a WORKSPACE seat
    // instead and returned early on 403. That silently broke every new signup:
    // the account and the confirmation existed, the organisation never did,
    // and nothing appeared in the CRM because there was nothing to show. A
    // workspace is a separate product — not having one says nothing about
    // whether you have an organisation.
    const { data: sessionData } = await supabase.auth.getSession();
    const supabaseUser = sessionData.session?.user;

    if (supabaseUser) {
      if (getPendingRegistration(supabaseUser)) {
        destination = '/ngo/signup';
      } else {
        const { data: members, error: membersError } = await supabase
          .from('organization_members')
          .select('id')
          .eq('user_id', supabaseUser.id)
          .limit(1);
        if (membersError) {
          captureError(membersError, { where: 'NgoLogin.membershipCheck' });
        } else if (!members?.length) {
          destination = '/ngo/signup';
        }
      }
    } else {
      // Central-only account: no Supabase metadata, so the CRM seat is the
      // only signal we have. This is informational, never blocking — a 403
      // here means "no workspace", which the portal itself explains better.
      try {
        await getIdentity();
      } catch (err) {
        if (!(err instanceof CrmApiError && (err.status === 403 || err.status === 404))) {
          captureError(err, { where: 'NgoLogin.identity' });
        }
      }
    }

    setSubmitting(false);
    navigate(destination, { replace: true });
  };

  return (
    <>
      <SEO title="NGO Sign In" description="Sign in to manage your NGOreality membership and Reality Badge." path="/ngo/login" />
      <div className="min-h-screen bg-surface flex flex-col">
        <header className="border-b-3 border-ink-950 px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <Link to="/public" className="inline-flex items-center min-w-0">
            <BrandLogo iconClassName="h-11 w-11 sm:h-12 sm:w-12" />
          </Link>
          <ThemeToggle />
        </header>

        <div className="flex-1 flex items-center justify-center px-4 py-10">
          <form onSubmit={handleSubmit} className="card-brutal w-full max-w-md p-6 sm:p-8 space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <LogIn size={20} className="text-teal" aria-hidden />
              <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight">NGO sign in</h1>
            </div>
            <p className="text-sm text-ink-500">
              View your membership status, renewal date, and badge requests.
            </p>

            {error && (
              <p className="text-accent text-xs font-mono border-2 border-accent bg-accent-light px-3 py-2" role="alert">
                {error}
              </p>
            )}

            <div>
              <label className="label-brutal" htmlFor="ngo-email">Email or username</label>
              {/* type="text": the central service accepts either, and type="email"
                  would have the browser reject a valid username before submit. */}
              <input
                id="ngo-email"
                type="text"
                autoComplete="username"
                className="input-brutal w-full text-base"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label-brutal" htmlFor="ngo-password">Password</label>
              <input
                id="ngo-password"
                type="password"
                autoComplete="current-password"
                className="input-brutal w-full text-base"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <p className="text-right">
              <a
                href={BAQSHI_FORGOT_PASSWORD_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="text-xs text-ink-500 underline hover:text-ink-950"
              >
                Forgot password?
              </a>
            </p>

            <button
              type="submit"
              disabled={submitting}
              className="btn-brutal-accent w-full min-h-[48px] text-sm sm:text-base disabled:opacity-60"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>

            <p className="text-center text-xs text-ink-500">
              New organization?{' '}
              <Link to="/ngo/signup" className="font-semibold text-ink-950 underline">
                Create an account
              </Link>
            </p>
          </form>
        </div>
      </div>
    </>
  );
}
