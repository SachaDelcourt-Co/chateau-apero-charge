
import { useState, useEffect, createContext, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Session, User } from '@supabase/supabase-js';

type Role = 'admin' | 'bar' | 'recharge';

interface AuthState {
  user: User | null;
  session: Session | null;
  role: Role | null;
  isLoading: boolean;
  email: string | null;
}

interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  signOut: () => Promise<void>;
  hasAccess: (requiredRoles: Role[]) => boolean;
  createUser: (email: string, password: string, role: Role) => Promise<{ success: boolean; message?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    role: null,
    isLoading: true,
    email: null,
  });
  const navigate = useNavigate();

  useEffect(() => {
    // Set up the auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setAuthState(prev => ({ ...prev, session, user: session?.user || null }));
        
        if (session?.user) {
          // Get the user's role and email from profiles
          setTimeout(async () => {
            const { data: profile } = await supabase
              .from('profiles')
              .select('role, email')
              .eq('id', session.user.id)
              .single();
              
            setAuthState(prev => ({ 
              ...prev, 
              role: profile?.role as Role || null,
              email: profile?.email || session.user.email || null,
              isLoading: false
            }));
          }, 0);
        } else {
          setAuthState(prev => ({ ...prev, role: null, email: null, isLoading: false }));
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthState(prev => ({ ...prev, session, user: session?.user || null }));
      
      if (session?.user) {
        // Get the user's role and email from profiles
        supabase
          .from('profiles')
          .select('role, email')
          .eq('id', session.user.id)
          .single()
          .then(({ data: profile }) => {
            setAuthState(prev => ({ 
              ...prev, 
              role: profile?.role as Role || null,
              email: profile?.email || session.user.email || null,
              isLoading: false
            }));
          });
      } else {
        setAuthState(prev => ({ ...prev, isLoading: false }));
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      
      if (error) {
        return { success: false, message: error.message };
      }
      
      if (data?.user) {
        // Get the user's role
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role, email')
          .eq('id', data.user.id)
          .single();
          
        if (profileError) {
          await supabase.auth.signOut();
          return { success: false, message: 'Erreur lors de la récupération du profil utilisateur' };
        }
        
        return { success: true };
      }
      
      return { success: false, message: 'Une erreur est survenue lors de la connexion' };
    } catch (error: any) {
      return { success: false, message: error.message || 'Une erreur est survenue' };
    }
  };

  const createUser = async (email: string, password: string, role: Role) => {
    try {
      // Only admin can create users
      if (authState.role !== 'admin') {
        return { success: false, message: "Vous n'avez pas les droits pour créer des utilisateurs" };
      }

      // Create the user
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (error) {
        return { success: false, message: error.message };
      }

      if (data?.user) {
        // Update the user's role in the profiles table
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ role, email })
          .eq('id', data.user.id);

        if (updateError) {
          return { success: false, message: `Utilisateur créé mais erreur lors de la mise à jour du rôle: ${updateError.message}` };
        }

        return { success: true };
      }

      return { success: false, message: 'Une erreur est survenue lors de la création de l\'utilisateur' };
    } catch (error: any) {
      return { success: false, message: error.message || 'Une erreur est survenue' };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const hasAccess = (requiredRoles: Role[]) => {
    if (!authState.role) return false;
    
    // Admin has access to everything
    if (authState.role === 'admin') return true;
    
    // Check if the user's role is in the required roles
    return requiredRoles.includes(authState.role);
  };

  return (
    <AuthContext.Provider
      value={{
        ...authState,
        signIn,
        signOut,
        hasAccess,
        createUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
