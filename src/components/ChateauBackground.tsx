
import React, { ReactNode } from 'react';

interface ChateauBackgroundProps {
  children: ReactNode;
  className?: string;
}

const ChateauBackground: React.FC<ChateauBackgroundProps> = ({ children, className = '' }) => {
  return (
    <div className={`min-h-screen bg-chateau-gradient flex flex-col items-center justify-center p-4 ${className}`}>
      {children}
    </div>
  );
};

export default ChateauBackground;
