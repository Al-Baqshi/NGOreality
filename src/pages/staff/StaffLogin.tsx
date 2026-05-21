import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import SEO from '../../components/SEO';
import BrandLogo from '../../components/BrandLogo';
import ThemeToggle from '../../components/ThemeToggle';

type StaffLoginLocationState = {
  from?: string;
  staffDenied?: boolean;
};

export default function StaffLogin() {
  const { signInAsStaff, user, isStaff, loading, profileLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as StaffLoginLocationState | null) ?? {};
  const from = state.from ?? '/dashboard';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(
    state.staffDenied ? 'This account does not have staff access.' : '',
  );
  const [submitting, setSubmitting] = useState(false);

  if (!loading && !profileLoading && user && isStaff) {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const { error: signInError } = await signInAsStaff(username.trim(), password);
    setSubmitting(false);
    if (signInError) {
      setError(signInError);
      return;
    }
    navigate(from, { replace: true });
  };

  const handleSignOut = async () => {
    await signOut();
    setError('');
  };

  return (
    <>
      <SEO
        title="Staff Sign In"
        description="Sign in to the NGOreality staff CRM console."
        path="/staff/login"
      />
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
              <Shield size={20} className="text-teal" aria-hidden />
              <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight">Staff sign in</h1>
            </div>
            <p className="text-sm text-ink-500">
              CRM console for NGOreality staff. Use your assigned username and password.
            </p>

            {error && (
              <p
                className="text-accent text-xs font-mono border-2 border-accent bg-accent-light px-3 py-2"
                role="alert"
              >
                {error}
              </p>
            )}

            {!loading && !profileLoading && user && !isStaff && (
              <div className="border-2 border-ink-200 bg-ink-50 px-3 py-3 space-y-2">
                <p className="text-xs text-ink-600">
                  You are signed in as a non-staff account. Sign out to use a staff account.
                </p>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="btn-brutal w-full min-h-[44px] text-xs sm:text-sm"
                >
                  Sign out
                </button>
              </div>
            )}

            <div>
              <label className="label-brutal" htmlFor="staff-username">
                Username
              </label>
              <input
                id="staff-username"
                type="text"
                autoComplete="username"
                inputMode="email"
                className="input-brutal w-full text-base"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="you@ngoreality.com"
                required
              />
            </div>
            <div>
              <label className="label-brutal" htmlFor="staff-password">
                Password
              </label>
              <input
                id="staff-password"
                type="password"
                autoComplete="current-password"
                className="input-brutal w-full text-base"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn-brutal-accent w-full min-h-[48px] text-sm sm:text-base disabled:opacity-60"
            >
              {submitting ? 'Signing in…' : 'Sign in to CRM'}
            </button>

            <p className="text-center text-xs text-ink-500">
              <Link to="/public" className="font-semibold text-ink-950 underline">
                Back to public site
              </Link>
            </p>
          </form>
        </div>
      </div>
    </>
  );
}
