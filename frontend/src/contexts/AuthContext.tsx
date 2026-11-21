import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import type { UserProfile, UserRole } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  role: UserRole | null;
  session: Session | null;
  isLoading: boolean;
  isProfileLoading: boolean;
  profileError: string | null;
  authError: string | null;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearErrors: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const VALID_ROLES: UserRole[] = ['admin', 'faculty', 'student'];

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isProfileLoading, setIsProfileLoading] = useState<boolean>(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const fetchProfile = async (userId: string, userEmail?: string) => {
    if (!isSupabaseConfigured) {
      setProfile(null);
      setRole(null);
      return;
    }

    setIsProfileLoading(true);
    setProfileError(null);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, avatar_url, created_at, updated_at')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No row found for this user in public.profiles
          setProfile(null);
          setRole(null);
          setProfileError(
            `No profile record was found for account (${userEmail || userId}). An administrator must provision your academic role before you can access the system.`
          );
        } else {
          setProfile(null);
          setRole(null);
          setProfileError(`Failed to retrieve profile: ${error.message}`);
        }
        return;
      }

      if (!data) {
        setProfile(null);
        setRole(null);
        setProfileError('Profile data is empty. Please contact the administrator.');
        return;
      }

      // Explicit role validation - NEVER silently default
      if (!VALID_ROLES.includes(data.role as UserRole)) {
        setProfile(null);
        setRole(null);
        setProfileError(
          `Invalid system role "${data.role}" assigned to your profile. Permitted roles are: admin, faculty, student.`
        );
        return;
      }

      setProfile(data as UserProfile);
      setRole(data.role as UserRole);
      setProfileError(null);
    } catch (err) {
      setProfile(null);
      setRole(null);
      setProfileError(
        err instanceof Error ? err.message : 'An unexpected error occurred while resolving your profile.'
      );
    } finally {
      setIsProfileLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      if (!isSupabaseConfigured) {
        if (mounted) {
          setIsLoading(false);
        }
        return;
      }

      try {
        const { data: { session: initialSession }, error } = await supabase.auth.getSession();
        if (error) {
          throw error;
        }

        if (mounted) {
          setSession(initialSession);
          setUser(initialSession?.user ?? null);
          if (initialSession?.user) {
            await fetchProfile(initialSession.user.id, initialSession.user.email);
          }
        }
      } catch (err) {
        if (mounted) {
          setAuthError(err instanceof Error ? err.message : 'Failed to initialize session.');
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    initializeAuth();

    // Listen to Supabase Auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!mounted) return;

        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (event === 'SIGNED_OUT') {
          setProfile(null);
          setRole(null);
          setProfileError(null);
          setAuthError(null);
          setIsProfileLoading(false);
        } else if (newSession?.user) {
          await fetchProfile(newSession.user.id, newSession.user.email);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string): Promise<{ error: Error | null }> => {
    setAuthError(null);

    if (!isSupabaseConfigured) {
      const err = new Error(
        'Supabase is not configured. Please supply VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.'
      );
      setAuthError(err.message);
      return { error: err };
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setAuthError(error.message);
        return { error };
      }

      if (data.user) {
        setUser(data.user);
        setSession(data.session);
        await fetchProfile(data.user.id, data.user.email);
      }

      return { error: null };
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error('An unexpected login error occurred.');
      setAuthError(errorObj.message);
      return { error: errorObj };
    }
  };

  const signOut = async (): Promise<void> => {
    try {
      if (isSupabaseConfigured) {
        await supabase.auth.signOut();
      }
    } finally {
      setUser(null);
      setSession(null);
      setProfile(null);
      setRole(null);
      setProfileError(null);
      setAuthError(null);
    }
  };

  const refreshProfile = async (): Promise<void> => {
    if (user) {
      await fetchProfile(user.id, user.email);
    }
  };

  const clearErrors = (): void => {
    setAuthError(null);
    setProfileError(null);
  };

  const value: AuthContextType = {
    user,
    profile,
    role,
    session,
    isLoading,
    isProfileLoading,
    profileError,
    authError,
    signIn,
    signOut,
    refreshProfile,
    clearErrors,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
