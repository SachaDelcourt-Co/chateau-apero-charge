
import React from 'react';

interface ChateauLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const ChateauLogo: React.FC<ChateauLogoProps> = ({ className = '', size = 'md' }) => {
  const sizeClasses = {
    sm: 'text-2xl md:text-3xl',
    md: 'text-4xl md:text-5xl',
    lg: 'text-5xl md:text-6xl'
  };

  return (
    <div className={`font-dancing text-white leading-tight ${sizeClasses[size]} ${className}`}>
      <div className="flex flex-col items-center">
        <span>Les apéros</span>
        <span className="-mt-1">du château</span>
      </div>
    </div>
  );
};

export default ChateauLogo;
