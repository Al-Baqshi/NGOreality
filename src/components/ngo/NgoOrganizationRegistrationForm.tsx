import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, UserPlus, AlertCircle } from 'lucide-react';
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
  /** Deep-link from outreach invite: `/ngo/signup?org=<uuid>` */
  prefillOrgId?: string | null;
};

function isValidPassword(password: string): { valid: boolean; message?: string } {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  return { valid: true };
}

function isValidDomain(url: string): boolean {
  if (!url.trim()) return true;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    const hostname = parsed.hostname;
    if (!hostname.includes('.')) return false;
    const tld = hostname.split('.').pop() || '';
    return tld.length >= 2 && /^[a-zA-Z0-9-]+$/.test(tld);
  } catch {
    return false;
  }
}

function validateSignupForm(form: any, loggedIn: boolean): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!loggedIn) {
    if (!form.fullName.trim()) {
      errors.push('Full name is required');
    }
    if (!form.email.trim()) {
      errors.push('Email is required');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errors.push('Please enter a valid email address');
    }
    if (!form.password) {
      errors.push('Password is required');
    } else {
      const pwdCheck = isValidPassword(form.password);
      if (!pwdCheck.valid && pwdCheck.message) {
        errors.push(pwdCheck.message);
      }
    }
  }

  if (form.websiteUrl.trim() && !isValidDomain(form.websiteUrl)) {
    errors.push('Please enter a valid website URL (e.g., https://example.com)');
  }

  return { valid: errors.length === 0, errors };
}

export default function NgoOrganizationRegistrationForm({
  loggedIn = false,
  onSuccess,
  title = 'Complete registration',
  compact = false,
  prefillOrgId = null,
}: NgoOrganizationRegistrationFormProps) {
  const { signUp, user } = useAuth();
  const [mode, setMode] = useState<SignupMode>('existing');
  const [selectedOrg, setSelectedOrg] = useState<ClaimSearchOrganization | null>(null);
  const [prefillLoading, setPrefillLoading] = useState(Boolean(prefillOrgId));
  const [prefillError, setPrefillError] = useState('');
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [alreadyManaged, setAlreadyManaged] = useState<AlreadyManagedState | null>(null);
  const [resuming, setResuming] = useState(false);
  const resumeAttempted = useRef(false);

  useEffect(() => {
    if (!prefillOrgId) {
      setPrefillLoading(false);
      return;
    }
    let cancelled = false;
    setPrefillLoading(true);
    setPrefillError('');
    void supabase
      .from('directory_listings')
      .select(
        'id, name, slug, charity_registration_number, location, country, status, description, mission_statement, website_url, logo_url, category',
      )
      .eq('id', prefillOrgId)
      .maybeSingle()
      .then(({ data, error: loadError }) => {
        if (cancelled) return;
        setPrefillLoading(false);
        if (loadError || !data) {
          setPrefillError('We could not find that organisation. Search the directory below.');
          return;
        }
        setMode('existing');
        setSelectedOrg(data as ClaimSearchOrganization);
      });
    return () => {
      cancelled = true;
    };
  }, [prefillOrgId]);

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
    setFieldErrors({});

    if (mode === 'existing' && !selectedOrg) {
      setError('Search the directory and select your organization, or register as new.');
      return;
    }

    // Validate form
    const validation = validateSignupForm(form, loggedIn);
    if (!validation.valid) {
      const fieldErrorMap: Record<string, string> = {};
      validation.errors.forEach((err) => {
        if (err.includes('name')) fieldErrorMap.fullName = err;
        else if (err.includes('Email') || err.includes('email')) fieldErrorMap.email = err;
        else if (err.includes('Password') || err.includes('password')) fieldErrorMap.password = err;
        else if (err.includes('website') || err.includes('URL')) fieldErrorMap.websiteUrl = err;
      });
      setFieldErrors(fieldErrorMap);
      setError(validation.errors.join('; '));
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

      {prefillLoading && (
        <p className="text-sm text-ink-600 dark:text-muted-foreground">Loading your organisation from the invite…</p>
      )}
      {prefillError && (
        <p className="text-sm text-amber-800 dark:text-amber-200 border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
          {prefillError}
        </p>
      )}
      {selectedOrg && prefillOrgId && !prefillError && (
        <p className="text-sm text-teal border-2 border-teal/40 bg-teal/5 px-3 py-2">
          Invite linked to <strong>{selectedOrg.name}</strong>. Create your account (or sign in) to claim it,
          then choose Reality Badge or the trust landing package in the portal.
        </p>
      )}

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
              className={`input-brutal w-full text-base ${fieldErrors.fullName ? 'border-red-500' : ''}`}
              value={form.fullName}
              onChange={(e) => {
                setForm({ ...form, fullName: e.target.value });
                if (fieldErrors.fullName) setFieldErrors((prev) => ({ ...prev, fullName: '' }));
              }}
              required
            />
            {fieldErrors.fullName && (
              <p className="text-red-600 text-xs font-mono mt-1" role="alert">
                <AlertCircle size={12} className="inline mr-1" /> {fieldErrors.fullName}
              </p>
            )}
          </div>
          <div>
            <label className="label-brutal" htmlFor="signup-email">
              Email
            </label>
            <input
              id="signup-email"
              type="email"
              autoComplete="email"
              className={`input-brutal w-full text-base ${fieldErrors.email ? 'border-red-500' : ''}`}
              value={form.email}
              onChange={(e) => {
                setForm({ ...form, email: e.target.value });
                if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: '' }));
              }}
              required
            />
            {fieldErrors.email && (
              <p className="text-red-600 text-xs font-mono mt-1" role="alert">
                <AlertCircle size={12} className="inline mr-1" /> {fieldErrors.email}
              </p>
            )}
          </div>
          <div>
            <label className="label-brutal" htmlFor="signup-password">
              Password
            </label>
            <input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              className={`input-brutal w-full text-base ${fieldErrors.password ? 'border-red-500' : ''}`}
              value={form.password}
              onChange={(e) => {
                setForm({ ...form, password: e.target.value });
                if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: '' }));
              }}
              minLength={8}
              required
            />
            {fieldErrors.password && (
              <p className="text-red-600 text-xs font-mono mt-1" role="alert">
                <AlertCircle size={12} className="inline mr-1" /> {fieldErrors.password}
              </p>
            )}
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
              className={`input-brutal w-full text-base ${fieldErrors.organizationName ? 'border-red-500' : ''}`}
              value={form.organizationName}
              onChange={(e) => {
                setForm({ ...form, organizationName: e.target.value });
                if (fieldErrors.organizationName) setFieldErrors((prev) => ({ ...prev, organizationName: '' }));
              }}
              required
            />
            {fieldErrors.organizationName && (
              <p className="text-red-600 text-xs font-mono mt-1" role="alert">
                <AlertCircle size={12} className="inline mr-1" /> {fieldErrors.organizationName}
              </p>
            )}
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
              className={`input-brutal w-full text-base ${fieldErrors.websiteUrl ? 'border-red-500' : ''}`}
              value={form.websiteUrl}
              onChange={(e) => {
                setForm({ ...form, websiteUrl: e.target.value });
                if (fieldErrors.websiteUrl) setFieldErrors((prev) => ({ ...prev, websiteUrl: '' }));
              }}
              placeholder="https://"
            />
            {fieldErrors.websiteUrl && (
              <p className="text-red-600 text-xs font-mono mt-1" role="alert">
                <AlertCircle size={12} className="inline mr-1" /> {fieldErrors.websiteUrl}
              </p>
            )}
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
