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

  // Group products by category using hardcoded groups
  const groupedProducts = React.useMemo(() => {
    const softProducts: BarProduct[] = [];
    const alcoholProducts: BarProduct[] = [];
    const containerProducts: BarProduct[] = [];
    const depositProducts: BarProduct[] = [];
    const otherProducts: BarProduct[] = [];
    
    // Manually categorize each product
    products.forEach(product => {
      const name = product.name.toLowerCase();
      
      // Softs category
      if (name.includes('eau') || 
          name.includes('coca') || 
          name.includes('coca-cola')) {
        softProducts.push(product);
      }
      // Alcohol category
      else if (name.includes('gin') && !name.includes('carafe') ||
        name.includes('spritz') && !name.includes('carafe') ||
        name.includes('bière spécial') || 
        name.includes('biere special') ||
        name.includes('pils') && !name.includes('carafe') || 
        name.includes('verre bulle')) {
        alcoholProducts.push(product);
      }
      // Containers category
      else if (name.includes('bouteille') || 
               name.includes('carafe')) {
        containerProducts.push(product);
      }
      // Deposit/Return category
      else if (name.includes('caution') || 
               name.includes('retour') || 
               product.is_deposit || 
               product.is_return) {
        depositProducts.push(product);
      }
      // Other products
      else {
        otherProducts.push(product);
      }
    });

    const result: ProductCategory[] = [];
    
    // Add categories in specific order
    if (softProducts.length > 0) {
      result.push({name: 'Softs', products: softProducts});
    }
    
    if (alcoholProducts.length > 0) {
      result.push({name: 'Alcool', products: alcoholProducts});
    }
    
    if (containerProducts.length > 0) {
      result.push({name: 'Carafes/Bouteilles', products: containerProducts});
    }
    
    if (depositProducts.length > 0) {
      result.push({name: 'Cautions', products: depositProducts});
    }
    
    if (otherProducts.length > 0) {
      result.push({name: 'Autre', products: otherProducts});
    }
    
    return result;
  }, [products]);

  // Function to determine button color based on product category and name
  const getButtonColor = (product: BarProduct, categoryName: string): string => {
    const productNameLower = product.name.toLowerCase();
    
    // Special cases first
    if (product.is_return) return "bg-green-600 hover:bg-green-700";
    if (product.is_deposit) return "bg-yellow-600 hover:bg-yellow-700";
    
    // Category-based colors with variations within categories
    switch (categoryName) {
      case "Softs":
        if (productNameLower.includes("eau")) return "bg-blue-400 hover:bg-blue-500";
        if (productNameLower.includes("coca")) {
          if (productNameLower.includes("zéro") || productNameLower.includes("zero")) {
            return "bg-blue-600 hover:bg-blue-700";
          }
          return "bg-blue-500 hover:bg-blue-600";
        }
        return "bg-cyan-500 hover:bg-cyan-600";
        
      case "Alcool":
        if (productNameLower.includes("bière spécial") || productNameLower.includes("biere special")) {
          return "bg-amber-500 hover:bg-amber-600";
        }
        if (productNameLower.includes("pils")) {
          if (productNameLower.includes("25")) {
            return "bg-amber-400 hover:bg-amber-500";
          }
          if (productNameLower.includes("50")) {
            return "bg-amber-600 hover:bg-amber-700";
          }
          return "bg-amber-500 hover:bg-amber-600";
        }
        if (productNameLower.includes("gin")) return "bg-purple-500 hover:bg-purple-600";
        if (productNameLower.includes("spritz")) return "bg-orange-500 hover:bg-orange-600";
        if (productNameLower.includes("verre bulle")) return "bg-pink-500 hover:bg-pink-600";
        if (productNameLower.includes("vin")) {
          if (productNameLower.includes("blanc")) return "bg-yellow-400 hover:bg-yellow-500";
          if (productNameLower.includes("rosé") || productNameLower.includes("rose")) {
            return "bg-red-300 hover:bg-red-400";
          }
          return "bg-red-500 hover:bg-red-600";
        }
        return "bg-red-500 hover:bg-red-600";
        
      case "Carafes/Bouteilles":
        if (productNameLower.includes("bulle")) return "bg-indigo-400 hover:bg-indigo-500";
        if (productNameLower.includes("gin")) return "bg-purple-400 hover:bg-purple-500";
        if (productNameLower.includes("spritz")) return "bg-orange-400 hover:bg-orange-500";
        if (productNameLower.includes("pils")) return "bg-amber-300 hover:bg-amber-400";
        return "bg-indigo-500 hover:bg-indigo-600";
        
      case "Cautions":
        if (productNameLower.includes("retour")) return "bg-green-500 hover:bg-green-600";
        return "bg-yellow-500 hover:bg-yellow-600";
        
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
                className={`h-auto min-h-[70px] py-2 px-2 flex flex-col items-center justify-center ${getButtonColor(product, category.name)} text-white`}
                onClick={() => onAddProduct(product)}
              >
                <span className="text-sm font-medium text-center line-clamp-2 mb-1">
                  {product.name}
                </span>
                <div className="flex items-center mt-1">
                  <Euro className="h-4 w-4 mr-1" />
                  <span className="text-sm font-bold">{product.price.toFixed(2)}</span>
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
