
import React, { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';

type Role = 'admin' | 'bar' | 'recharge';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles: Role[];
}

const ProtectedRoute = ({ children, requiredRoles }: ProtectedRouteProps) => {
  const { user, isLoading, hasAccess, role, isLoggedIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      navigate('/login');
    }
  }, [isLoggedIn, isLoading, navigate]);

  if (isLoading) {
    // Loading screen while authentication is being verified
    return (
      <div className="min-h-screen flex items-center justify-center bg-chateau-gradient">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-white"></div>
      </div>
    );
  }

  if (!user) {
    // Redirect to login page if user is not logged in
    return <Navigate to="/login" replace />;
  }

  if (!hasAccess(requiredRoles)) {
    console.log(`Accès refusé: utilisateur avec rôle ${role} essaie d'accéder à une page nécessitant les rôles:`, requiredRoles);
    // Redirect to error page if user doesn't have required role
    return <Navigate to="/unauthorized" replace />;
  }

  // User is authenticated and has required role, show content
  console.log(`Accès autorisé: utilisateur avec rôle ${role} accède à la page`);
  return <>{children}</>;
};

export default ProtectedRoute;
