// src/hooks/useAuth.ts
import { useState, useEffect, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, DBProfile } from '../lib/supabase';

interface AuthState {
  user: User | null;
  profile: DBProfile | null;
  session: Session | null;
  loading: boolean;
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
  });

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, country, bio, role, is_banned, is_hidden, team_id, affiliation, website, created_at')
      .eq('id', userId)
      .single();
    if (!error && data) {
      // Map role to is_admin/is_moderator for backward compatibility with UI
      const profile = {
        ...data,
        is_admin: data.role === 'admin',
        is_moderator: data.role === 'moderator',
      } as DBProfile;
      setState(prev => ({ ...prev, profile }));
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState(prev => ({ ...prev, session, user: session?.user ?? null, loading: false }));
      if (session?.user) fetchProfile(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(prev => ({ ...prev, session, user: session?.user ?? null }));
      if (session?.user) fetchProfile(session.user.id);
      else setState(prev => ({ ...prev, profile: null }));
    });

    return () => subscription.unsubscribe();
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