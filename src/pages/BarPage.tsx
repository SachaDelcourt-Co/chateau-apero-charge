
import React, { useEffect, useState } from 'react';
import ChateauBackground from '@/components/ChateauBackground';
import { BarOrderSystem } from '@/components/bar/BarOrderSystem';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { LogOut, RefreshCw, Store } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { NfcDebugger } from '@/components/NfcDebugger';
import { useNavigate } from 'react-router-dom';
import { getBarProducts } from '@/lib/supabase';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';

const BarPage: React.FC = () => {
  const { signOut, email, isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);
  const [pointOfSale, setPointOfSale] = useState("1");
  
  // Check if we're in development mode
  const isDevelopment = import.meta.env.MODE === 'development';
  
  // Effect to redirect to login if not logged in
  useEffect(() => {
    if (!isLoggedIn) {
      navigate('/login');
    }
  }, [isLoggedIn, navigate]);
  
  // Get point of sale from localStorage or use default
  useEffect(() => {
    const savedPos = localStorage.getItem('pointOfSale');
    if (savedPos) {
      setPointOfSale(savedPos);
    }
  }, []);
  
  // Save point of sale to localStorage when it changes
  const handlePosChange = (value: string) => {
    setPointOfSale(value);
    localStorage.setItem('pointOfSale', value);
    
    toast({
      title: "Point de vente modifié",
      description: `Vous utilisez maintenant le point de vente ${value}`
    });
  };
  
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
  
  // Function to manually refresh products
  const handleRefreshProducts = async () => {
    try {
      setRefreshing(true);
      
      // Force a new product fetch
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
          <div className="flex bg-white/20 text-white rounded border border-white p-1 items-center space-x-1 mr-2">
            <Store className="h-4 w-4" />
            <Select value={pointOfSale} onValueChange={handlePosChange}>
              <SelectTrigger className="bg-transparent border-none shadow-none p-1 w-12 h-7">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(pos => (
                  <SelectItem key={pos} value={pos.toString()}>
                    {pos}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
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
        
        <BarOrderSystem pointOfSale={parseInt(pointOfSale)} />
        
        {/* Show NFC debugger only in development mode */}
        {isDevelopment && <NfcDebugger />}
      </div>
    </ChateauBackground>
  );
};

export default BarPage;
