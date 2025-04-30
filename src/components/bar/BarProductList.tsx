
import React from 'react';
import { Button } from '@/components/ui/button';
import { BarProduct } from '@/lib/supabase';
import { Plus, Euro, Beer, Wine, GlassWater, CupSoda } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Separator } from '@/components/ui/separator';

interface BarProductListProps {
  products: BarProduct[];
  onAddProduct: (product: BarProduct) => void;
}

export const BarProductList: React.FC<BarProductListProps> = ({ 
  products, 
  onAddProduct 
}) => {
  const isMobile = useIsMobile();

  // Function to determine button color based on product category and name
  const getButtonColor = (product: BarProduct): string => {
    // Special cases first
    if (product.is_return) return "bg-green-600 hover:bg-green-700";
    if (product.is_deposit) return "bg-yellow-600 hover:bg-yellow-700";
    
    // Base colors for categories
    const categoryColors: Record<string, string[]> = {
      'soft': [
        "bg-blue-500 hover:bg-blue-600",
        "bg-blue-600 hover:bg-blue-700",
        "bg-blue-700 hover:bg-blue-800",
        "bg-cyan-500 hover:bg-cyan-600",
        "bg-cyan-600 hover:bg-cyan-700",
        "bg-sky-500 hover:bg-sky-600"
      ],
      'bière': [
        "bg-amber-400 hover:bg-amber-500",
        "bg-amber-500 hover:bg-amber-600",
        "bg-amber-600 hover:bg-amber-700",
        "bg-amber-700 hover:bg-amber-800",
        "bg-yellow-500 hover:bg-yellow-600",
        "bg-orange-500 hover:bg-orange-600"
      ],
      'cocktail': [
        "bg-purple-400 hover:bg-purple-500",
        "bg-purple-500 hover:bg-purple-600",
        "bg-purple-600 hover:bg-purple-700",
        "bg-fuchsia-500 hover:bg-fuchsia-600",
        "bg-pink-500 hover:bg-pink-600",
        "bg-violet-500 hover:bg-violet-600"
      ],
      'vin': [
        "bg-red-400 hover:bg-red-500",
        "bg-red-500 hover:bg-red-600",
        "bg-red-600 hover:bg-red-700",
        "bg-rose-500 hover:bg-rose-600",
        "bg-rose-600 hover:bg-rose-700",
        "bg-red-700 hover:bg-red-800"
      ],
      'caution': [
        "bg-gray-500 hover:bg-gray-600",
        "bg-gray-600 hover:bg-gray-700",
        "bg-slate-500 hover:bg-slate-600"
      ]
    };

    const category = product.category?.toLowerCase() || "default";
    
    // If we have colors defined for this category
    if (categoryColors[category]) {
      // Use product name to create a consistent index for color selection
      const nameHash = product.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const colorIndex = nameHash % categoryColors[category].length;
      return categoryColors[category][colorIndex];
    }
    
    // Default fallback
    return "bg-primary hover:bg-primary/90";
  };

  // Get button text color - ensure high contrast
  const getTextColor = (product: BarProduct): string => {
    return "text-white";
  };

  // Get appropriate icon based on product category
  const getCategoryIcon = (product: BarProduct) => {
    const category = product.category?.toLowerCase() || "";
    const props = { className: "h-3 w-3 sm:h-4 sm:w-4 mr-1" };
    
    if (product.is_return || product.is_deposit) {
      return null; // No icon for returns/deposits
    }
    
    switch (category) {
      case 'bière':
        return <Beer {...props} />;
      case 'vin':
        return <Wine {...props} />;
      case 'cocktail':
        return <GlassWater {...props} />; // Replaced Cocktail with GlassWater
      case 'soft':
        return <CupSoda {...props} />;
      default:
        return null;
    }
  };

  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4 sm:gap-3">
      {products.map(product => (
        <Button
          key={product.id}
          className={`h-auto py-2 px-1.5 sm:py-3 sm:px-2 md:p-4 flex flex-col items-center justify-center ${getButtonColor(product)} ${getTextColor(product)}`}
          onClick={() => onAddProduct(product)}
        >
          <span className="text-sm sm:text-base md:text-lg font-medium text-center line-clamp-2 min-h-[2.5rem]">
            {product.name}
          </span>
          <div className="flex items-center mt-1">
            {getCategoryIcon(product)}
            <Euro className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
            <span>{product.price.toFixed(2)}</span>
          </div>
          <Plus className="mt-1 sm:mt-2 h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5" />
        </Button>
      ))}
    </div>
  );
};
