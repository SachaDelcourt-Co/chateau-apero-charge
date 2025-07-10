import React from 'react';
import { Button } from '@/components/ui/button';
import { BarProduct } from '@/lib/supabase';
import { Euro } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Separator } from '@/components/ui/separator';

interface BarProductListProps {
  products: BarProduct[];
  onAddProduct: (product: BarProduct) => void;
}

interface ProductCategory {
  name: string;
  products: BarProduct[];
}

export const BarProductList: React.FC<BarProductListProps> = ({ 
  products, 
  onAddProduct 
}) => {
  const isMobile = useIsMobile();

  // Group products by category using database categories
  const groupedProducts = React.useMemo(() => {
    // Initialize category groups based on the database
    const categories = {
      'Soft': [] as BarProduct[],
      'Bière': [] as BarProduct[],
      'Cocktail': [] as BarProduct[],
      'Vin': [] as BarProduct[],
      'Caution': [] as BarProduct[],
      'Food': [] as BarProduct[],
      'Autre': [] as BarProduct[],
    };
    
    // Categorize products based on their category field
    products.forEach(product => {
      const category = product.category || 'Autre';
      
      // Check if this category exists in our predefined list
      if (category in categories) {
        categories[category as keyof typeof categories].push(product);
      } else {
        categories['Autre'].push(product);
      }
    });

    // Convert to array of category objects
    const result: ProductCategory[] = [];
    
    // Add non-empty categories in specific order
    if (categories['Soft'].length > 0) {
      result.push({name: 'Softs', products: categories['Soft']});
    }
    
    if (categories['Bière'].length > 0) {
      result.push({name: 'Bières', products: categories['Bière']});
    }
    
    if (categories['Cocktail'].length > 0) {
      result.push({name: 'Cocktails', products: categories['Cocktail']});
    }
    
    if (categories['Vin'].length > 0) {
      result.push({name: 'Vins', products: categories['Vin']});
    }
    
    if (categories['Caution'].length > 0) {
      result.push({name: 'Cautions', products: categories['Caution']});
    }
    
    if (categories['Food'].length > 0) {
      result.push({name: 'Food', products: categories['Food']});
    }
    
    if (categories['Autre'].length > 0) {
      result.push({name: 'Autre', products: categories['Autre']});
    }
    
    return result;
  }, [products]);

  // Function to determine button color based on product category and name
  const getButtonColor = (product: BarProduct): string => {
    // Special cases first - these override unique colors
    if (product.is_return) return "bg-green-600 hover:bg-green-700";
    if (product.is_deposit) return "bg-yellow-600 hover:bg-yellow-700";
    
    // Create a larger palette of distinct, readable colors
    const colorPalette = [
      "bg-blue-500 hover:bg-blue-600",      // Blue
      "bg-red-500 hover:bg-red-600",        // Red  
      "bg-green-500 hover:bg-green-600",    // Green
      "bg-purple-500 hover:bg-purple-600",  // Purple
      "bg-orange-500 hover:bg-orange-600",  // Orange
      "bg-pink-500 hover:bg-pink-600",      // Pink
      "bg-cyan-500 hover:bg-cyan-600",      // Cyan
      "bg-amber-500 hover:bg-amber-600",    // Amber
      "bg-emerald-500 hover:bg-emerald-600", // Emerald
      "bg-violet-500 hover:bg-violet-600",  // Violet
      "bg-rose-500 hover:bg-rose-600",      // Rose
      "bg-teal-500 hover:bg-teal-600",      // Teal
      "bg-indigo-500 hover:bg-indigo-600",  // Indigo
      "bg-lime-500 hover:bg-lime-600",      // Lime
      "bg-fuchsia-500 hover:bg-fuchsia-600", // Fuchsia
      "bg-sky-500 hover:bg-sky-600",        // Sky
      "bg-slate-500 hover:bg-slate-600",    // Slate
      "bg-zinc-500 hover:bg-zinc-600",      // Zinc
      "bg-stone-500 hover:bg-stone-600",    // Stone
      "bg-red-600 hover:bg-red-700",        // Dark Red
      "bg-blue-600 hover:bg-blue-700",      // Dark Blue
      "bg-green-600 hover:bg-green-700",    // Dark Green
      "bg-purple-600 hover:bg-purple-700",  // Dark Purple
      "bg-orange-600 hover:bg-orange-700",  // Dark Orange
      "bg-pink-600 hover:bg-pink-700",      // Dark Pink
      "bg-cyan-600 hover:bg-cyan-700",      // Dark Cyan
      "bg-amber-600 hover:bg-amber-700",    // Dark Amber
      "bg-emerald-600 hover:bg-emerald-700", // Dark Emerald
      "bg-violet-600 hover:bg-violet-700",  // Dark Violet
      "bg-rose-600 hover:bg-rose-700",      // Dark Rose
      "bg-teal-600 hover:bg-teal-700",      // Dark Teal
      "bg-indigo-600 hover:bg-indigo-700",  // Dark Indigo
      "bg-lime-600 hover:bg-lime-700",      // Dark Lime
      "bg-fuchsia-600 hover:bg-fuchsia-700", // Dark Fuchsia
      "bg-sky-600 hover:bg-sky-700",        // Dark Sky
    ];
    
    // Create a simple hash function based on product name for consistent color assignment
    const hashCode = (str: string): number => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      return Math.abs(hash);
    };
    
    // Get a unique color index based on the product name
    const colorIndex = hashCode(product.name) % colorPalette.length;
    
    return colorPalette[colorIndex];
  };

  return (
    <div className="space-y-6">
      {groupedProducts.map((category, categoryIndex) => (
        <div key={category.name} className="mb-6">
          <h3 className="text-lg font-semibold mb-2 text-white">{category.name}</h3>
          <div className="grid grid-cols-3 gap-2">
            {category.products.map(product => (
              <Button
                key={product.id}
                className={`h-auto min-h-[120px] py-2 px-1 flex flex-col items-center justify-between ${getButtonColor(product)} text-white`}
                onClick={() => onAddProduct(product)}
              >
                <div className="flex-1 flex items-center justify-center w-full px-1 py-1 overflow-hidden">
                  <span 
                    className="text-xs font-medium text-center leading-tight w-full" 
                    style={{
                      wordWrap: 'break-word',
                      overflowWrap: 'break-word',
                      wordBreak: 'break-word',
                      whiteSpace: 'normal',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical' as any,
                      overflow: 'hidden'
                    }}
                  >
                    {product.name}
                  </span>
                </div>
                <div className="flex items-center flex-shrink-0 bg-black/20 rounded px-2 py-1 mt-1">
                  <span className="text-xs font-bold whitespace-nowrap">{product.price.toFixed(2)}€</span>
                </div>
              </Button>
            ))}
          </div>
          {categoryIndex < groupedProducts.length - 1 && (
            <Separator className="my-4 bg-white/20" />
          )}
        </div>
      ))}
    </div>
  );
};
