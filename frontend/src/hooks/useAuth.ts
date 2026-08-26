// src/hooks/useAuth.ts
import { useState, useEffect, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, DBProfile } from '../lib/supabase';

interface AuthState {
  user: User | null;
  profile: DBProfile | null;
  session: Session | null;
  loading: boolean;
  /** True while the profile row is still being fetched for a known session.
      Distinguishes "we do not know your role yet" from "you are not an admin". */
  profileLoading: boolean;
  /** Set when the profile could not be loaded after retries. Lets the UI say
      "we could not read your account" instead of "access denied". */
  profileError: string | null;
}

interface RegisterData {
  email: string;
  password: string;
  username: string;
  captchaToken?: string;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    session: null,
    loading: true,
    profileLoading: false,
    profileError: null,
  });

  // A failed profile fetch used to be swallowed: `if (!error && data)` with no
  // else. profile stayed null, and a null profile renders byte-identically to
  // a genuine demotion -- the Admin tab disappears (App.tsx) and the dashboard
  // shows Access Denied (AdminDashboard.tsx). Under event load a transient 401
  // during token refresh, a 503 while PostgREST reloads its schema cache after
  // a deploy, or one dropped request is enough. An organiser then cannot tell
  // "the network blipped" from "somebody took my admin away".
  //
  // So: retry a few times with backoff, and record the failure so the UI can
  // say which of the two happened.
  const fetchProfile = useCallback(async (userId: string) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, country, bio, role, is_banned, is_hidden, team_id, affiliation, website, created_at')
        .eq('id', userId)
        .single();

      if (!error && data) {
        const profile = {
          ...data,
          is_admin: data.role === 'admin',
          is_moderator: data.role === 'moderator',
        } as DBProfile;
        setState(prev => ({ ...prev, profile, profileError: null, profileLoading: false }));
        return;
      }

      // PGRST116 is "no rows": the profile genuinely is not there, which
      // retrying cannot fix. Anything else is worth another go.
      if ((error as any)?.code === 'PGRST116') break;
      if (attempt < 2) await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
    }

    setState(prev => ({
      ...prev,
      profileError: 'Could not load your profile. Check your connection and reload.',
      profileLoading: false,
    }));
  }, []);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      // loading stays true until the profile resolves. Previously it flipped
      // here while fetchProfile was still in flight, so every visit to the
      // Admin tab passed through a guaranteed loading===false && profile===null
      // window and flashed Access Denied even when nothing was wrong.
      setState(prev => ({
        ...prev,
        session,
        user: session?.user ?? null,
        loading: false,
        profileLoading: !!session?.user,
      }));
      if (session?.user) fetchProfile(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setState(prev => ({
        ...prev,
        session,
        user: session?.user ?? null,
        profileLoading: !!session?.user && !prev.profile,
      }));
      if (session?.user) fetchProfile(session.user.id);
      else setState(prev => ({ ...prev, profile: null, profileError: null, profileLoading: false }));
    });

    return () => { cancelled = true; subscription.unsubscribe(); };
  }, [fetchProfile]);

  const register = async ({ email, password, username, captchaToken }: RegisterData) => {
    // Username validation
    if (!/^[a-zA-Z0-9_\-]+$/.test(username)) {
      return { error: 'Username can only contain letters, numbers, underscores, and hyphens' };
    }
    if (username.length < 3 || username.length > 30) {
      return { error: 'Username must be between 3 and 30 characters' };
    }

    // No client-side uniqueness check: profiles_select restricts SELECT to
    // your own row, so an unauthenticated caller always reads back nothing and
    // the check silently passes. handle_new_user resolves collisions instead.

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username },
        ...(captchaToken ? { captchaToken } : {}),
      }
    });

    if (error) return { error: error.message };
    return { data };
  };

  const login = async (email: string, password: string, captchaToken?: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: {
        ...(captchaToken ? { captchaToken } : {}),
      }
    });
    if (error) return { error: error.message };
    return { data };
  };

  const loginWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) return { error: error.message };
    return { data: true };
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  // HARDENED: Only safe fields can be updated. RLS also enforces this.
  const updateProfile = async (updates: Partial<Pick<DBProfile, 'username' | 'bio' | 'country' | 'avatar_url' | 'affiliation' | 'website'>>) => {
    if (!state.user) return { error: 'Not logged in' };

    // Explicitly strip any dangerous fields that shouldn't be here
    const safeUpdates: Record<string, any> = {};
    const allowedKeys = ['username', 'bio', 'country', 'avatar_url', 'affiliation', 'website'];
    for (const key of allowedKeys) {
      if (key in updates) safeUpdates[key] = (updates as any)[key];
    }

    const { error } = await supabase
      .from('profiles')
      .update(safeUpdates)
      .eq('id', state.user.id);

    if (error) return { error: error.message };
    await fetchProfile(state.user.id);
    return { success: true };
  };

  return {
    ...state,
    register,
    login,
    loginWithGoogle,
    logout,
    updateProfile,
    isAdmin: state.profile?.role === 'admin',
  };
}