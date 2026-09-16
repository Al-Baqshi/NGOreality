import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { isValidPassword } from '../../lib/passwordPolicy';
import SEO from '../../components/SEO';
import BrandLogo from '../../components/BrandLogo';
import ThemeToggle from '../../components/ThemeToggle';

/**
 * Choose a new password.
 *
 * Reached two ways, both with a Supabase session: from the reset email (the
 * link signs the user in for recovery before this page renders) or from
 * "Change password" in the portal menu. With no session the link has expired
 * or was already used, and the only useful thing is a way to ask for another.
 */
export default function NgoResetPassword() {
  const { user, isStaff, loading, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const check = isValidPassword(password);
    if (!check.valid) {
      setError(check.message ?? 'Choose a stronger password.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }

    setSubmitting(true);
    const { error: updateError } = await updatePassword(password);
    setSubmitting(false);
    if (updateError) {
      setError(updateError);
      return;
    }
    navigate(isStaff ? '/dashboard' : '/ngo', { replace: true });
  };

  return (
    <>
      <SEO title="Choose a new password" description="Set a new NGOreality password." path="/ngo/reset-password" />
      <div className="min-h-screen bg-surface flex flex-col">
        <header className="border-b-3 border-ink-950 px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <Link to="/public" className="inline-flex items-center min-w-0">
            <BrandLogo iconClassName="h-11 w-11 sm:h-12 sm:w-12" />
          </Link>
          <ThemeToggle />
        </header>

        <div className="flex-1 flex items-center justify-center px-4 py-10">
          {loading ? (
            <p className="font-mono text-xs uppercase tracking-wider text-ink-500">Loading…</p>
          ) : !user ? (
            <div className="card-brutal w-full max-w-md p-6 sm:p-8 space-y-5">
              <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight">Link expired</h1>
              <p className="text-sm text-ink-500">
                This password reset link has expired or has already been used. Request a new one
                and use the most recent email.
              </p>
              <Link
                to="/ngo/forgot-password"
                className="btn-brutal-accent w-full min-h-[48px] text-sm sm:text-base inline-flex items-center justify-center"
              >
                Send a new link
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="card-brutal w-full max-w-md p-6 sm:p-8 space-y-5">
              <div className="flex items-center gap-2 mb-2">
                <KeyRound size={20} className="text-teal" aria-hidden />
                <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight">New password</h1>
              </div>
              <p className="text-sm text-ink-500">
                Choose a new password for <strong>{user.email}</strong>. At least 8 characters, with
                an uppercase letter, a lowercase letter and a number.
              </p>

              {error && (
                <p className="text-accent text-xs font-mono border-2 border-accent bg-accent-light px-3 py-2" role="alert">
                  {error}
                </p>
              )}

              {/* Lets password managers save the new password against the right account. */}
              <input type="email" autoComplete="username" value={user.email ?? ''} readOnly hidden />

              <div>
                <label className="label-brutal" htmlFor="reset-password">New password</label>
                <input
                  id="reset-password"
                  type="password"
                  autoComplete="new-password"
                  className="input-brutal w-full text-base"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label-brutal" htmlFor="reset-password-confirm">Confirm new password</label>
                <input
                  id="reset-password-confirm"
                  type="password"
                  autoComplete="new-password"
                  className="input-brutal w-full text-base"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="btn-brutal-accent w-full min-h-[48px] text-sm sm:text-base disabled:opacity-60"
              >
                {submitting ? 'Saving…' : 'Save new password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
