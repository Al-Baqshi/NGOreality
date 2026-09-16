import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { fetchUserProfile, type UserProfile } from '../lib/profile';
import { supabase } from '../lib/supabase';

/**
 * One issuer: Supabase Auth, for everyone.
 *
 * NGO users and staff sign up, sign in, confirm their email and reset their
 * password through Supabase. The portal reads Supabase directly under RLS on
 * auth.uid(), so a session from anywhere else could never open it anyway.
 *
 * NGO sign-in briefly went through the central Baqshi service (auth.baqshi.com)
 * while signup stayed here, which split every account in two: new users could
 * not reset a password on a service they did not exist in. Keep all of the
 * account lifecycle in one place.
 */

export const RESET_PASSWORD_PATH = '/ngo/reset-password';

// A recovery link is only useful on the page that sets the new password. If
// Supabase's redirect allowlist (a dashboard setting no code can see) sends the
// link somewhere else, the session is still established from the URL — so send
// the user on. Subscribed at module scope, not in an effect: the client reads
// the URL as soon as it is created, and an effect would subscribe too late to
// see the event. The session is persisted before the event fires, so a full
// navigation keeps it.
supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY' && window.location.pathname !== RESET_PASSWORD_PATH) {
    window.location.replace(RESET_PASSWORD_PATH);
  }
});

// Sessions from the retired Baqshi sign-in kept a refresh token here. Nothing
// reads it any more; do not leave a live credential behind in storage.
try {
  localStorage.removeItem('baqshi.refresh_token');
} catch {
  /* storage unavailable */
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  profile: UserProfile | null;
  isStaff: boolean;
  loading: boolean;
  profileLoading: boolean;
  profileError: string | null;
  refetchProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signInAsStaff: (username: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    extraMetadata?: Record<string, unknown>,
  ) => Promise<{ error: string | null; alreadyRegistered: boolean }>;
  resendSignupEmail: (email: string) => Promise<{ error: string | null }>;
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeStaffLogin(username: string): string {
  return username.trim();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      setProfileError(null);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    try {
      const next = await fetchUserProfile(userId);
      setProfile(next);
      setProfileError(null);
    } catch (err) {
      // A failed lookup is not "this person is not staff". Keep the last good
      // profile so a transient PostgREST error cannot boot someone out of CRM.
      setProfileError(err instanceof Error ? err.message : 'Could not load your profile.');
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
      void loadProfile(data.session?.user?.id);
    })();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
      void loadProfile(nextSession?.user?.id);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    return { error: error?.message ?? null };
  }, []);

  const signInAsStaff = useCallback(
    async (username: string, password: string) => {
      const email = normalizeStaffLogin(username);
      if (!email.includes('@')) {
        return { error: 'Enter your staff email address as your username.' };
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };

      let staffProfile: UserProfile | null;
      try {
        staffProfile = await fetchUserProfile(data.user.id);
      } catch (err) {
        await supabase.auth.signOut();
        setProfile(null);
        return { error: err instanceof Error ? err.message : 'Could not load staff profile.' };
      }
      if (!staffProfile?.is_staff) {
        await supabase.auth.signOut();
        setProfile(null);
        return { error: 'Invalid staff credentials or account is not authorized for CRM access.' };
      }

      setProfile(staffProfile);
      return { error: null };
    },
    [],
  );

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      fullName: string,
      extraMetadata?: Record<string, unknown>,
    ) => {
      const emailRedirectTo = `${window.location.origin}/ngo/signup`;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, ...extraMetadata },
          // Say where the confirmation link lands, explicitly.
          //
          // Without this, Supabase falls back to the project's Site URL, which
          // is a dashboard field no code can see and which was pointing at
          // localhost. The result was silent and total: clicking the link DID
          // confirm the address server-side, then dropped the user on a dead
          // local address. They never returned to the app with a session, so
          // the registration parked in user metadata never resumed and the
          // organisation was never created — an account with no organisation,
          // and nothing in the CRM to show anyone had signed up.
          //
          // /ngo/signup is deliberate rather than the site root: that route
          // mounts NgoOrganizationRegistrationForm, whose effect finishes the
          // registration. Landing there IS the last step of signing up.
          //
          // window.location.origin so preview deploys confirm back to
          // themselves instead of production.
          emailRedirectTo,
        },
      });
      // Email-enumeration protection: an existing account still returns 200
      // with a user object whose identities array is empty, and no mail is
      // sent. Treat that as "already registered" so the form does not claim
      // we just emailed them.
      const alreadyRegistered = Boolean(data?.user) && (data.user?.identities?.length ?? 0) === 0;

      // Repeating signup for an unconfirmed address does not send mail again.
      // confirmation_sent_at is fresh only when THIS call actually queued one.
      // Anything older (or missing) is a retry — resend so they are not stuck
      // on "check your email" with an empty inbox.
      //
      // Skip when identities is empty: that is a confirmed account (email
      // enumeration fake). resend({ type: 'signup' }) then returns 200 and
      // sends nothing.
      if (!error && !data.session && !alreadyRegistered) {
        const sentAt = data.user?.confirmation_sent_at;
        const justSent =
          typeof sentAt === 'string' && Date.now() - Date.parse(sentAt) < 20_000;
        if (!justSent) {
          await supabase.auth.resend({
            type: 'signup',
            email: email.trim(),
            options: { emailRedirectTo },
          });
        }
      }

      return { error: error?.message ?? null, alreadyRegistered };
    },
    [],
  );

  const resendSignupEmail = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/ngo/signup` },
    });
    return { error: error?.message ?? null };
  }, []);

  // The reset email goes out through the auth-send-email hook (Resend), like
  // the signup confirmation. Supabase answers the same whether or not the
  // address has an account, so the caller must not claim either way.
  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}${RESET_PASSWORD_PATH}`,
    });
    return { error: error?.message ?? null };
  }, []);

  // Works for a recovery session (from the reset link) and for a user who is
  // simply signed in and wants a new password.
  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setProfileError(null);
  }, []);

  const isStaff = profile?.is_staff ?? false;
  const isAuthenticated = Boolean(user);
  const refetchProfile = useCallback(async () => {
    await loadProfile(user?.id);
  }, [loadProfile, user?.id]);

  const value = useMemo(
    () => ({
      user,
      session,
      isAuthenticated,
      profile,
      isStaff,
      loading,
      profileLoading,
      profileError,
      refetchProfile,
      signIn,
      signInAsStaff,
      signUp,
      resendSignupEmail,
      requestPasswordReset,
      updatePassword,
      signOut,
    }),
    [
      user, session, isAuthenticated, profile, isStaff,
      loading, profileLoading, profileError, refetchProfile, signIn, signInAsStaff, signUp,
      resendSignupEmail, requestPasswordReset, updatePassword, signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
