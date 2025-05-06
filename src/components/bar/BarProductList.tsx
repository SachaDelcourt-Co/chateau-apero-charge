
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
    const productNameLower = product.name.toLowerCase();
    const category = product.category?.toLowerCase() || '';
    
    // Special cases first
    if (product.is_return) return "bg-green-600 hover:bg-green-700";
    if (product.is_deposit) return "bg-yellow-600 hover:bg-yellow-700";
    
    // Category-based colors
    switch (category) {
      case "soft":
        if (productNameLower.includes("eau")) return "bg-blue-400 hover:bg-blue-500";
        if (productNameLower.includes("coca")) return "bg-blue-500 hover:bg-blue-600";
        return "bg-cyan-500 hover:bg-cyan-600";
        
      case "bière":
        if (productNameLower.includes("cruche")) return "bg-amber-600 hover:bg-amber-700";
        if (productNameLower.includes("lupulus hopera")) return "bg-amber-400 hover:bg-amber-500";
        if (productNameLower.includes("lupulus pils")) return "bg-amber-500 hover:bg-amber-600";
        return "bg-amber-500 hover:bg-amber-600";
        
      case "cocktail":
        if (productNameLower.includes("gin tonic")) return "bg-purple-500 hover:bg-purple-600";
        if (productNameLower.includes("spritz 0")) return "bg-orange-400 hover:bg-orange-500";
        if (productNameLower.includes("spritz")) return "bg-orange-500 hover:bg-orange-600";
        return "bg-fuchsia-500 hover:bg-fuchsia-600";
        
      case "vin":
        if (productNameLower.includes("bulle")) return "bg-pink-500 hover:bg-pink-600";
        if (productNameLower.includes("verre de vin")) return "bg-red-500 hover:bg-red-600";
        if (productNameLower.includes("bouteille")) return "bg-red-600 hover:bg-red-700";
        return "bg-red-500 hover:bg-red-600";
        
      case "caution":
        if (productNameLower.includes("retour")) return "bg-green-500 hover:bg-green-600";
        return "bg-yellow-500 hover:bg-yellow-600";
      
      case "food":
        return "bg-emerald-500 hover:bg-emerald-600";
        
      default:
        return "bg-gray-500 hover:bg-gray-600";
    }
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
                className={`h-auto min-h-[70px] py-2 px-2 flex flex-col items-center justify-center ${getButtonColor(product)} text-white`}
                onClick={() => onAddProduct(product)}
              >
                <span className="text-sm font-medium text-center line-clamp-2 mb-1">
                  {product.name}
                </span>
                <div className="flex items-center mt-1">
                  <span className="text-sm font-bold">{product.price.toFixed(2)}€</span>
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
