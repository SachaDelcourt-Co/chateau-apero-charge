
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import ChateauLogo from '@/components/ChateauLogo';
import CardTopup from '@/components/admin/CardTopup';
import { Home } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

const RechargePage: React.FC = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full max-w-6xl mx-auto p-2 sm:p-4">
        <div className="flex justify-between items-center mb-4 sm:mb-6">
          <div className={isMobile ? "scale-75 origin-left" : ""}>
            <ChateauLogo />
          </div>
          <Button variant="outline" size={isMobile ? "sm" : "default"} onClick={() => navigate("/")}>
            <Home className="h-4 w-4 mr-1 sm:mr-2" />
            {isMobile ? "Retour" : "Accueil"}
          </Button>
        </div>
        
        <div className="bg-white p-3 sm:p-6 rounded-lg shadow-xl">
          <h1 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-center">
            Recharge de Carte
          </h1>
          
          <div className="mt-2 sm:mt-4">
            <CardTopup />
          </div>
        </div>
      </div>
    </div>
  );
};

export default RechargePage;
