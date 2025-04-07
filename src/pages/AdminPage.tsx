
import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ChateauBackground from '@/components/ChateauBackground';
import ChateauCard from '@/components/ChateauCard';
import ChateauLogo from '@/components/ChateauLogo';
import CardTopup from '@/components/admin/CardTopup';
import Dashboard from '@/components/admin/Dashboard';

const AdminPage: React.FC = () => {
  return (
    <ChateauBackground>
      <div className="w-full max-w-6xl mx-auto p-4">
        <div className="flex justify-center mb-6">
          <ChateauLogo />
        </div>
        
        <div className="bg-black/70 text-white p-6 rounded-lg shadow-xl">
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
