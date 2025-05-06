
import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { getDashboardStatistics, Statistics } from '@/lib/supabase';
import UserStatistics from './stats/UserStatistics';
import FinancialStatistics from './stats/FinancialStatistics';
import ProductStatistics from './stats/ProductStatistics';
import TemporalStatistics from './stats/TemporalStatistics';
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Dashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [activeTab, setActiveTab] = useState("user");
  
  // Fonction pour récupérer les statistiques
  const fetchStatistics = async () => {
    try {
      setRefreshing(true);
      
      // Fetch all dashboard statistics
      const stats = await getDashboardStatistics();
      setStatistics(stats);

      // Afficher une notification de rafraîchissement réussi si c'était une action de l'utilisateur
      if (refreshing) {
        toast({
          title: "Données actualisées",
          description: "Les statistiques ont été mises à jour avec succès"
        });
      }
    } catch (error) {
      console.error("Erreur lors de la récupération des statistiques:", error);
      if (refreshing) {
        toast({
          title: "Erreur",
          description: "Impossible de récupérer les données actualisées",
          variant: "destructive"
        });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  
  // Chargement initial des données
  useEffect(() => {
    fetchStatistics();
  }, []);
  
  // Fonction de rafraîchissement manuel
  const handleRefresh = () => {
    fetchStatistics();
  };
  
  // Render for desktop
  const renderDesktop = () => (
    <div className="space-y-8 py-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Tableau de bord</h2>
        <Button 
          onClick={handleRefresh} 
          variant="outline" 
          size="sm"
          disabled={refreshing || loading}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Actualisation...' : 'Actualiser'}
        </Button>
      </div>
      
      <UserStatistics data={statistics?.user} loading={loading} />
      <Separator />
      <FinancialStatistics data={statistics?.financial} loading={loading} />
      <Separator />
      <ProductStatistics data={statistics?.product} loading={loading} />
      <Separator />
      <TemporalStatistics data={statistics?.temporal} loading={loading} />
    </div>
  );
  
  // Render for mobile
  const renderMobile = () => (
    <Card>
      <CardContent className="p-4">
        <div className="mb-4 flex justify-between items-center">
          <h2 className="text-xl font-bold">Tableau de bord</h2>
          <Button 
            onClick={handleRefresh} 
            variant="outline" 
            size="sm"
            disabled={refreshing || loading}
            className="flex items-center gap-1"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? '...' : 'Actualiser'}
          </Button>
        </div>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="user">Utilisateurs</TabsTrigger>
            <TabsTrigger value="financial">Finance</TabsTrigger>
            <TabsTrigger value="product">Produits</TabsTrigger>
            <TabsTrigger value="temporal">Temps</TabsTrigger>
          </TabsList>
          
          <TabsContent value="user" className="pt-4">
            <UserStatistics data={statistics?.user} loading={loading} />
          </TabsContent>
          
          <TabsContent value="financial" className="pt-4">
            <FinancialStatistics data={statistics?.financial} loading={loading} />
          </TabsContent>
          
          <TabsContent value="product" className="pt-4">
            <ProductStatistics data={statistics?.product} loading={loading} />
          </TabsContent>
          
          <TabsContent value="temporal" className="pt-4">
            <TemporalStatistics data={statistics?.temporal} loading={loading} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
  
  return (
    <>
      {/* Desktop version */}
      <div className="hidden md:block">
        {renderDesktop()}
      </div>
      
      {/* Mobile version */}
      <div className="block md:hidden">
        {renderMobile()}
      </div>
    </>
  );
};

export default Dashboard;
