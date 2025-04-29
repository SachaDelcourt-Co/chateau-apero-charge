import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from 'react-router-dom';

interface AuthContextType {
  user: any;
  email: string | null;
  role: string | null;
  isLoading: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const session = async () => {
      const { data: { session }, error } = await supabase.auth.getSession()

      if (error) {
        console.error('Error getting session:', error);
        setIsLoading(false);
        return;
      }

      if (session) {
        setUser(session.user);
        setEmail(session.user.email);
        fetchUserProfile(session.user.id);
      } else {
        setIsLoading(false);
      }

      supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session) {
          setUser(session.user);
          setEmail(session.user.email);
          fetchUserProfile(session.user.id);
        } else {
          setUser(null);
          setEmail(null);
          setRole(null);
          setIsLoading(false);
        }
      });
    };

    session();
  }, []);

  const fetchUserProfile = async (userId: string) => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching profile:', error);
        setRole(null);
      } else {
        setRole(profile?.role || null);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      setRole(null);
    } finally {
      setIsLoading(false);
    }
  };

  const signUp = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
      });

      if (error) throw error;

      // After successful signup, navigate to a different page or show a success message
      navigate('/login');
    } catch (error) {
      console.error('Error signing up:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [navigate]);

  const signIn = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (error) throw error;

      setUser(data.user);
      setEmail(data.user?.email || null);
      await fetchUserProfile(data.user?.id || '');
      
      // No navigation here; the useEffect on auth state changes will handle updates
    } catch (error) {
      console.error('Error signing in:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut();
      
      if (error) throw error;
      
      // Update local state after successful sign-out
      setUser(null);
      setEmail(null);
      setRole(null);
      setIsLoading(false);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  }, []);

  const value = {
    user,
    email,
    role,
    isLoading,
    signUp,
    signIn,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
