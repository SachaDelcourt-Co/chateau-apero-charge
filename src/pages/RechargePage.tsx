
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import ChateauLogo from '@/components/ChateauLogo';
import CardTopup from '@/components/admin/CardTopup';
import { Home } from 'lucide-react';

const RechargePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full max-w-6xl mx-auto p-4">
        <div className="flex justify-between items-center mb-6">
          <ChateauLogo />
          <Button variant="outline" onClick={() => navigate("/")}>
            <Home className="h-4 w-4 mr-2" />
            Accueil
          </Button>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-xl">
          <h1 className="text-2xl font-bold mb-6 text-center">Recharge de Carte</h1>
          
          <div className="mt-4">
            <CardTopup />
          </div>
        </div>
      </div>
    </div>
  );
};

export default RechargePage;
