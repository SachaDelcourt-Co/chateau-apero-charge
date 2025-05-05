
import React from 'react';
import { Button } from '@/components/ui/button';
import { BarProduct } from '@/lib/supabase';
import { Euro, Beer, Wine, GlassWater, CupSoda, Cocktail } from 'lucide-react';
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

  // Group products by category
  const groupedProducts = React.useMemo(() => {
    const result: ProductCategory[] = [];
    const categorizedProducts: Record<string, BarProduct[]> = {};

    // Define category order and special cases
    const softProducts = ["eau plate", "eau petillante", "coca", "coca zéro"];
    const alcoholProducts = ["biere", "biere spéciale", "vin blanc", "vin rosé", "gin", "spritz", "spritz 0%"];

    // First, sort products into categories
    products.forEach(product => {
      if (product.is_deposit || product.is_return) {
        // Special handling for deposits and returns
        const categoryName = product.is_return ? "Retours" : "Cautions";
        if (!categorizedProducts[categoryName]) {
          categorizedProducts[categoryName] = [];
        }
        categorizedProducts[categoryName].push(product);
        return;
      }
      
      const productNameLower = product.name.toLowerCase();
      const categoryName = product.category || "Autre";
      
      // Check if it's a "cruche" or "bouteille"
      if (productNameLower.includes("cruche") || productNameLower.includes("bouteille")) {
        if (!categorizedProducts["Cruches / Bouteilles"]) {
          categorizedProducts["Cruches / Bouteilles"] = [];
        }
        categorizedProducts["Cruches / Bouteilles"].push(product);
        return;
      }
      
      // Check if it's in the soft drinks list
      if (softProducts.some(soft => productNameLower.includes(soft))) {
        if (!categorizedProducts["Soft"]) {
          categorizedProducts["Soft"] = [];
        }
        categorizedProducts["Soft"].push(product);
        return;
      }
      
      // Check if it's in the alcoholic drinks list
      if (alcoholProducts.some(alcohol => productNameLower.includes(alcohol))) {
        if (!categorizedProducts["Alcool"]) {
          categorizedProducts["Alcool"] = [];
        }
        categorizedProducts["Alcool"].push(product);
        return;
      }
      
      // Default category handling
      if (!categorizedProducts[categoryName]) {
        categorizedProducts[categoryName] = [];
      }
      categorizedProducts[categoryName].push(product);
    });
    
    // Define the order of categories to display
    const categoryOrder = ["Soft", "Alcool", "Cruches / Bouteilles", "Cautions", "Retours"];
    
    // Add categories in the defined order first
    categoryOrder.forEach(category => {
      if (categorizedProducts[category]?.length > 0) {
        result.push({ name: category, products: categorizedProducts[category] });
        delete categorizedProducts[category];
      }
    });
    
    // Add any remaining categories
    Object.keys(categorizedProducts).forEach(category => {
      if (categorizedProducts[category]?.length > 0) {
        result.push({ name: category, products: categorizedProducts[category] });
      }
    });
    
    return result;
  }, [products]);

  // Function to determine button color based on product category and name
  const getButtonColor = (product: BarProduct, categoryName: string): string => {
    // Special cases first
    if (product.is_return) return "bg-green-600 hover:bg-green-700";
    if (product.is_deposit) return "bg-yellow-600 hover:bg-yellow-700";
    
    // Category-based colors
    switch (categoryName.toLowerCase()) {
      case "soft":
        return "bg-blue-500 hover:bg-blue-600";
      case "alcool":
        return "bg-amber-500 hover:bg-amber-600";
      case "cruches / bouteilles":
        return "bg-purple-500 hover:bg-purple-600";
      default:
        // Generic category - determine by product type
        const productNameLower = product.name.toLowerCase();
        if (productNameLower.includes("bière") || productNameLower.includes("biere")) {
          return "bg-amber-500 hover:bg-amber-600";
        } else if (productNameLower.includes("vin")) {
          return "bg-red-500 hover:bg-red-600";
        } else if (productNameLower.includes("eau")) {
          return "bg-blue-400 hover:bg-blue-500";
        } else if (productNameLower.includes("coca")) {
          return "bg-blue-600 hover:bg-blue-700";
        } else if (productNameLower.includes("spritz")) {
          return "bg-orange-500 hover:bg-orange-600";
        }
        return "bg-primary hover:bg-primary/90";
    }
  };

  // Get appropriate icon based on product category and name
  const getCategoryIcon = (product: BarProduct, categoryName: string) => {
    const productNameLower = product.name.toLowerCase();
    const props = { className: "h-4 w-4 mr-1.5" };
    
    if (product.is_return || product.is_deposit) {
      return null;
    }
    
    if (productNameLower.includes("bière") || productNameLower.includes("biere")) {
      return <Beer {...props} />;
    } else if (productNameLower.includes("vin")) {
      return <Wine {...props} />;
    } else if (productNameLower.includes("eau") || productNameLower.includes("coca")) {
      return <CupSoda {...props} />;
    } else if (productNameLower.includes("spritz") || productNameLower.includes("gin")) {
      return <Cocktail {...props} />;
    }
    
    // Default by category
    switch (categoryName.toLowerCase()) {
      case "soft":
        return <CupSoda {...props} />;
      case "alcool":
        return <Beer {...props} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {groupedProducts.map((category, categoryIndex) => (
        <div key={category.name} className="mb-4">
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
                  {getCategoryIcon(product, category.name)}
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
