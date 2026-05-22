import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { linkExistingOrganization, provisionNgoOrganization } from '../../lib/ngoSignup';
import { CATEGORIES } from '../../types';
import OrganizationClaimSearch from '../OrganizationClaimSearch';
import NgoDirectoryOrgPreview from './NgoDirectoryOrgPreview';
import type { ClaimSearchOrganization } from '../../hooks/useOrganizationClaimSearch';

type SignupMode = 'existing' | 'new';

type NgoOrganizationRegistrationFormProps = {
  /** Already signed in — only link/create org, do not create auth user again. */
  loggedIn?: boolean;
  onSuccess?: () => void;
  title?: string;
  compact?: boolean;
};

export default function NgoOrganizationRegistrationForm({
  loggedIn = false,
  onSuccess,
  title = 'Complete registration',
  compact = false,
}: NgoOrganizationRegistrationFormProps) {
  const { signUp, user } = useAuth();
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

  useEffect(() => {
    if (!loggedIn || !user) return;
    setForm((prev) => ({
      ...prev,
      email: user.email ?? prev.email,
      fullName:
        (user.user_metadata?.full_name as string | undefined)?.trim() ||
        prev.fullName,
    }));
  }, [loggedIn, user]);

  const finishRegistration = async (userId: string) => {
    if (mode === 'new') {
      if (!form.organizationName.trim()) {
        return 'Enter your organization name.';
      }
      const { error: provisionError } = await provisionNgoOrganization({
        userId,
        organizationName: form.organizationName.trim(),
        contactName: form.fullName.trim() || 'Primary contact',
        email: form.email.trim(),
        category: form.category,
        location: form.location,
        websiteUrl: form.websiteUrl,
      });
      return provisionError;
    }

    if (!selectedOrg) {
      return 'Search the directory and select your organization, or register as new.';
    }

    const { error: linkError } = await linkExistingOrganization({
      userId,
      organizationId: selectedOrg.id,
      email: form.email.trim(),
    });
    return linkError;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'existing' && !selectedOrg) {
      setError('Search the directory and select your organization, or register as new.');
      return;
    }

    setSubmitting(true);

    let userId = user?.id;

    if (!loggedIn) {
      const { error: signUpError } = await signUp(form.email, form.password, form.fullName);
      if (signUpError) {
        setError(signUpError);
        setSubmitting(false);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      userId = sessionData.session?.user?.id;

      if (!userId) {
        setCheckEmail(true);
        setSubmitting(false);
        return;
      }
    }

    if (!userId) {
      setError('You must be signed in to link an organization.');
      setSubmitting(false);
      return;
    }

    const regError = await finishRegistration(userId);
    if (regError) {
      setError(regError);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    onSuccess?.();
  };

  if (checkEmail) {
    return (
      <div className={`card-brutal text-center ${compact ? 'p-5' : 'p-6 sm:p-8'}`}>
        <h2 className="text-lg font-black uppercase tracking-tight mb-3">Check your email</h2>
        <p className="text-sm text-ink-500 mb-6">
          We sent a confirmation link to <strong>{form.email}</strong>. After confirming, sign in and
          finish linking your organization.
        </p>
        <Link to="/ngo/login" className="btn-brutal-accent inline-block min-h-[44px] px-6 leading-[44px]">
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`card-brutal space-y-5 ${compact ? 'p-5' : 'p-6 sm:p-8'}`}>
      <div className="flex items-center gap-2">
        <UserPlus size={20} className="text-teal" aria-hidden />
        <h2 className="text-lg sm:text-xl font-black uppercase tracking-tight">{title}</h2>
      </div>

      {loggedIn && (
        <p className="text-sm text-ink-600 dark:text-muted-foreground leading-relaxed">
          Your account is signed in as <strong>{user?.email}</strong>. Link your charity from the
          directory or register a new organization below.
        </p>
      )}

      <div className="flex gap-2 p-1 border-2 border-ink-950 bg-ink-50 dark:bg-muted">
        <button
          type="button"
          onClick={() => setMode('existing')}
          className={`flex-1 py-2 font-mono text-2xs uppercase tracking-wider min-h-[44px] ${
            mode === 'existing' ? 'bg-ink-950 text-white dark:bg-primary dark:text-primary-foreground' : 'text-ink-600'
          }`}
        >
          In directory
        </button>
        <button
          type="button"
          onClick={() => setMode('new')}
          className={`flex-1 py-2 font-mono text-2xs uppercase tracking-wider min-h-[44px] ${
            mode === 'new' ? 'bg-ink-950 text-white dark:bg-primary dark:text-primary-foreground' : 'text-ink-600'
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

      {!loggedIn && (
        <>
          <p className="label-brutal">Your account</p>
          <div>
            <label className="label-brutal" htmlFor="full-name">
              Full name
            </label>
            <input
              id="full-name"
              className="input-brutal w-full text-base"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label-brutal" htmlFor="signup-email">
              Email
            </label>
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
            <label className="label-brutal" htmlFor="signup-password">
              Password
            </label>
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
        </>
      )}

      {mode === 'existing' ? (
        <>
          <OrganizationClaimSearch
            selected={selectedOrg}
            onSelect={setSelectedOrg}
            onRegisterNew={() => {
              setMode('new');
              setSelectedOrg(null);
              setError('');
            }}
          />
          {selectedOrg && <NgoDirectoryOrgPreview org={selectedOrg} />}
        </>
      ) : (
        <>
          <p className="border-t-3 border-ink-950 pt-4 label-brutal">Organization</p>
          <div>
            <label className="label-brutal" htmlFor="org-name">
              Organization name
            </label>
            <input
              id="org-name"
              className="input-brutal w-full text-base"
              value={form.organizationName}
              onChange={(e) => setForm({ ...form, organizationName: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label-brutal" htmlFor="category">
              Category
            </label>
            <select
              id="category"
              className="input-brutal w-full text-base"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              <option value="">Select category</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-brutal" htmlFor="location">
              Location
            </label>
            <input
              id="location"
              className="input-brutal w-full text-base"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="City, Country"
            />
          </div>
          <div>
            <label className="label-brutal" htmlFor="website">
              Website (optional)
            </label>
            <input
              id="website"
              type="url"
              className="input-brutal w-full text-base"
              value={form.websiteUrl}
              onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })}
              placeholder="https://"
            />
          </div>
        </>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="btn-brutal-accent w-full min-h-[48px] disabled:opacity-60"
      >
        {submitting
          ? loggedIn
            ? 'Linking organization…'
            : 'Creating account…'
          : loggedIn
            ? 'Link organization'
            : 'Create account'}
      </button>
    </form>
  );
}
