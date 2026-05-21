import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { provisionNgoOrganization, linkExistingOrganization } from '../../lib/ngoSignup';
import { CATEGORIES } from '../../types';
import SEO from '../../components/SEO';
import OrganizationClaimSearch from '../../components/OrganizationClaimSearch';
import BrandLogo from '../../components/BrandLogo';
import ThemeToggle from '../../components/ThemeToggle';
import type { ClaimSearchOrganization } from '../../hooks/useOrganizationClaimSearch';

type SignupMode = 'existing' | 'new';

export default function NgoSignup() {
  const { signUp, user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<SignupMode>('existing');
  const [selectedOrg, setSelectedOrg] = useState<ClaimSearchOrganization | null>(null);
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    organizationName: '',
    category: '',
    location: '',
    websiteUrl: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  if (!loading && user && !checkEmail) {
    return <Navigate to="/ngo" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'existing' && !selectedOrg) {
      setError('Search the directory and select your organization, or register as new.');
      return;
    }

    setSubmitting(true);

    const { error: signUpError } = await signUp(form.email, form.password, form.fullName);
    if (signUpError) {
      setError(signUpError);
      setSubmitting(false);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;

    if (!userId) {
      setCheckEmail(true);
      setSubmitting(false);
      return;
    }

    if (mode === 'new') {
      const { error: provisionError } = await provisionNgoOrganization({
        userId,
        organizationName: form.organizationName,
        contactName: form.fullName,
        email: form.email,
        category: form.category,
        location: form.location,
        websiteUrl: form.websiteUrl,
      });
      if (provisionError) {
        setError(provisionError);
        setSubmitting(false);
        return;
      }
    } else {
      const { error: linkError } = await linkExistingOrganization({
        userId,
        organizationId: selectedOrg!.id,
        email: form.email,
      });
      if (linkError) {
        setError(linkError);
        setSubmitting(false);
        return;
      }
    }

    setSubmitting(false);
    navigate('/ngo', { replace: true });
  };

  return (
    <>
      <SEO
        title="NGO Sign Up"
        description="Register your nonprofit for NGOreality membership and Reality Badge management."
        path="/ngo/signup"
      />
      <div className="min-h-screen bg-surface flex flex-col">
        <header className="border-b-3 border-ink-950 px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <Link to="/public" className="inline-flex items-center min-w-0">
            <BrandLogo iconClassName="h-11 w-11 sm:h-12 sm:w-12" />
          </Link>
          <ThemeToggle />
        </header>

        <div className="flex-1 px-4 py-8 sm:py-10 max-w-lg mx-auto w-full">
          {checkEmail ? (
            <div className="card-brutal p-6 sm:p-8 text-center">
              <h1 className="text-xl font-black uppercase tracking-tight mb-3">Check your email</h1>
              <p className="text-sm text-ink-500 mb-6">
                We sent a confirmation link to <strong>{form.email}</strong>. After confirming, sign in to access your portal.
              </p>
              <Link to="/ngo/login" className="btn-brutal-accent inline-block min-h-[44px] px-6 leading-[44px]">
                Go to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="card-brutal p-6 sm:p-8 space-y-5">
              <div className="flex items-center gap-2">
                <UserPlus size={20} className="text-teal" aria-hidden />
                <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight">NGO sign up</h1>
              </div>

              <div className="flex gap-2 p-1 border-2 border-ink-950 bg-ink-50">
                <button
                  type="button"
                  onClick={() => setMode('existing')}
                  className={`flex-1 py-2 font-mono text-2xs uppercase tracking-wider min-h-[44px] ${
                    mode === 'existing' ? 'bg-ink-950 text-white' : 'text-ink-600'
                  }`}
                >
                  In directory
                </button>
                <button
                  type="button"
                  onClick={() => setMode('new')}
                  className={`flex-1 py-2 font-mono text-2xs uppercase tracking-wider min-h-[44px] ${
                    mode === 'new' ? 'bg-ink-950 text-white' : 'text-ink-600'
                  }`}
                >
                  New org
                </button>
              </div>

              {error && (
                <p className="text-accent text-xs font-mono border-2 border-accent bg-accent-light px-3 py-2" role="alert">
                  {error}
                </p>
              )}

              <p className="label-brutal">Your account</p>
              <div>
                <label className="label-brutal" htmlFor="full-name">Full name</label>
                <input
                  id="full-name"
                  className="input-brutal w-full text-base"
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="label-brutal" htmlFor="signup-email">Email</label>
                <input
                  id="signup-email"
                  type="email"
                  autoComplete="email"
                  className="input-brutal w-full text-base"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="label-brutal" htmlFor="signup-password">Password</label>
                <input
                  id="signup-password"
                  type="password"
                  autoComplete="new-password"
                  className="input-brutal w-full text-base"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  minLength={8}
                  required
                />
              </div>

              {mode === 'existing' ? (
                <OrganizationClaimSearch
                  selected={selectedOrg}
                  onSelect={setSelectedOrg}
                  onRegisterNew={() => {
                    setMode('new');
                    setSelectedOrg(null);
                    setError('');
                  }}
                />
              ) : (
                <>
                  <p className="border-t-3 border-ink-950 pt-4 label-brutal">Organization</p>
                  <div>
                    <label className="label-brutal" htmlFor="org-name">Organization name</label>
                    <input
                      id="org-name"
                      className="input-brutal w-full text-base"
                      value={form.organizationName}
                      onChange={(e) => setForm({ ...form, organizationName: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="label-brutal" htmlFor="category">Category</label>
                    <select
                      id="category"
                      className="input-brutal w-full text-base"
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                    >
                      <option value="">Select category</option>
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label-brutal" htmlFor="location">Location</label>
                    <input
                      id="location"
                      className="input-brutal w-full text-base"
                      value={form.location}
                      onChange={(e) => setForm({ ...form, location: e.target.value })}
                      placeholder="City, Country"
                    />
                  </div>
                  <div>
                    <label className="label-brutal" htmlFor="website">Website (optional)</label>
                    <input
                      id="website"
                      type="url"
                      className="input-brutal w-full text-base"
                      value={form.websiteUrl}
                      onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })}
                      placeholder="https://"
                    />
                  </div>
                  <p className="text-xs text-ink-500 text-center">
                    Already in our directory?{' '}
                    <button
                      type="button"
                      onClick={() => setMode('existing')}
                      className="font-semibold text-ink-950 underline min-h-[44px]"
                    >
                      Search and claim your listing
                    </button>
                  </p>
                </>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="btn-brutal-accent w-full min-h-[48px] disabled:opacity-60"
              >
                {submitting ? 'Creating account…' : 'Create account'}
              </button>

              <p className="text-center text-xs text-ink-500">
                Already registered?{' '}
                <Link to="/ngo/login" className="font-semibold text-ink-950 underline">
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
