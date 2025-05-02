
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import ChateauLogo from '@/components/ChateauLogo';
import CardTopup from '@/components/admin/CardTopup';
import { Home, LogOut } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { NfcDebugger } from '@/components/NfcDebugger';
import { NfcTest } from '@/components/NfcTest';

const RechargePage: React.FC = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { signOut, email, isLoggedIn } = useAuth();
  const { toast } = useToast();
  
  // Check if we're in development mode
  const isDevelopment = import.meta.env.MODE === 'development';

  // Effect to redirect to login if not logged in
  useEffect(() => {
    if (!isLoggedIn) {
      navigate('/login');
    }
  }, [isLoggedIn, navigate]);

  const handleLogout = async () => {
    try {
      await signOut();
      
      toast({
        title: "Déconnexion réussie",
        description: "Vous avez été déconnecté avec succès"
      });
      
      // Force navigation to login page after successful logout
      navigate('/login');
    } catch (error) {
      console.error('Error during logout:', error);
      toast({
        title: "Erreur",
        description: "Une erreur est survenue lors de la déconnexion",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full max-w-6xl mx-auto p-2 sm:p-4">
        <div className="flex justify-between items-center mb-4 sm:mb-6">
          <div className={`flex items-center ${isMobile ? 'space-x-2' : 'space-x-4'}`}>
            <div className={isMobile ? "scale-75 origin-left" : ""}>
              <ChateauLogo />
            </div>
            {email && !isMobile && (
              <div className="text-sm text-gray-600">
                {email}
              </div>
            )}
          </div>
          <div className="flex space-x-2">
            <Button 
              variant="outline" 
              size={isMobile ? "sm" : "default"}
              onClick={() => navigate("/")}
            >
              <Home className="h-4 w-4 mr-1 sm:mr-2" />
              {isMobile ? "" : "Accueil"}
            </Button>
            <Button 
              variant="destructive" 
              size={isMobile ? "sm" : "default"}
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4 mr-1 sm:mr-2" />
              {isMobile ? "" : "Déconnexion"}
            </Button>
          </div>
        </div>
        
        {/* Add test NFC component in development mode */}
        {isDevelopment && <NfcTest />}
        
        <div className="bg-white p-3 sm:p-6 rounded-lg shadow-xl">
          <h1 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-center">
            Recharge de Carte
          </h1>
          
          <div className="mt-2 sm:mt-4">
            <CardTopup />
          </div>
        </div>
        
        {/* Show NFC debugger only in development mode */}
        {isDevelopment && <NfcDebugger />}
      </div>
    </div>
  );
};

export default RechargePage;
