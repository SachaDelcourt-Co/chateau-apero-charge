
import React, { useEffect } from 'react';
import ChateauBackground from '@/components/ChateauBackground';
import { BarOrderSystem } from '@/components/bar/BarOrderSystem';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { NfcDebugger } from '@/components/NfcDebugger';
import { useNavigate } from 'react-router-dom';

const BarPage: React.FC = () => {
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
    <ChateauBackground className="min-h-screen">
      <div className="w-full h-full">
        <div className="absolute top-2 right-2 z-10">
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleLogout} 
            className="bg-white/20 text-white hover:bg-white/40 border-white"
          >
            <LogOut className="h-4 w-4 mr-1" />
            Déconnexion
          </Button>
        </div>
        
        <BarOrderSystem />
        
        {/* Show NFC debugger only in development mode */}
        {isDevelopment && <NfcDebugger />}
      </div>
    </ChateauBackground>
  );
};

export default BarPage;
