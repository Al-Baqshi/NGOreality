import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import SEO from '../../components/SEO';
import BrandLogo from '../../components/BrandLogo';

export default function NgoLogin() {
  const { signIn, user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/ngo';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const { error: signInError } = await signIn(email, password);
    setSubmitting(false);
    if (signInError) {
      setError(signInError);
      return;
    }
    navigate(from, { replace: true });
  };

  return (
    <>
      <SEO title="NGO Sign In" description="Sign in to manage your NGOreality membership and Reality Badge." path="/ngo/login" />
      <div className="min-h-screen bg-surface flex flex-col">
        <header className="border-b-3 border-ink-950 px-4 sm:px-6 py-4">
          <Link to="/public" className="inline-flex items-center min-w-0">
            <BrandLogo iconClassName="h-8 w-8" wordmarkClassName="h-7 w-auto max-w-[160px]" />
          </Link>
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
              <label className="label-brutal" htmlFor="ngo-email">Email</label>
              <input
                id="ngo-email"
                type="email"
                autoComplete="email"
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
