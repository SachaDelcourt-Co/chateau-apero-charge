import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { BarProductList } from './BarProductList';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { BarProduct, OrderItem, BarOrder, getBarProducts, getTableCardById, processBarOrder, generateClientRequestId } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import { Loader2, CreditCard, AlertCircle, Scan, Trash2, Minus } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNfc } from '@/hooks/use-nfc';
import { logger } from '@/lib/logger';

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

  // Log that the component initialized
  useEffect(() => {
    logger.info('BarOrderSystem component initialized');
  }, []);

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
    // Handle scanned ID with the EXACT current UI total
    onScan: (id) => {
      console.log("[NFC Scan] Card scanned with ID:", id);
      // Set card ID immediately for UI feedback
      setCardId(id);
      
      // Calculate total directly from order items to ensure it's correct
      const calculatedTotal = orderItems.reduce((sum, item) => {
        return sum + (item.is_return ? -1 : 1) * item.price * item.quantity;
      }, 0);
      
      // Log both values for debugging
      console.log("[NFC Scan] State total:", currentTotal);
      console.log("[NFC Scan] Calculated total:", calculatedTotal);
      
      // Use the calculated total to be absolutely sure
      const finalTotal = calculatedTotal;
      console.log("[NFC Scan] *** FINAL AMOUNT TO PROCESS:", finalTotal, "€ ***");
      
      // Process payment with this amount
      processPayment(id, finalTotal);
    }
  });
  
  // Function to reset NFC scanner with appropriate logging
  const resetScan = (reason: string) => {
    if (isScanning) {
      console.log(`Resetting NFC scanner after ${reason}`);
      stopScan();
      setTimeout(() => {
        startScan();
      }, 500);
    }
  };

  // Update currentTotal whenever orderItems change
  useEffect(() => {
    // Calculate the new total and update state
    const total = calculateTotal();
    setCurrentTotal(total);
    
    // If scanning, update the NFC scanner when the order changes
    if (isScanning) {
      // Get current order string to compare
      const currentOrderString = JSON.stringify(orderItems);
      
      // If we have a previous reference and it's different from current order
      if (previousOrderRef.current && previousOrderRef.current !== currentOrderString) {
        // Update the reference first
        previousOrderRef.current = currentOrderString;
        
        // Restart the NFC scanner to capture the new total
        console.log("Order changed, restarting NFC scanner with new total:", total);
        
        // First stop the scanner
        stopScan();
        
        // Then restart after a short delay
        setTimeout(() => {
          startScan();
        }, 500);
      } 
      // For first time setup, just save the reference
      else if (!previousOrderRef.current) {
        previousOrderRef.current = currentOrderString;
      }
    }
  }, [orderItems, isScanning, stopScan, startScan]);

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
      setErrorMessage("Commande vide. Veuillez ajouter des produits.");
      logger.warn('Payment attempted with empty order');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    
    // Double check total amount - if it's 0 but we have order items, something is wrong
    if (total === 0 && orderItems.length > 0) {
      const error = "ERROR: Total amount is 0 but order has items!";
      logger.error(error, { orderItems });
      
      // Calculate directly as a fallback
      total = orderItems.reduce((sum, item) => {
        return sum + (item.is_return ? -1 : 1) * item.price * item.quantity;
      }, 0);
      logger.info('Recalculated total as fallback:', total);
    }
    
    // CRITICAL: Only error if total is zero when we have positive-value items but shouldn't be zero
    // Allow negative totals (returns can be worth more than purchases - valid scenario)
    const nonReturnItems = orderItems.filter(item => !item.is_return);
    const nonReturnTotal = nonReturnItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    if (total === 0 && nonReturnTotal > 0) {
      const error = "CRITICAL ERROR: Total is zero but should have positive value from non-return items!";
      logger.error(error, { 
        total, 
        nonReturnTotal,
        nonReturnItems,
        allItems: orderItems
      });
      setErrorMessage("Erreur de calcul. Le montant total est incorrect.");
      setIsProcessing(false);
      return;
    }
    
    logger.payment('payment_started', { 
      cardId: id, 
      total, 
      items: orderItems.map(item => ({ 
        name: item.product_name,
        price: item.price,
        quantity: item.quantity,
        isReturn: item.is_return
      }))
    });

    try {
      // Format the items for the Edge Function
      const formattedItems = orderItems.map(item => ({
        product_id: 0, // Not used by the stored procedure but required for interface
        quantity: item.quantity,
        unit_price: item.price,
        name: item.product_name,
        is_deposit: item.is_deposit || false,
        is_return: item.is_return || false
      }));
      
      logger.payment('submitting_order', { 
        cardId: id, 
        total, 
        itemCount: orderItems.length,
        transactionSafe: true // Log that we're using the transaction-safe method
      });

      // Generate client request ID for idempotency protection
      const clientRequestId = generateClientRequestId();
      
      // Call the Edge Function
      console.log("About to call Edge Function with:", {
        card_id: id.trim(),
        total_amount: total,
        items: formattedItems,
        client_request_id: clientRequestId
      });
      
      const orderResult = await processBarOrder({
        card_id: id.trim(),
        total_amount: total,
        items: formattedItems,
        client_request_id: clientRequestId
      });

      if (orderResult.success) {
        // Use the transaction result data directly
        logger.payment('payment_success', { 
          cardId: id, 
          previousBalance: orderResult.previous_balance,
          amount: total,
          newBalance: orderResult.new_balance,
          orderId: orderResult.order_id,
          transactionSafe: true
        });
        
        // Remember if we were scanning
        const wasScanning = isScanning;
        
        // First, completely stop scanning if active
        if (wasScanning) {
          logger.nfc("Completely stopping NFC scanner before reset");
          stopScan();
        }
        
        // Show success message with the new balance from the transaction
        toast({
          title: "Paiement réussi",
          description: `Solde restant: ${orderResult.new_balance?.toFixed(2)}€`
        });
        
        // Completely reset all state
        setOrderItems([]);
        setCardId('');
        setCurrentTotal(0);
        previousOrderRef.current = '';
        
        // Restart scanning after a sufficient delay if it was active
        if (wasScanning) {
          logger.nfc("Will restart scanner with clean state after delay");
          setTimeout(() => {
            logger.nfc("Restarting NFC scanner with fresh state");
            startScan();
          }, 800); // Slightly longer delay for better cleanup
        }
      } else {
        // Handle specific error cases
        if (orderResult.error?.includes('Insufficient funds')) {
          // Show toast for insufficient balance
          const errorMsg = `Solde insuffisant sur la carte.`;
          
          if (orderResult.previous_balance !== undefined) {
            // We have balance information from the transaction
            toast({
              title: "Solde insuffisant",
              description: `La solde de la carte est de ${orderResult.previous_balance.toFixed(2)}€ mais le total est de ${total.toFixed(2)}€.`,
              variant: "destructive"
            });
          } else {
            toast({
              title: "Solde insuffisant",
              description: errorMsg,
              variant: "destructive"
            });
          }
          
          setErrorMessage(errorMsg);
        } else if (orderResult.error?.includes('Card not found')) {
          setErrorMessage("Carte non trouvée. Veuillez vérifier l'ID de la carte.");
        } else {
          setErrorMessage(`Erreur lors du traitement de la commande: ${orderResult.error || 'Erreur inconnue'}`);
        }
        
        logger.error('Order processing failed', { 
          cardId: id, 
          total, 
          error: orderResult.error,
          transactionSafe: true
        });
        
        resetScan("order processing error");
      }
    } catch (error) {
      logger.error('Error processing payment:', error, { cardId: id, total });
      setErrorMessage("Une erreur s'est produite. Veuillez réessayer.");
      resetScan("payment processing error");
    } finally {
      setIsProcessing(false);
    }
  };

  // Handler for NFC scanning button
  const handleNfcToggle = async () => {
    try {
      if (isScanning) {
        // Stop the scanner
        console.log("Stopping NFC scanner");
        stopScan();
      } else {
        // Start the scanner
        console.log("Starting NFC scanner");
        
        // Reset any error state
        setErrorMessage(null);
        
        // Set initial order reference 
        previousOrderRef.current = JSON.stringify(orderItems);
        
        // Start scanning
        await startScan();
      }
    } catch (error) {
      console.error("Error toggling NFC scanner:", error);
      setErrorMessage("Une erreur est survenue avec le scanner NFC");
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
        <Card className="bg-black/30 h-auto rounded-none border-0 flex flex-col">
          <CardContent className="p-2 sm:p-3 flex flex-col">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-semibold text-white">Récapitulatif</h3>
              
              {orderItems.length > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleClearOrder}
                  className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 h-auto"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Effacer
                </Button>
              )}
            </div>
            
            {/* Order items list */}
            {orderItems.length === 0 ? (
              <div className="text-center text-gray-300 py-2 text-sm">
                Commande vide
              </div>
            ) : (
              <div className="mb-2 pr-1 overflow-y-auto max-h-[40vh]">
                <ul className="space-y-1">
                  {orderItems.map((item, index) => (
                    <li key={`${item.product_name}-${index}`} className="flex justify-between items-center border-b border-white/20 pb-1">
                      <div>
                        <div className="flex items-center">
                          <span className={`font-medium text-white text-sm ${item.is_return ? 'text-green-400' : ''}`}>
                            {item.product_name}
                          </span>
                          {item.quantity > 1 && (
                            <span className="ml-2 text-xs bg-gray-700 px-1.5 py-0.5 rounded-full text-white">
                              x{item.quantity}
                            </span>
                          )}
                        </div>
                        
                        <div className="text-xs text-gray-400">
                          {item.is_return 
                            ? `-${(item.price * item.quantity).toFixed(2)}€`
                            : `${(item.price * item.quantity).toFixed(2)}€`}
                        </div>
                      </div>
                      
                      <button 
                        className="bg-red-500 hover:bg-red-600 text-white rounded-md px-2 py-1 min-w-[24px] h-6 flex items-center justify-center transition-colors" 
                        onClick={() => handleRemoveItem(index)}
                        title="Retirer un article"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            <div className="border-t border-white/20 pt-2 mt-auto">
              <div className="flex justify-between items-center mb-2">
                <span className="text-base font-semibold text-white">Total:</span>
                <span className="text-lg font-bold text-white">
                  {orderItems.length === 0 ? "0.00€" : `${currentTotal.toFixed(2)}€`}
                </span>
              </div>
              
              <div className="text-white">
                <label htmlFor="card-id" className="block text-sm font-medium mb-1">
                  ID de la carte
                </label>
                <div className="relative mb-2">
                  <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <input 
                    id="card-id"
                    value={cardId}
                    onChange={handleCardIdChange}
                    placeholder="00LrJ9bQ"
                    maxLength={8}
                    disabled={isProcessing || orderItems.length === 0}
                    className="w-full pl-9 py-2 rounded-md bg-white/10 border border-white/20 text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                
                {/* Custom button since the UI component has styling issues */}
                <button
                  onClick={handleNfcToggle}
                  disabled={isProcessing || orderItems.length === 0 || !isSupported}
                  className={`w-full mb-2 flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-white ${
                    isProcessing || orderItems.length === 0 || !isSupported 
                      ? "bg-gray-500 cursor-not-allowed opacity-50" 
                      : isScanning 
                        ? "bg-green-600 hover:bg-green-700" 
                        : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  <Scan className="h-4 w-4 mr-2" />
                  {isScanning ? "Scanner Actif" : "Activer Scanner NFC"}
                </button>
                
                {isScanning && (
                  <div className="bg-blue-900/50 text-blue-300 p-1.5 rounded-md flex items-start text-xs mt-1 mb-1">
                    {orderItems.length === 0 ? (
                      <span>Ajoutez des produits</span>
                    ) : (
                      <span>Présentez une carte - <strong>{currentTotal.toFixed(2)}€</strong></span>
                    )}
                  </div>
                )}
                
                {isProcessing && (
                  <div className="mt-1 flex items-center justify-center text-white">
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    <span className="text-xs">Traitement...</span>
                  </div>
                )}
                
                {errorMessage && (
                  <div className="mt-1 bg-red-900/50 text-red-300 p-1.5 rounded-md flex items-start text-xs">
                    <AlertCircle className="h-3 w-3 mr-1 mt-0.5 flex-shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
