
import React from 'react';
import ChateauBackground from '@/components/ChateauBackground';
import { BarOrderSystem } from '@/components/bar/BarOrderSystem';
import { useIsMobile } from '@/hooks/use-mobile';

const BarPage: React.FC = () => {
  const isMobile = useIsMobile();
  
  return (
    <ChateauBackground className="p-2 md:p-4">
      <div className="container mx-auto max-w-5xl">
        <h1 className={`text-2xl ${isMobile ? "" : "md:text-4xl"} font-dancing text-white text-center mb-2 md:mb-6`}>
          Les apéros du château
        </h1>
        <h2 className="text-lg md:text-2xl text-white text-center mb-3 md:mb-8">
          Système de Bar
        </h2>
        
        <BarOrderSystem />
      </div>
    </ChateauBackground>
  );
};

export default BarPage;
