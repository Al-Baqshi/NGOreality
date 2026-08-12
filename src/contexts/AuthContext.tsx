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
import {
  centralSignIn,
  centralSignOut,
  onCentralAuthChange,
  restoreCentralSession,
  type CentralUser,
} from '../lib/baqshiAuth';

/**
 * Two issuers, deliberately.
 *
 * NGO users (clients) sign in through the central Baqshi identity service;
 * staff and the super admin stay on Supabase. The CRM API trusts both, so a
 * central token opens the workspace. `signInAsStaff` is untouched.
 *
 * Note what a central-only session does NOT get: the portal screens that read
 * Supabase directly (badges, trust standards, memberships) are gated by RLS on
 * auth.uid(), which is null without a Supabase session. Those move behind the
 * Go API in a later step; until then a central user reaches their workspace,
 * not the whole portal.
 */

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  /** Set when signed in through the central Baqshi service. */
  centralUser: CentralUser | null;
  /** Signed in through EITHER issuer. Guards should use this, not `user`. */
  isAuthenticated: boolean;
  profile: UserProfile | null;
  isStaff: boolean;
  loading: boolean;
  profileLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signInAsStaff: (username: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    extraMetadata?: Record<string, unknown>,
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeStaffLogin(username: string): string {
  return username.trim();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [centralUser, setCentralUser] = useState<CentralUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    const next = await fetchUserProfile(userId);
    setProfile(next);
    setProfileLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Restore both issuers before dropping the loading flag. Resolving only
    // Supabase first would flash the login screen at a signed-in central user
    // and bounce them out of a deep link.
    void (async () => {
      const [{ data }, central] = await Promise.all([
        supabase.auth.getSession(),
        restoreCentralSession(),
      ]);
      if (cancelled) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setCentralUser(central);
      setLoading(false);
      void loadProfile(data.session?.user?.id);
    })();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
      void loadProfile(nextSession?.user?.id);
    });

    // The client refreshes and clears sessions on its own (rotation, revoked
    // families); mirror that into React rather than polling.
    const offCentral = onCentralAuthChange(setCentralUser);

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
      offCentral();
    };
  }, [loadProfile]);

  /**
   * Default sign-in for NGO users: central Baqshi auth, falling back to
   * Supabase.
   *
   * Accepts a username or an email — the central service takes either, and NGO
   * users were invited by email, so that is what they will type.
   *
   * WHY THE FALLBACK EXISTS. Sign-in moved to central while /ngo/signup still
   * creates a SUPABASE account. Without this, anyone who signed up could not
   * sign back in once their first session expired: the form asked a service
   * they did not exist in, and "Forgot password?" sent them somewhere they had
   * no account either. A dead end for every new user.
   *
   * This is not a workaround bolted on — the API already verifies both issuers
   * (auth/central.go), so a login form that accepts both is the consistent
   * shape for as long as two issuers exist. It goes away when signup moves to
   * central and Supabase Auth is retired.
   *
   * Central is tried first because it is where users are going, not where they
   * came from. Both services answer a bad credential identically, so trying
   * two does not reveal which one holds an account.
   */
  const signIn = useCallback(async (usernameOrEmail: string, password: string) => {
    let centralError: string | null = null;
    try {
      await centralSignIn(usernameOrEmail, password);
      return { error: null };
    } catch (err) {
      centralError = err instanceof Error ? err.message : 'Could not sign in.';
    }

    // Supabase only understands an email address, so a username that failed
    // centrally cannot succeed here — do not waste a round trip or a rate-limit
    // slot on it.
    if (!usernameOrEmail.includes('@')) {
      return { error: centralError };
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: usernameOrEmail.trim(),
      password,
    });
    if (!error) return { error: null };

    // Report the central failure: that is the system the user should be in,
    // and the Supabase message would name a service they have never heard of.
    return { error: centralError };
  }, []);

  const signInAsStaff = useCallback(
    async (username: string, password: string) => {
      const email = normalizeStaffLogin(username);
      if (!email.includes('@')) {
        return { error: 'Enter your staff email address as your username.' };
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };

      const staffProfile = await fetchUserProfile(data.user.id);
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
      const { error } = await supabase.auth.signUp({
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
          emailRedirectTo: `${window.location.origin}/ngo/signup`,
        },
      });
      return { error: error?.message ?? null };
    },
    [],
  );

  // Sign out of BOTH issuers. A user who has been on each at different times
  // must not be left half signed-in, still holding a usable refresh token.
  const signOut = useCallback(async () => {
    await Promise.allSettled([supabase.auth.signOut(), centralSignOut()]);
    setProfile(null);
    setCentralUser(null);
  }, []);

  const isStaff = profile?.is_staff ?? false;
  const isAuthenticated = Boolean(user || centralUser);

  const value = useMemo(
    () => ({
      user,
      session,
      centralUser,
      isAuthenticated,
      profile,
      isStaff,
      loading,
      profileLoading,
      signIn,
      signInAsStaff,
      signUp,
      signOut,
    }),
    [
      user, session, centralUser, isAuthenticated, profile, isStaff,
      loading, profileLoading, signIn, signInAsStaff, signUp, signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
