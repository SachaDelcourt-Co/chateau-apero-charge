import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { BarProductList } from './BarProductList';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { BarProduct, OrderItem, BarOrder, getBarProducts, getTableCardById, createBarOrder } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import { Loader2, CreditCard, AlertCircle, Scan } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNfc } from '@/hooks/use-nfc';

export const BarOrderSystem: React.FC = () => {
  const [products, setProducts] = useState<BarProduct[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cardId, setCardId] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isMobile = useIsMobile();
  // Store the latest calculated total to ensure consistency
  const [currentTotal, setCurrentTotal] = useState<number>(0);
  // Track if order was modified since last scan activation
  const [orderModifiedAfterScan, setOrderModifiedAfterScan] = useState(false);
  // Ref to track previous order items to avoid unnecessary scan stops
  const previousOrderRef = useRef<string>('');

  // Calculate the total order amount
  const calculateTotal = (): number => {
    const total = orderItems.reduce((total, item) => {
      // Calculate per item considering quantity
      const itemTotal = item.price * item.quantity;
      // Subtract for returns (caution return), add for everything else
      return total + (item.is_return ? -itemTotal : itemTotal);
    }, 0);
    
    console.log("[Total Debug] calculateTotal called, result:", total);
    return total;
  };

  // Initialize NFC hook with a validation function and scan handler
  const { isScanning, startScan, stopScan, isSupported } = useNfc({
    // Validate that ID is 8 characters long
    validateId: (id) => id.length === 8,
    // Handle scanned ID with a forced refresh before payment processing
    onScan: (id) => {
      console.log("[NFC Scan] Card scanned with ID:", id);
      // Set card ID immediately for UI feedback
      setCardId(id);
      
      // Force refresh calculation of the total
      const refreshedTotal = calculateTotal();
      console.log("[NFC Scan] Force refreshed total:", refreshedTotal);
      setCurrentTotal(refreshedTotal);
      
      // Use setTimeout to ensure the refresh has been processed
      setTimeout(() => {
        // Get the latest total again after refresh
        const finalTotal = calculateTotal();
        console.log("[NFC Scan] Final total amount for payment:", finalTotal);
        
        // Process payment with the final calculated total
        processPayment(id, finalTotal);
      }, 100); // Short delay to ensure state updates are processed
    },
    // Provide a callback to get the latest total at scan time
    getTotalAmount: calculateTotal
  });

  // Update currentTotal whenever orderItems change
  useEffect(() => {
    const total = calculateTotal();
    console.log("[Total Debug] Order items changed, recalculated total:", total, "Items:", orderItems);
    setCurrentTotal(total);
    
    // Auto-stop NFC scanning ONLY if this is a real order change (not the initial render)
    if (isScanning && orderItems.length > 0) {
      const currentOrder = JSON.stringify(orderItems);
      
      // Only stop scanning if order actually changed and not first render
      if (previousOrderRef.current && previousOrderRef.current !== currentOrder) {
        console.log("[NFC Debug] Order modified, stopping NFC scan to ensure correct amount");
        stopScan();
        setOrderModifiedAfterScan(true);
        toast({
          title: "Scan NFC désactivé",
          description: "Le scan a été désactivé car la commande a été modifiée. Veuillez réactiver le scan après avoir finalisé la commande."
        });
      }
      
      // Update previous order ref
      previousOrderRef.current = currentOrder;
    }
  }, [orderItems, isScanning, stopScan]);

  // Add an effect to track scanning state changes from the useNfc hook
  useEffect(() => {
    console.log("[BarOrderSystem] Scanning state changed:", isScanning);
    
    // If scanning stopped (and it wasn't due to order modification)
    if (!isScanning && !orderModifiedAfterScan) {
      // Check if we have a card ID, which means a card was scanned
      if (cardId) {
        console.log("[BarOrderSystem] Scanning stopped after card scan, cardId:", cardId);
      }
    }
  }, [isScanning, orderModifiedAfterScan, cardId]);

  // Load products on component mount
  useEffect(() => {
    const loadProducts = async () => {
      setIsLoading(true);
      const productData = await getBarProducts();
      setProducts(productData);
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

  const handleClearOrder = () => {
    setOrderItems([]);
    setCardId('');
    setErrorMessage(null);
    setCurrentTotal(0);
  };

  const handleCardIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCardId(value);
    setErrorMessage(null);
    
    // Process payment automatically when 8 characters are entered
    if (value.length === 8) {
      // Use the current total from state which is always up to date with orderItems
      processPayment(value, currentTotal);
    }
  };

  const processPayment = async (id: string, total: number) => {
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
    
    // Do one final calculation to ensure we have the absolute latest total
    const finalTotal = calculateTotal();
    console.log("Processing payment with total:", total, "Final calculated total:", finalTotal);
    
    // Always use the latest calculated total, not the one passed in
    total = finalTotal;

    try {
      // Check if card exists and has sufficient balance
      const card = await getTableCardById(id.trim());
      
      if (!card) {
        setErrorMessage("Carte non trouvée. Veuillez vérifier l'ID de la carte.");
        setIsProcessing(false);
        return;
      }

      const cardAmountFloat = parseFloat(card.amount || '0');
      
      if (cardAmountFloat < total) {
        setErrorMessage(`Solde insuffisant. La carte dispose de ${cardAmountFloat.toFixed(2)}€ mais le total est de ${total.toFixed(2)}€.`);
        setIsProcessing(false);
        return;
      }

      // Process the order with the final calculated total
      const orderData: BarOrder = {
        card_id: id.trim(),
        total_amount: total, // Use the latest calculated total
        items: JSON.parse(JSON.stringify(orderItems)) // Deep copy to avoid reference issues
      };

      console.log("Sending order with total:", orderData.total_amount);

      const orderResult = await createBarOrder(orderData);

      if (orderResult.success) {
        const newBalance = (cardAmountFloat - total).toFixed(2);
        
        // No need to stop scanning here as it's handled in the useNfc hook when card is scanned
        
        // Clear order state after successful payment
        setOrderItems([]);
        setCardId('');
        setCurrentTotal(0);
        previousOrderRef.current = '';
        
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

  // Handler for NFC scanning button
  const handleNfcToggle = async () => {
    try {
      if (isScanning) {
        console.log("[BarOrderSystem] Stopping NFC scan");
        stopScan();
      } else {
        console.log("[BarOrderSystem] Starting NFC scan, current total:", calculateTotal());
        // Reset any existing error
        setErrorMessage(null);
        
        // Reset order modified flag when explicitly activating scanning
        setOrderModifiedAfterScan(false);
        
        // Update the order reference to current state
        previousOrderRef.current = JSON.stringify(orderItems);
        console.log("[BarOrderSystem] Setting reference order:", previousOrderRef.current);
        
        // Start scanning
        const result = await startScan();
        if (result) {
          console.log("[BarOrderSystem] NFC scanning started successfully");
          // Toast already shown by the hook
        } else {
          console.log("[BarOrderSystem] Failed to start NFC scanning");
        }
      }
    } catch (error) {
      console.error("[BarOrderSystem] Error toggling NFC scan:", error);
      toast({
        title: "Erreur NFC",
        description: "Une erreur est survenue lors de la gestion du scan NFC",
        variant: "destructive"
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 w-full h-full">
      {/* Product selection - Left wider area */}
      <div className="md:col-span-3 h-full overflow-y-auto pb-20 md:pb-0">
        <div className="p-3">
          <BarProductList 
            products={products} 
            onAddProduct={handleAddProduct} 
          />
        </div>
      </div>
      
      {/* Order summary & Payment - Right column */}
      <div className="md:col-span-1 bg-black/50 h-screen overflow-auto">
        <Card className="bg-black/30 h-full rounded-none border-0">
          <CardContent className="p-3 sm:p-4 flex flex-col h-full">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-xl font-semibold text-white">Récapitulatif</h3>
              
              {orderItems.length > 0 && (
                <button 
                  className="text-sm text-red-400 hover:text-red-200" 
                  onClick={handleClearOrder}
                >
                  Effacer tout
                </button>
              )}
            </div>
            
            {orderItems.length === 0 ? (
              <div className="text-center text-gray-300 py-3">
                Votre commande est vide
              </div>
            ) : (
              <div className="flex-grow mb-4 pr-1 overflow-y-auto" style={{ maxHeight: "40vh" }}>
                <ul className="space-y-2">
                  {orderItems.map((item, index) => (
                    <li key={`${item.product_name}-${index}`} className="flex justify-between items-center border-b border-white/20 pb-2">
                      <div>
                        <div className="flex items-center">
                          <span className={`font-medium text-white ${item.is_return ? 'text-green-400' : ''}`}>
                            {item.product_name}
                          </span>
                          {item.quantity > 1 && (
                            <span className="ml-2 text-sm bg-gray-700 px-2 py-0.5 rounded-full text-white">
                              x{item.quantity}
                            </span>
                          )}
                        </div>
                        
                        <div className="text-xs sm:text-sm text-gray-400">
                          {item.is_return 
                            ? `-${(item.price * item.quantity).toFixed(2)}€`
                            : `${(item.price * item.quantity).toFixed(2)}€`}
                        </div>
                      </div>
                      
                      <button 
                        className="text-sm text-gray-400 hover:text-red-400 px-2 py-1" 
                        onClick={() => handleRemoveItem(index)}
                      >
                        -
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            <div className="border-t border-white/20 pt-3">
              <div className="flex justify-between items-center mb-3">
                <span className="text-base font-semibold text-white">Total:</span>
                <span className="text-lg font-bold text-white">{currentTotal.toFixed(2)}€</span>
              </div>
              
              <div className="text-white">
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
                    className="pl-9 bg-white/10 border-white/20 text-white placeholder:text-gray-500"
                    maxLength={8}
                    disabled={isProcessing || orderItems.length === 0}
                  />
                </div>
                
                <Button
                  onClick={handleNfcToggle}
                  variant={orderModifiedAfterScan ? "default" : (isScanning ? "destructive" : "outline")}
                  disabled={isProcessing || orderItems.length === 0 || !isSupported}
                  className={`w-full mb-2 ${orderModifiedAfterScan ? "bg-amber-500 hover:bg-amber-600 text-white" : "border-white/20"}`}
                >
                  <Scan className="h-4 w-4 mr-2" />
                  {isScanning 
                    ? "Arrêter le scan NFC" 
                    : (orderModifiedAfterScan 
                        ? "Réactiver le scan pour payer" 
                        : "Activer le scan NFC pour payer")}
                </Button>
                
                {orderModifiedAfterScan && !isScanning && (
                  <div className="bg-amber-900/50 text-amber-300 p-2 rounded-md flex items-start text-sm mt-2 mb-2">
                    <span>Commande modifiée. Veuillez réactiver le scan NFC pour le nouveau montant de {currentTotal.toFixed(2)}€</span>
                  </div>
                )}
                
                {isScanning && (
                  <div className="bg-blue-900/50 text-blue-300 p-2 rounded-md flex items-start text-sm mt-2 mb-2">
                    <span>Scanner votre carte NFC maintenant pour payer {currentTotal.toFixed(2)}€</span>
                  </div>
                )}
                
                {isProcessing && (
                  <div className="mt-2 flex items-center justify-center text-white">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    <span className="text-sm">Traitement en cours...</span>
                  </div>
                )}
                
                {errorMessage && (
                  <div className="mt-2 bg-red-900/50 text-red-300 p-2 rounded-md flex items-start text-sm">
                    <AlertCircle className="h-4 w-4 mr-1 mt-0.5 flex-shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}
                
                <p className="text-xs text-gray-400 mt-1">
                  Entrez les 8 caractères de l'ID ou utilisez le scanner NFC pour traiter le paiement automatiquement
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
