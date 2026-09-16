import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import SEO from '../../components/SEO';
import BrandLogo from '../../components/BrandLogo';
import ThemeToggle from '../../components/ThemeToggle';

export default function NgoForgotPassword() {
  const { requestPasswordReset } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState(
    (location.state as { email?: string } | null)?.email ?? '',
  );
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const { error: resetError } = await requestPasswordReset(email);
    setSubmitting(false);
    if (resetError) {
      setError(resetError);
      return;
    }
    setSent(true);
  };

  return (
    <>
      <SEO title="Reset password" description="Reset your NGOreality password." path="/ngo/forgot-password" />
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
              <KeyRound size={20} className="text-teal" aria-hidden />
              <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight">Reset password</h1>
            </div>

            {sent ? (
              // Deliberately the same message whether or not the address has an
              // account: this form must not tell a stranger who is registered.
              <p className="text-sm text-ink-700" role="status">
                If an account exists for <strong>{email.trim()}</strong>, we have emailed a link to
                choose a new password. It can take a minute to arrive — check your spam folder too.
              </p>
            ) : (
              <>
                <p className="text-sm text-ink-500">
                  Enter the email you signed up with and we will send you a link to choose a new
                  password.
                </p>

                {error && (
                  <p className="text-accent text-xs font-mono border-2 border-accent bg-accent-light px-3 py-2" role="alert">
                    {error}
                  </p>
                )}

                <div>
                  <label className="label-brutal" htmlFor="forgot-email">Email</label>
                  <input
                    id="forgot-email"
                    type="email"
                    autoComplete="email"
                    className="input-brutal w-full text-base"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-brutal-accent w-full min-h-[48px] text-sm sm:text-base disabled:opacity-60"
                >
                  {submitting ? 'Sending…' : 'Send reset link'}
                </button>
              </>
            )}

            <p className="text-center text-xs text-ink-500">
              <Link to="/ngo/login" className="font-semibold text-ink-950 underline">
                Back to sign in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </>
  );
}
