
import React from 'react';
import ChateauBackground from '@/components/ChateauBackground';
import { BarOrderSystem } from '@/components/bar/BarOrderSystem';

const BarPage: React.FC = () => {
  return (
    <ChateauBackground className="p-4">
      <div className="container mx-auto max-w-5xl">
        <h1 className="text-4xl font-dancing text-white text-center mb-6">Les apéros du château</h1>
        <h2 className="text-2xl text-white text-center mb-8">Système de Bar</h2>
        
        <BarOrderSystem />
      </div>
    </ChateauBackground>
  );
};

export default BarPage;
