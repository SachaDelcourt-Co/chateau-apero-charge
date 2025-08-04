
import React from 'react';
import ChateauBackground from '@/components/ChateauBackground';
import ChateauCard from '@/components/ChateauCard';
import ChateauLogo from '@/components/ChateauLogo';
import CardNumberForm from '@/components/CardNumberForm';
import { Settings } from 'lucide-react';

const Index = () => {
  return (
    <ChateauBackground>
      {/* Discreet admin login button in top-right corner */}
      <a
        href="/login"
        className="absolute top-4 right-4 p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-md transition-colors z-10"
        title="Accès administrateur"
      >
        <Settings className="h-5 w-5" />
      </a>

      <div className="w-full max-w-md mx-auto flex flex-col items-center justify-center min-h-screen p-4">
        <ChateauLogo className="mb-8" />
        
        <ChateauCard className="w-full">
          <h2 className="text-2xl font-semibold text-center mb-4">
            Entrez votre numéro de carte
          </h2>
          
          <CardNumberForm />
          
        </ChateauCard>
      </div>
    </ChateauBackground>
  );
};

export default Index;
