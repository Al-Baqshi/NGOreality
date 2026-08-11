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
   * Default sign-in for NGO users: central Baqshi auth.
   *
   * Accepts a username or an email — the central service takes either, and NGO
   * users were invited by email, so that is what they will type.
   */
  const signIn = useCallback(async (usernameOrEmail: string, password: string) => {
    try {
      await centralSignIn(usernameOrEmail, password);
      return { error: null };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : 'Could not sign in. Please try again.',
      };
    }
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
        options: { data: { full_name: fullName, ...extraMetadata } },
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
