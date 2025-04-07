
import React from 'react';
import ChateauBackground from '@/components/ChateauBackground';
import ChateauCard from '@/components/ChateauCard';
import ChateauLogo from '@/components/ChateauLogo';
import CardNumberForm from '@/components/CardNumberForm';

const Index = () => {
  return (
    <ChateauBackground>
      <div className="w-full max-w-md px-4">
        <ChateauCard>
          <div className="flex flex-col items-center space-y-8">
            <ChateauLogo size="lg" />
            
            <div className="text-white text-center space-y-2">
              <p>Avec cette carte, vous pouvez payer vos boissons.</p>
              <p className="text-sm">
                Pour plus d'informations concernant le remboursement: https://lesaperosduchateau.be
              </p>
              <div className="h-4"></div>
              <p className="text-sm">
                Traitez cette carte comme du cash.<br />
                En cas de perte, vous ne serez pas remboursé.
              </p>
            </div>

            <div className="w-full pt-2">
              <CardNumberForm />
            </div>
          </div>
        </ChateauCard>
      </div>
    </ChateauBackground>
  );
};

export default Index;
