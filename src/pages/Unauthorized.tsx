
import React from 'react';
import { useNavigate } from 'react-router-dom';
import ChateauBackground from '@/components/ChateauBackground';
import ChateauCard from '@/components/ChateauCard';
import ChateauLogo from '@/components/ChateauLogo';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';

const Unauthorized: React.FC = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const handleBack = () => {
    navigate(-1);
  };

  return (
    <ChateauBackground>
      <ChateauCard className="w-full max-w-md">
        <div className="flex flex-col items-center justify-center space-y-6">
          <ChateauLogo />
          <div className="text-white text-center">
            <h1 className="text-2xl font-bold mb-4">Accès non autorisé</h1>
            <p className="mb-6">Vous n'avez pas les droits nécessaires pour accéder à cette page.</p>
            
            <div className="flex flex-col space-y-3">
              <Button
                className="w-full bg-white text-amber-800 hover:bg-amber-50"
                onClick={handleBack}
              >
                Retour
              </Button>
              
              <Button
                className="w-full bg-transparent text-white border-white hover:bg-white/10"
                variant="outline"
                onClick={signOut}
              >
                Déconnexion
              </Button>
            </div>
          </div>
        </div>
      </ChateauCard>
    </ChateauBackground>
  );
};

export default Unauthorized;
