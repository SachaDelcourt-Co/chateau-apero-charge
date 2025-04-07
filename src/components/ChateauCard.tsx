
import React, { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';

interface ChateauCardProps {
  children: ReactNode;
  className?: string;
}

const ChateauCard: React.FC<ChateauCardProps> = ({ children, className = '' }) => {
  return (
    <Card className={`chateau-card shadow-lg ${className}`}>
      <CardContent className="p-6">
        {children}
      </CardContent>
    </Card>
  );
};

export default ChateauCard;
