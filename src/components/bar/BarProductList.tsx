
import React from 'react';
import { Button } from '@/components/ui/button';
import { BarProduct } from '@/lib/supabase';
import { Plus, Euro } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

interface BarProductListProps {
  products: BarProduct[];
  onAddProduct: (product: BarProduct) => void;
}

export const BarProductList: React.FC<BarProductListProps> = ({ 
  products, 
  onAddProduct 
}) => {
  const isMobile = useIsMobile();

  // Function to determine button color based on product category
  const getButtonColor = (product: BarProduct): string => {
    if (product.is_return) return "bg-green-600 hover:bg-green-700";
    if (product.is_deposit) return "bg-yellow-600 hover:bg-yellow-700";
    
    switch (product.category?.toLowerCase()) {
      case 'soft': return "bg-blue-600 hover:bg-blue-700";
      case 'bière': return "bg-amber-600 hover:bg-amber-700";
      case 'cocktail': return "bg-purple-600 hover:bg-purple-700";
      case 'vin': return "bg-red-600 hover:bg-red-700";
      case 'caution': return "bg-gray-600 hover:bg-gray-700";
      default: return "bg-primary hover:bg-primary/90";
    }
  };

  // Get button text color - ensure high contrast
  const getTextColor = (product: BarProduct): string => {
    return "text-white";
  };

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 sm:gap-3">
      {products.map(product => (
        <Button
          key={product.id}
          className={`h-auto py-3 px-2 sm:p-4 flex flex-col items-center justify-center ${getButtonColor(product)} ${getTextColor(product)}`}
          onClick={() => onAddProduct(product)}
        >
          <span className="text-base sm:text-lg font-medium text-center line-clamp-2">
            {product.name}
          </span>
          <div className="flex items-center mt-1">
            <Euro className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
            <span>{product.price.toFixed(2)}</span>
          </div>
          <Plus className="mt-2 h-4 w-4 sm:h-5 sm:w-5" />
        </Button>
      ))}
    </div>
  );
};
