import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { BarProductList } from './BarProductList';
import { BarOrderCompletedPopup, CompletedOrder } from './BarOrderSummary';
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
  const [showCompletedOrderPopup, setShowCompletedOrderPopup] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<CompletedOrder | null>(null);
  const isMobile = useIsMobile();
  
  // RACE CONDITION FIX: Use refs to track the latest order state for NFC operations
  // This prevents stale closure data from being used in payment processing
  const orderItemsRef = useRef<OrderItem[]>([]);
  const isProcessingRef = useRef(false);

  // Log that the component initialized
  useEffect(() => {
    logger.info('BarOrderSystem component initialized');
  }, []);

  // Synchronous function to calculate total from current order items
  const calculateTotal = useCallback((items: OrderItem[] = orderItemsRef.current): number => {
    const total = items.reduce((total, item) => {
      // Calculate per item considering quantity
      const itemTotal = item.price * item.quantity;
      // Subtract for returns (caution return), add for everything else
      return total + (item.is_return ? -itemTotal : itemTotal);
    }, 0);
    
    console.log("[Total Debug] calculateTotal called, result:", total);
    return total;
  }, []);

  // RACE CONDITION FIX: Function to get current order data - always returns latest state
  // This ensures NFC scanning and payment processing always use the most current data
  // instead of relying on potentially stale state from closures
  const getCurrentOrderData = useCallback(() => {
    return {
      items: orderItemsRef.current,
      total: calculateTotal(orderItemsRef.current),
      isEmpty: orderItemsRef.current.length === 0
    };
  }, [calculateTotal]);

  // Initialize NFC hook with functions that always get current data
  const { isScanning, startScan, stopScan, isSupported } = useNfc({
    // Validate that ID is 8 characters long
    validateId: (id) => id.length === 8,
    // Get current total amount - this function always returns the latest total
    getCurrentOrderData: getCurrentOrderData,
    // Handle scanned ID with the EXACT current order data
    onScan: (id) => {
      console.log("[NFC Scan] Card scanned with ID:", id);
      
      // Prevent processing if already in progress
      if (isProcessingRef.current) {
        logger.warn("[NFC Scan] Payment already in progress, ignoring scan");
        return;
      }
      
      // Get the current order data at scan time
      const orderData = getCurrentOrderData();
      
      // Set card ID immediately for UI feedback
      setCardId(id);
      
      console.log("[NFC Scan] Current order data:", orderData);
      console.log("[NFC Scan] *** FINAL AMOUNT TO PROCESS:", orderData.total, "€ ***");
      
      // Process payment with current order data
      processPayment(id, orderData.total, orderData.items);
    }
  });

  // Update refs whenever orderItems changes
  useEffect(() => {
    orderItemsRef.current = orderItems;
  }, [orderItems]);

  // Update processing ref whenever isProcessing changes
  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

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
  };

  const handleCloseCompletedOrderPopup = () => {
    setShowCompletedOrderPopup(false);
    setCompletedOrder(null);
  };

  const handleCardIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCardId(value);
    setErrorMessage(null);
    
    // Process payment automatically when 8 characters are entered
    if (value.length === 8) {
      // Use the current total from state which is always up to date with orderItems
      processPayment(value, calculateTotal(orderItems), orderItems);
    }
  };

  const processPayment = async (id: string, total: number, items: OrderItem[]) => {
    if (items.length === 0) {
      setErrorMessage("Commande vide. Veuillez ajouter des produits.");
      logger.warn('Payment attempted with empty order');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    
    // Double check total amount - if it's 0 but we have order items, something is wrong
    if (total === 0 && items.length > 0) {
      const error = "ERROR: Total amount is 0 but order has items!";
      logger.error(error, { items });
      
      // Calculate directly as a fallback
      total = items.reduce((sum, item) => {
        return sum + (item.is_return ? -1 : 1) * item.price * item.quantity;
      }, 0);
      logger.info('Recalculated total as fallback:', total);
    }
    
    // CRITICAL: Only error if total is zero when we have positive-value items but shouldn't be zero
    // Allow negative totals (returns can be worth more than purchases - valid scenario)
    const nonReturnItems = items.filter(item => !item.is_return);
    const nonReturnTotal = nonReturnItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    if (total === 0 && nonReturnTotal > 0) {
      const error = "CRITICAL ERROR: Total is zero but should have positive value from non-return items!";
      logger.error(error, { 
        total, 
        nonReturnTotal,
        nonReturnItems,
        allItems: items
      });
      setErrorMessage("Erreur de calcul. Le montant total est incorrect.");
      setIsProcessing(false);
      return;
    }
    
    logger.payment('payment_started', { 
      cardId: id, 
      total, 
      items: items.map(item => ({ 
        name: item.product_name,
        price: item.price,
        quantity: item.quantity,
        isReturn: item.is_return
      }))
    });

    try {
      // Format the items for the Edge Function
      const formattedItems = items.map(item => ({
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
        itemCount: items.length,
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
        
        // Store the completed order data for the popup BEFORE clearing the state
        const completedOrderData: CompletedOrder = {
          items: [...items], // Create a copy of the items
          total: total,
          cardId: id,
          newBalance: orderResult.new_balance,
          orderId: orderResult.order_id
        };
        
        setCompletedOrder(completedOrderData);
        setShowCompletedOrderPopup(true);
        
        // Show success message with the new balance from the transaction
        toast({
          title: "Paiement réussi",
          description: `Solde restant: ${orderResult.new_balance?.toFixed(2)}€`
        });
        
        // Completely reset all state
        setOrderItems([]);
        setCardId('');
        
        // Restart scanning after a sufficient delay if it was active
        if (wasScanning) {
          logger.nfc("Will restart scanner with clean state after delay");
          setTimeout(async () => {
            logger.nfc("Restarting NFC scanner with fresh state");
            try {
              await startScan();
              logger.nfc("NFC scanner successfully restarted after payment");
            } catch (error) {
              logger.error("Failed to restart NFC scanner after payment:", error);
            }
          }, 1000); // Sufficient delay for complete state cleanup
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
        
        stopScan();
      }
    } catch (error) {
      logger.error('Error processing payment:', error, { cardId: id, total });
      setErrorMessage("Une erreur s'est produite. Veuillez réessayer.");
      stopScan();
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
                  {orderItems.length === 0 ? "0.00€" : `${calculateTotal(orderItems)}€`}
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
                      <span>Présentez une carte - <strong>{calculateTotal(orderItems).toFixed(2)}€</strong></span>
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
      
      {/* Order Completed Popup */}
      <BarOrderCompletedPopup
        isOpen={showCompletedOrderPopup}
        completedOrder={completedOrder}
        onClose={handleCloseCompletedOrderPopup}
      />
    </div>
  );
};
