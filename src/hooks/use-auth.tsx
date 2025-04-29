
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from 'react-router-dom';

type Role = 'admin' | 'bar' | 'recharge';

interface AuthContextType {
  user: any;
  email: string | null;
  role: string | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  signUp: (email: string, password: string) => Promise<{ success: boolean, message: string }>;
  signIn: (email: string, password: string) => Promise<{ success: boolean, message: string }>;
  signOut: () => Promise<void>;
  hasAccess: (requiredRoles: Role[]) => boolean;
  createUser: (email: string, password: string, role: Role) => Promise<{ success: boolean, message: string }>;
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
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const session = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        console.error('Error getting session:', error);
        setIsLoading(false);
        return;
      }

      if (session) {
        setUser(session.user);
        setEmail(session.user.email);
        setIsLoggedIn(true);
        fetchUserProfile(session.user.id);
      } else {
        setIsLoading(false);
      }

      supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session) {
          setUser(session.user);
          setEmail(session.user.email);
          setIsLoggedIn(true);
          fetchUserProfile(session.user.id);
        } else {
          setUser(null);
          setEmail(null);
          setRole(null);
          setIsLoggedIn(false);
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
      return { success: true, message: "Inscription réussie" };
    } catch (error: any) {
      console.error('Error signing up:', error);
      return { success: false, message: error.message || "Erreur lors de l'inscription" };
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
      setIsLoggedIn(true);
      await fetchUserProfile(data.user?.id || '');
      
      return { success: true, message: "Connexion réussie" };
    } catch (error: any) {
      console.error('Error signing in:', error);
      return { success: false, message: error.message || "Erreur lors de la connexion" };
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
      setIsLoggedIn(false);
      setIsLoading(false);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  }, []);

  const hasAccess = useCallback((requiredRoles: Role[]) => {
    if (!role) return false;
    return requiredRoles.includes(role as Role);
  }, [role]);

  const createUser = useCallback(async (email: string, password: string, userRole: Role) => {
    try {
      // Create new user with supabase admin
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { role: userRole }
      });

      if (error) throw error;

      // Update the profile with the correct role
      if (data.user) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ role: userRole })
          .eq('id', data.user.id);

        if (updateError) throw updateError;
      }

      return { success: true, message: `Utilisateur ${email} créé avec le rôle ${userRole}` };
    } catch (error: any) {
      console.error('Error creating user:', error);
      return { success: false, message: error.message || "Erreur lors de la création de l'utilisateur" };
    }
  }, []);

  const value = {
    user,
    email,
    role,
    isLoading,
    isLoggedIn,
    signUp,
    signIn,
    signOut,
    hasAccess,
    createUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
