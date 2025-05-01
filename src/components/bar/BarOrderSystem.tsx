import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { BarProductList } from './BarProductList';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { BarProduct, OrderItem, BarOrder, getBarProducts, getTableCardById, createBarOrder } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import { Loader2, CreditCard, AlertCircle } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNfc } from '@/hooks/use-nfc';

export const BarOrderSystem: React.FC = () => {
  const [products, setProducts] = useState<BarProduct[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cardId, setCardId] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isMobile = useIsMobile();

  // Process payment when a card ID is received
  const handleCardScan = useCallback((id: string) => {
    setCardId(id);
    processPayment(id);
  }, []);

  // Initialize NFC hook with a validation function and scan handler
  const { isScanning, startScan, stopScan, isSupported } = useNfc({
    // Validate that ID is 8 characters long
    validateId: (id) => id.length === 8,
    // Handle scanned ID
    onScan: handleCardScan
  });

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
  
  // Start NFC scanning in a separate effect to avoid dependency issues
  useEffect(() => {
    // Only start scanning if supported and not already scanning
    if (isSupported && !isScanning && !isLoading) {
      // Small delay to ensure component is fully mounted
      const timer = setTimeout(() => {
        startScan().catch(console.error);
      }, 500);
      
      return () => clearTimeout(timer);
    }
    
    // Cleanup: stop scanning when component unmounts
    return () => {
      stopScan();
    };
  }, [isSupported, isScanning, isLoading, startScan, stopScan]);

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
    setCardId('');
    setErrorMessage(null);
    toast({
      title: "Commande effacée",
      description: "La commande a été effacée"
    });
  };

  const handleCardIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCardId(value);
    setErrorMessage(null);
    
    // Process payment automatically when 8 characters are entered
    if (value.length === 8) {
      processPayment(value);
    }
  };

  const processPayment = async (id: string) => {
    // Prevent processing if already in progress
    if (isProcessing) return;
    
    if (orderItems.length === 0) {
      toast({
        title: "Commande vide",
        description: "Veuillez ajouter des produits à la commande",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      // Check if card exists and has sufficient balance
      const card = await getTableCardById(id.trim());
      
      if (!card) {
        setErrorMessage("Carte non trouvée. Veuillez vérifier l'ID de la carte.");
        setIsProcessing(false);
        return;
      }

      const cardAmountFloat = parseFloat(card.amount || '0');
      const total = calculateTotal();
      
      console.log("Processing payment with total:", total);
      console.log("Order items:", orderItems);
      
      if (cardAmountFloat < total) {
        setErrorMessage(`Solde insuffisant. La carte dispose de ${cardAmountFloat.toFixed(2)}€ mais le total est de ${total.toFixed(2)}€.`);
        setIsProcessing(false);
        return;
      }

      // Process the order
      const orderData: BarOrder = {
        card_id: id.trim(),
        total_amount: total,
        items: orderItems
      };

      const orderResult = await createBarOrder(orderData);

      if (orderResult.success) {
        const newBalance = (cardAmountFloat - total).toFixed(2);
        
        setOrderItems([]);
        setCardId('');
        
        toast({
          title: "Paiement réussi",
          description: `La commande a été traitée avec succès. Nouveau solde: ${newBalance}€`
        });
      } else {
        setErrorMessage("Erreur lors du traitement de la commande. Veuillez réessayer.");
      }
    } catch (error) {
      console.error('Error processing payment:', error);
      setErrorMessage("Une erreur s'est produite. Veuillez réessayer.");
    } finally {
      setIsProcessing(false);
    }
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

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6">
      {/* Product selection - Left column on desktop, top on mobile */}
      <div className="md:col-span-2">
        <Card className="bg-white/90 shadow-lg">
          <CardContent className={`${isMobile ? 'p-3' : 'p-6'}`}>
            <h3 className="text-xl font-semibold mb-2 md:mb-3">Sélection des produits</h3>
            
            <ScrollArea className="h-[40vh] md:h-[60vh] pr-4">
              <BarProductList 
                products={products} 
                onAddProduct={handleAddProduct} 
              />
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
      
      {/* Order summary & Payment - Right column on desktop, bottom on mobile */}
      <div className="md:col-span-1">
        <Card className="bg-white/90 shadow-lg h-full">
          <CardContent className="p-3 sm:p-6 flex flex-col h-full">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-xl font-semibold">Récapitulatif</h3>
              
              {orderItems.length > 0 && (
                <button 
                  className="text-sm text-red-600 hover:text-red-800" 
                  onClick={handleClearOrder}
                >
                  Effacer tout
                </button>
              )}
            </div>
            
            {orderItems.length === 0 ? (
              <div className="text-center text-gray-500 py-3">
                Votre commande est vide
              </div>
            ) : (
              <ScrollArea className="flex-grow mb-4" style={{ maxHeight: isMobile ? "30vh" : "40vh" }}>
                <ul className="space-y-2">
                  {orderItems.map((item, index) => (
                    <li key={`${item.product_name}-${index}`} className="flex justify-between items-center border-b pb-2">
                      <div>
                        <div className="flex items-center">
                          <span className={`font-medium ${item.is_return ? 'text-green-600' : ''}`}>
                            {item.product_name}
                          </span>
                          {item.quantity > 1 && (
                            <span className="ml-2 text-sm bg-gray-200 px-2 py-0.5 rounded-full">
                              x{item.quantity}
                            </span>
                          )}
                        </div>
                        
                        <div className="text-xs sm:text-sm text-gray-600">
                          {item.is_return 
                            ? `-${(item.price * item.quantity).toFixed(2)}€`
                            : `${(item.price * item.quantity).toFixed(2)}€`}
                        </div>
                      </div>
                      
                      <button 
                        className="text-sm text-gray-500 hover:text-red-600 px-2 py-1" 
                        onClick={() => handleRemoveItem(index)}
                      >
                        -
                      </button>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
            
            <div className="border-t pt-3">
              <div className="flex justify-between items-center mb-3">
                <span className="text-base font-semibold">Total:</span>
                <span className="text-lg font-bold">{calculateTotal().toFixed(2)}€</span>
              </div>
              
              <div>
                <label htmlFor="card-id" className="block text-sm font-medium mb-1">
                  ID de la carte (8 caractères)
                </label>
                <div className="relative mb-2">
                  <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input 
                    id="card-id"
                    value={cardId}
                    onChange={handleCardIdChange}
                    placeholder="00LrJ9bQ"
                    className="pl-9"
                    maxLength={8}
                    disabled={isProcessing || orderItems.length === 0}
                  />
                </div>
                
                {isScanning && (
                  <div className="bg-green-100 text-green-800 p-2 rounded-md flex items-start text-sm mb-2">
                    <AlertCircle className="h-4 w-4 mr-1 mt-0.5 flex-shrink-0" />
                    <span>Scan NFC actif - Approchez une carte pour payer</span>
                  </div>
                )}
                
                {isProcessing && (
                  <div className="mt-2 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    <span className="text-sm">Traitement en cours...</span>
                  </div>
                )}
                
                {errorMessage && (
                  <div className="mt-2 bg-red-100 text-red-800 p-2 rounded-md flex items-start text-sm">
                    <AlertCircle className="h-4 w-4 mr-1 mt-0.5 flex-shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}
                
                <p className="text-xs text-gray-500 mt-1">
                  Entrez les 8 caractères de l'ID ou approchez une carte NFC pour payer automatiquement
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
