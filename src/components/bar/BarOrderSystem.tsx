import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { BarProductList } from './BarProductList';
import { BarOrderSummary } from './BarOrderSummary';
import { BarPaymentForm } from './BarPaymentForm';
import { BarProduct, OrderItem, BarOrder, getBarProducts } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { ScrollArea } from '@/components/ui/scroll-area';

export const BarOrderSystem: React.FC = () => {
  const [products, setProducts] = useState<BarProduct[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [paymentStep, setPaymentStep] = useState(false);
  const isMobile = useIsMobile();

  // Définir l'ordre des catégories
  const categoryOrder = ['soft', 'cocktail', 'bière', 'vin', 'caution'];

  // Load products on component mount
  useEffect(() => {
    const loadProducts = async () => {
      setIsLoading(true);
      const productData = await getBarProducts();
      
      // Trier les produits selon l'ordre des catégories défini
      const sortedProducts = [...productData].sort((a, b) => {
        const catA = a.category?.toLowerCase() || '';
        const catB = b.category?.toLowerCase() || '';
        
        const indexA = categoryOrder.indexOf(catA);
        const indexB = categoryOrder.indexOf(catB);
        
        // Si la catégorie n'est pas dans notre liste, la mettre à la fin
        const orderA = indexA >= 0 ? indexA : 999;
        const orderB = indexB >= 0 ? indexB : 999;
        
        return orderA - orderB;
      });
      
      setProducts(sortedProducts);
      setIsLoading(false);
    };
    
    loadProducts();
  }, []);

  // Handle adding a product to the order
  const handleAddProduct = (product: BarProduct) => {
    setOrderItems(prevItems => {
      // Check if the product already exists in the order
      const existingItemIndex = prevItems.findIndex(
        item => item.product_name === product.name
      );
      
      if (existingItemIndex >= 0) {
        // Product exists, increment quantity
        const updatedItems = [...prevItems];
        updatedItems[existingItemIndex] = {
          ...updatedItems[existingItemIndex],
          quantity: updatedItems[existingItemIndex].quantity + 1
        };
        return updatedItems;
      } else {
        // Add new product to order
        return [...prevItems, {
          product_name: product.name,
          price: product.price,
          quantity: 1,
          is_deposit: product.is_deposit,
          is_return: product.is_return
        }];
      }
    });
    
    toast({
      title: "Produit ajouté",
      description: `${product.name} a été ajouté à la commande`,
    });
  };

  // Handle removing a product from the order
  const handleRemoveItem = (itemIndex: number) => {
    setOrderItems(prevItems => {
      const item = prevItems[itemIndex];
      if (item.quantity > 1) {
        // Decrement quantity if more than 1
        const updatedItems = [...prevItems];
        updatedItems[itemIndex] = {
          ...updatedItems[itemIndex],
          quantity: updatedItems[itemIndex].quantity - 1
        };
        return updatedItems;
      } else {
        // Remove item if quantity is 1
        return prevItems.filter((_, index) => index !== itemIndex);
      }
    });
  };

  // Calculate the total order amount
  const calculateTotal = (): number => {
    return orderItems.reduce((total, item) => {
      // Subtract for returns (caution return), add for everything else
      const amount = item.is_return ? -item.price * item.quantity : item.price * item.quantity;
      return total + amount;
    }, 0);
  };

  const handleClearOrder = () => {
    setOrderItems([]);
    setPaymentStep(false);
    toast({
      title: "Commande effacée",
      description: "La commande a été effacée"
    });
  };

  const handleProceedToPayment = () => {
    if (orderItems.length === 0) {
      toast({
        title: "Commande vide",
        description: "Veuillez ajouter des produits à la commande",
        variant: "destructive"
      });
      return;
    }
    setPaymentStep(true);
  };

  const handleBackToOrder = () => {
    setPaymentStep(false);
  };

  const handleOrderComplete = () => {
    setOrderItems([]);
    setPaymentStep(false);
    toast({
      title: "Commande terminée",
      description: "La commande a été traitée avec succès"
    });
  };

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardContent className="p-6 flex flex-col items-center justify-center min-h-[300px]">
          <Loader2 className="h-12 w-12 animate-spin text-amber-500 mb-4" />
          <p className="text-lg">Chargement des produits...</p>
        </CardContent>
      </Card>
    );
  }

  const orderData: BarOrder = {
    card_id: "", // Will be filled in payment step
    total_amount: calculateTotal(),
    items: orderItems
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6">
      {!paymentStep ? (
        <>
          {/* Product selection - 2/3 width on desktop */}
          <div className="md:col-span-2">
            <Card className="bg-white/90 shadow-lg h-full">
              <CardContent className={`${isMobile ? 'p-3' : 'p-6'}`}>
                <h3 className="text-xl font-semibold mb-3 md:mb-4">Sélection des produits</h3>
                
                <ScrollArea className="h-[65vh] md:h-[70vh] pr-4">
                  <BarProductList 
                    products={products} 
                    onAddProduct={handleAddProduct} 
                  />
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
          
          {/* Order summary - 1/3 width on desktop */}
          <div className="md:col-span-1">
            <BarOrderSummary 
              orderItems={orderItems} 
              total={calculateTotal()} 
              onRemoveItem={handleRemoveItem}
              onClearOrder={handleClearOrder}
              onProceedToPayment={handleProceedToPayment}
            />
          </div>
        </>
      ) : (
        /* Payment step - full width */
        <div className="col-span-full">
          <BarPaymentForm 
            order={orderData}
            onBack={handleBackToOrder}
            onComplete={handleOrderComplete}
          />
        </div>
      )}
    </div>
  );
};
