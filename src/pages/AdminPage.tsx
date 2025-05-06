
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import ChateauLogo from '@/components/ChateauLogo';
import CardTopup from '@/components/admin/CardTopup';
import Dashboard from '@/components/admin/Dashboard';
import UserManagement from '@/components/admin/UserManagement';
import { LogOut } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';

const AdminPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signOut, email } = useAuth();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeTab, setActiveTab] = useState("dashboard");

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

  // Function to refresh the dashboard when a card is topped up
  const refreshDashboard = () => {
    setRefreshTrigger(prev => prev + 1);
    setActiveTab("dashboard");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full max-w-7xl mx-auto p-4">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-4">
            <ChateauLogo />
            {email && (
              <div className="text-sm text-gray-600">
                Connecté en tant que: <span className="font-medium">{email}</span>
              </div>
            )}
          </div>
          <Button variant="destructive" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Déconnexion
          </Button>
        </div>
        
        <div className="bg-white rounded-lg shadow-xl">
          <h1 className="text-2xl font-bold p-6 text-center">Administration</h1>
          
          <Tabs 
            value={activeTab} 
            onValueChange={setActiveTab} 
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-3 px-6">
              <TabsTrigger value="dashboard">Tableau de bord</TabsTrigger>
              <TabsTrigger value="topup">Recharge de carte</TabsTrigger>
              <TabsTrigger value="users">Utilisateurs</TabsTrigger>
            </TabsList>
            
            <TabsContent value="dashboard" className="p-0">
              <Dashboard key={refreshTrigger} />
            </TabsContent>
            
            <TabsContent value="topup" className="p-6">
              <CardTopup onSuccess={refreshDashboard} />
            </TabsContent>
            
            <TabsContent value="users" className="p-6">
              <UserManagement />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default AdminPage;
