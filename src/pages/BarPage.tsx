
import React, { useEffect } from 'react';
import ChateauBackground from '@/components/ChateauBackground';
import { BarOrderSystem } from '@/components/bar/BarOrderSystem';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { LogOut, RefreshCw } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { NfcDebugger } from '@/components/NfcDebugger';
import { useNavigate } from 'react-router-dom';
import { getBarProducts } from '@/lib/supabase';

const BarPage: React.FC = () => {
  const { signOut, email, isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = React.useState(false);
  
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
      
      // Keep this toast as it's related to a critical action (logout)
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
  
  // Fonction pour rafraîchir manuellement les produits
  const handleRefreshProducts = async () => {
    try {
      setRefreshing(true);
      
      // Forcer une nouvelle récupération des produits
      await getBarProducts(true);
      
      toast({
        title: "Produits actualisés",
        description: "La liste des produits a été mise à jour avec succès"
      });
    } catch (error) {
      console.error('Erreur lors de l\'actualisation des produits:', error);
      toast({
        title: "Erreur",
        description: "Une erreur est survenue lors de l'actualisation des produits",
        variant: "destructive"
      });
    } finally {
      setRefreshing(false);
    }
  };
  
  return (
    <ChateauBackground className="min-h-screen">
      <div className="w-full h-full p-0">
        <div className="absolute top-2 right-2 z-10 flex items-center space-x-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleRefreshProducts}
            disabled={refreshing}
            className="bg-white/20 text-white hover:bg-white/40 border-white"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Actualisation...' : 'Actualiser'}
          </Button>
          
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
