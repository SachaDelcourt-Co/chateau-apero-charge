
import React from 'react';
import ChateauBackground from '@/components/ChateauBackground';
import { BarOrderSystem } from '@/components/bar/BarOrderSystem';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const BarPage: React.FC = () => {
  const isMobile = useIsMobile();
  const { signOut, email } = useAuth();
  const { toast } = useToast();
  
  const handleLogout = async () => {
    try {
      await signOut();
      
      toast({
        title: "Déconnexion réussie",
        description: "Vous avez été déconnecté avec succès"
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Une erreur est survenue lors de la déconnexion",
        variant: "destructive"
      });
    }
  };
  
  return (
    <ChateauBackground className="p-2 md:p-4 min-h-screen">
      <div className="container mx-auto max-w-5xl">
        <div className="flex justify-between items-center mb-4">
          <h1 className={`text-2xl ${isMobile ? "" : "md:text-4xl"} font-dancing text-white`}>
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
        <h2 className="text-lg md:text-2xl text-white text-center mb-3 md:mb-6">
          Système de Bar
        </h2>
        
        <BarOrderSystem />
      </div>
    </ChateauBackground>
  );
};

export default BarPage;
