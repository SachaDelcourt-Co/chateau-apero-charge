
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';

type Role = 'admin' | 'bar' | 'recharge';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles: Role[];
}

const ProtectedRoute = ({ children, requiredRoles }: ProtectedRouteProps) => {
  const { user, isLoading, hasAccess, role } = useAuth();

  if (isLoading) {
    // Afficher un écran de chargement pendant que l'authentification est vérifiée
    return (
      <div className="min-h-screen flex items-center justify-center bg-chateau-gradient">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-white"></div>
      </div>
    );
  }

  if (!user) {
    // Rediriger vers la page de connexion si l'utilisateur n'est pas connecté
    return <Navigate to="/login" replace />;
  }

  if (!hasAccess(requiredRoles)) {
    console.log(`Accès refusé: utilisateur avec rôle ${role} essaie d'accéder à une page nécessitant les rôles:`, requiredRoles);
    // Rediriger vers une page d'erreur si l'utilisateur n'a pas le rôle requis
    return <Navigate to="/unauthorized" replace />;
  }

  // Si l'utilisateur est authentifié et a le rôle requis, afficher le contenu
  console.log(`Accès autorisé: utilisateur avec rôle ${role} accède à la page`);
  return <>{children}</>;
};

export default ProtectedRoute;
