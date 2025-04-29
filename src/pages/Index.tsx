
import React from 'react';
import ChateauBackground from '@/components/ChateauBackground';
import ChateauCard from '@/components/ChateauCard';
import ChateauLogo from '@/components/ChateauLogo';
import CardNumberForm from '@/components/CardNumberForm';

const Index = () => {
  return (
    <ChateauBackground>
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
