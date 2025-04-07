
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import ChateauBackground from '@/components/ChateauBackground';
import ChateauLogo from '@/components/ChateauLogo';
import CardTopup from '@/components/admin/CardTopup';
import Dashboard from '@/components/admin/Dashboard';
import { LogOut } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

const AdminPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      toast({
        title: "Erreur",
        description: "Une erreur est survenue lors de la déconnexion",
        variant: "destructive"
      });
      return;
    }
    
    toast({
      title: "Déconnexion réussie",
      description: "Vous avez été déconnecté avec succès"
    });
    
    navigate('/login');
  };

  return (
    <ChateauBackground>
      <div className="w-full max-w-6xl mx-auto p-4">
        <div className="flex justify-between items-center mb-6">
          <ChateauLogo />
          <Button variant="destructive" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Déconnexion
          </Button>
        </div>
        
        <div className="bg-white/95 p-6 rounded-lg shadow-xl">
          <h1 className="text-2xl font-bold mb-6 text-center">Administration</h1>
          
          <Tabs defaultValue="topup" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="topup">Recharge de carte</TabsTrigger>
              <TabsTrigger value="dashboard">Tableau de bord</TabsTrigger>
            </TabsList>
            
            <TabsContent value="topup" className="mt-4">
              <CardTopup />
            </TabsContent>
            
            <TabsContent value="dashboard" className="mt-4">
              <Dashboard />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </ChateauBackground>
  );
};

export default AdminPage;
