
import React from 'react';
import { useNavigate } from 'react-router-dom';
import ChateauBackground from '@/components/ChateauBackground';
import ChateauCard from '@/components/ChateauCard';
import ChateauLogo from '@/components/ChateauLogo';
import { Button } from "@/components/ui/button";
import { useAuth } from '@/hooks/use-auth';

const Index = () => {
  const navigate = useNavigate();
  const { isLoggedIn, user, role } = useAuth();

  return (
    <ChateauBackground>
      <div className="w-full max-w-md mx-auto flex flex-col items-center justify-center min-h-screen p-4">
        <ChateauLogo className="mb-8" />
        
        <ChateauCard className="w-full">
          <h2 className="text-2xl font-semibold text-center mb-4">
            Bienvenue !
          </h2>
          
          {isLoggedIn && user ? (
            <div className="text-center">
              <p>Connecté en tant que: {user.email}</p>
              {role && <p>Role: {role}</p>}
            </div>
          ) : (
            <p className="text-center">
              Veuillez vous connecter pour accéder à toutes les fonctionnalités.
            </p>
          )}
          
          <div className="flex flex-col gap-4 mt-8">
            <Button onClick={() => navigate("/payment/new")}>
              Payer avec carte
            </Button>
            
            <Button variant="outline" onClick={() => navigate("/refund")}>
              Demander un remboursement
            </Button>
            
            {role === 'admin' && (
              <>
                <Button variant="secondary" onClick={() => navigate("/admin")}>
                  Administration
                </Button>
                <Button variant="secondary" onClick={() => navigate("/recharge")}>
                  Recharger une carte
                </Button>
              </>
            )}
            {role === 'bar' && (
              <Button variant="secondary" onClick={() => navigate("/bar")}>
                Bar
              </Button>
            )}
            {role === 'recharge' && (
              <Button variant="secondary" onClick={() => navigate("/recharge")}>
                Recharger une carte
              </Button>
            )}
          </div>
        </ChateauCard>
      </div>
    </ChateauBackground>
  );
};

export default Index;
