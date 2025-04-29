
import { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';

type AuthContextType = {
  user: any | null;
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  signOut: () => Promise<void>;
  hasAccess: (requiredRoles: string[]) => boolean;
  role: string | null;
  email: string | null;
  createUser: (email: string, password: string, role: string) => Promise<{ success: boolean; message?: string }>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setUser(session?.user ?? null);
      setEmail(session?.user?.email ?? null);
      setIsLoading(false);
    };

    getSession();

    supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setEmail(session?.user?.email ?? null);
      setIsLoading(false);
      
      if (session?.user) {
        // Get the user's role from profiles
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .single();
            
          if (error) {
            console.error('Error fetching user role:', error);
            setRole(null);
          } else {
            setRole(data?.role || null);
          }
        } catch (error) {
          console.error('Exception when fetching user role:', error);
          setRole(null);
        }
      } else {
        setRole(null);
      }
    });
  }, []);

  const signIn = async (email: string, password: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Login error:', error.message);
        return { success: false, message: error.message };
      }

      setSession(data.session);
      setUser(data.user);
      setEmail(email);

      // Fetch user role after sign-in
      if (data.user) {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .single();

        if (profileError) {
          console.error('Error fetching user role:', profileError);
          setRole(null);
        } else {
          setRole(profileData?.role || null);
        }
      }

      return { success: true };
    } catch (error: any) {
      console.error('Login failed:', error.message);
      return { success: false, message: error.message };
    }
  };

  const signOut = async (): Promise<void> => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
      setRole(null);
      setEmail(null);
    } catch (error: any) {
      console.error('Logout failed:', error.message);
    }
  };

  const createUser = async (email: string, password: string, userRole: string): Promise<{ success: boolean; message?: string }> => {
    try {
      // 1. Create the user in auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });

      if (authError) {
        console.error('Error creating user:', authError);
        return { success: false, message: authError.message };
      }

      // 2. Update the user's role in profiles
      if (authData.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ role: userRole })
          .eq('id', authData.user.id);

        if (profileError) {
          console.error('Error updating user role:', profileError);
          return { success: false, message: 'User created but role could not be set: ' + profileError.message };
        }
      }

      return { success: true };
    } catch (error: any) {
      console.error('Error in createUser:', error);
      return { success: false, message: error.message || 'An error occurred while creating the user' };
    }
  };

  const hasAccess = (requiredRoles: string[]): boolean => {
    if (!role) return false;
    return requiredRoles.includes(role);
  };

  const value: AuthContextType = {
    user,
    session,
    isLoading,
    signIn,
    signOut,
    hasAccess,
    role,
    email,
    createUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
