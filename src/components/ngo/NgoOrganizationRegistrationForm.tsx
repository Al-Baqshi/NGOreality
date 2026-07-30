import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, UserPlus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  clearPendingRegistration,
  getPendingRegistration,
  joinOrganization,
  linkExistingOrganization,
  provisionNgoOrganization,
  resumePendingRegistration,
  type OrgManagerInfo,
  type PendingRegistration,
} from '../../lib/ngoSignup';
import { CATEGORIES } from '../../types';
import OrganizationClaimSearch from '../OrganizationClaimSearch';
import NgoDirectoryOrgPreview from './NgoDirectoryOrgPreview';
import Turnstile, { isTurnstileEnabled } from '../Turnstile';
import { verifyTurnstileToken } from '../../lib/turnstile';
import type { ClaimSearchOrganization } from '../../hooks/useOrganizationClaimSearch';

type SignupMode = 'existing' | 'new';

type AlreadyManagedState = {
  organizationId: string;
  organizationName: string;
  managers: OrgManagerInfo[];
};

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
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [alreadyManaged, setAlreadyManaged] = useState<AlreadyManagedState | null>(null);
  const [resuming, setResuming] = useState(false);
  const resumeAttempted = useRef(false);

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

  // A signup interrupted by email confirmation left the chosen organisation in
  // user metadata — finish linking it automatically on first login.
  useEffect(() => {
    if (!loggedIn || !user || resumeAttempted.current) return;
    if (!getPendingRegistration(user)) return;
    resumeAttempted.current = true;
    setResuming(true);
    void resumePendingRegistration(user).then((result) => {
      setResuming(false);
      if (!result) return;
      if (result.status === 'linked') {
        onSuccess?.();
        return;
      }
      if (result.status === 'already_managed' && result.pending.mode === 'existing') {
        setAlreadyManaged({
          organizationId: result.pending.organizationId,
          organizationName: result.pending.organizationName,
          managers: result.managers,
        });
        return;
      }
      if (result.error) setError(result.error);
    });
  }, [loggedIn, user, onSuccess]);

  const finishRegistration = async (): Promise<{ error: string | null; parked: boolean }> => {
    if (mode === 'new') {
      if (!form.organizationName.trim()) {
        return { error: 'Enter your organization name.', parked: false };
      }
      const result = await provisionNgoOrganization({
        organizationName: form.organizationName.trim(),
        contactName: form.fullName.trim() || 'Primary contact',
        category: form.category,
        location: form.location,
        websiteUrl: form.websiteUrl,
      });
      return { error: result.error, parked: false };
    }

    if (!selectedOrg) {
      return { error: 'Search the directory and select your organization, or register as new.', parked: false };
    }

    const result = await linkExistingOrganization(selectedOrg.id);
    if (result.status === 'already_managed') {
      setAlreadyManaged({
        organizationId: selectedOrg.id,
        organizationName: selectedOrg.name,
        managers: result.managers,
      });
      return { error: null, parked: true };
    }
    return { error: result.error, parked: false };
  };

  const pendingRegistrationMetadata = (): PendingRegistration | null => {
    if (mode === 'existing') {
      if (!selectedOrg) return null;
      return { mode: 'existing', organizationId: selectedOrg.id, organizationName: selectedOrg.name };
    }
    if (!form.organizationName.trim()) return null;
    return {
      mode: 'new',
      organizationName: form.organizationName.trim(),
      contactName: form.fullName.trim() || 'Primary contact',
      category: form.category,
      location: form.location,
      websiteUrl: form.websiteUrl,
    };
  };

  const handleJoinAnyway = async () => {
    if (!alreadyManaged) return;
    setSubmitting(true);
    setError('');
    const result = await joinOrganization(alreadyManaged.organizationId);
    if (result.status === 'linked') {
      await clearPendingRegistration();
      setSubmitting(false);
      setAlreadyManaged(null);
      onSuccess?.();
      return;
    }
    setError(result.error ?? 'Could not join the organization.');
    setSubmitting(false);
  };

  const handlePickDifferentOrg = async () => {
    await clearPendingRegistration();
    setAlreadyManaged(null);
    setSelectedOrg(null);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'existing' && !selectedOrg) {
      setError('Search the directory and select your organization, or register as new.');
      return;
    }

    if (!loggedIn && isTurnstileEnabled() && !turnstileToken) {
      setError('Please complete the security check.');
      return;
    }

    setSubmitting(true);

    if (!loggedIn && isTurnstileEnabled() && turnstileToken) {
      const verified = await verifyTurnstileToken(turnstileToken);
      if (!verified) {
        setError('Security check failed. Please try again.');
        setTurnstileToken(null);
        setSubmitting(false);
        return;
      }
    }

    let userId = user?.id;

    if (!loggedIn) {
      // Carry the chosen organisation through the email-confirmation
      // round-trip: if no session comes back, the first login resumes it.
      const pending = pendingRegistrationMetadata();
      const { error: signUpError } = await signUp(
        form.email,
        form.password,
        form.fullName,
        pending ? { pending_registration: pending } : undefined,
      );
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

    const { error: regError, parked } = await finishRegistration();
    if (regError) {
      setError(regError);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    // finishRegistration may have parked us on the "already managed" choice.
    if (!parked) {
      await clearPendingRegistration();
      onSuccess?.();
    }
  };

  if (checkEmail) {
    return (
      <div className={`card-brutal text-center ${compact ? 'p-5' : 'p-6 sm:p-8'}`}>
        <h2 className="text-lg font-black uppercase tracking-tight mb-3">Check your email</h2>
        <p className="text-sm text-ink-500 mb-6">
          We sent a confirmation link to <strong>{form.email}</strong>. After confirming, sign in —
          {mode === 'existing' && selectedOrg
            ? ` ${selectedOrg.name} will be linked to your account automatically.`
            : ' your organization will be set up automatically.'}
        </p>
        <Link to="/ngo/login" className="btn-brutal-accent inline-block min-h-[44px] px-6 leading-[44px]">
          Go to sign in
        </Link>
      </div>
    );
  }

  if (resuming) {
    return (
      <div className={`card-brutal text-center ${compact ? 'p-5' : 'p-6 sm:p-8'}`}>
        <h2 className="text-lg font-black uppercase tracking-tight mb-3">Finishing your registration…</h2>
        <p className="text-sm text-ink-500">Linking your organization to your account.</p>
      </div>
    );
  }

  if (alreadyManaged) {
    return (
      <div className={`card-brutal space-y-5 ${compact ? 'p-5' : 'p-6 sm:p-8'}`}>
        <div className="flex items-center gap-2">
          <Users size={20} className="text-teal" aria-hidden />
          <h2 className="text-lg sm:text-xl font-black uppercase tracking-tight">
            Already managed
          </h2>
        </div>
        <p className="text-sm text-ink-600 dark:text-muted-foreground leading-relaxed">
          <strong>{alreadyManaged.organizationName}</strong> is already managed on NGOreality by:
        </p>
        <ul className="space-y-1">
          {alreadyManaged.managers.map((m) => (
            <li key={m.email} className="text-sm font-mono border-2 border-ink-200 px-3 py-2">
              {m.full_name ? `${m.full_name} — ` : ''}
              <a href={`mailto:${m.email}`} className="font-semibold underline">
                {m.email}
              </a>
            </li>
          ))}
        </ul>
        <p className="text-sm text-ink-600 dark:text-muted-foreground leading-relaxed">
          You can keep going and join as an additional manager (the current managers will be
          notified), or contact them first.
        </p>

        {error && (
          <p className="text-accent text-xs font-mono border-2 border-accent bg-accent-light px-3 py-2" role="alert">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleJoinAnyway}
          disabled={submitting}
          className="btn-brutal-accent w-full min-h-[48px] disabled:opacity-60"
        >
          {submitting ? 'Joining…' : 'Keep going — join as a manager'}
        </button>
        <button
          type="button"
          onClick={() => void handlePickDifferentOrg()}
          disabled={submitting}
          className="btn-brutal w-full min-h-[44px] disabled:opacity-60"
        >
          Choose a different organization
        </button>
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

      {!loggedIn && (
        <Turnstile
          onSuccess={setTurnstileToken}
          onExpire={() => setTurnstileToken(null)}
          onError={() => setTurnstileToken(null)}
        />
      )}

      <button
        type="submit"
        disabled={submitting || (!loggedIn && isTurnstileEnabled() && !turnstileToken)}
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
