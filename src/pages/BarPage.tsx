
import React, { useEffect } from 'react';
import ChateauBackground from '@/components/ChateauBackground';
import { BarOrderSystem } from '@/components/bar/BarOrderSystem';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { NfcDebugger } from '@/components/NfcDebugger';
import { useNavigate } from 'react-router-dom';

const BarPage: React.FC = () => {
  const isMobile = useIsMobile();
  const { signOut, email, isLoggedIn } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
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
    <ChateauBackground className="p-2 md:p-4 min-h-screen">
      <div className="container mx-auto max-w-6xl">
        <div className="flex justify-between items-center mb-3">
          <h1 className={`text-2xl ${isMobile ? "" : "md:text-3xl"} font-dancing text-white`}>
            Les apéros du château
          </h1>
          <div className="flex items-center space-x-2">
            {email && (
              <div className="text-sm text-white mr-2 hidden sm:block">
                {email}
              </div>
            )}
            <Button 
              variant="outline" 
              size={isMobile ? "sm" : "default"} 
              onClick={handleLogout} 
              className="bg-white/20 text-white hover:bg-white/40 border-white"
            >
              <LogOut className="h-4 w-4 mr-1" />
              {isMobile ? "" : "Déconnexion"}
            </Button>
          </div>
        </div>
        <h2 className="text-lg md:text-xl text-white text-center mb-2">
          Système de Bar
        </h2>
        
        <BarOrderSystem />
        
        {/* Show NFC debugger only in development mode */}
        {isDevelopment && <NfcDebugger />}
      </div>
    </ChateauBackground>
  );
};

export default BarPage;
