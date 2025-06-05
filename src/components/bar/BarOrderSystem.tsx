import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { BarProductList } from './BarProductList';
// import { Input } from '@/components/ui/input'; // Input for card ID is custom styled
// import { Button } from '@/components/ui/button'; // Button for NFC is custom styled
import { BarProduct, OrderItem, getBarProducts, processBarOrder, ProcessBarOrderPayload } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import { Loader2, CreditCard, AlertCircle, Scan } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNfc } from '@/hooks/use-nfc';
import { logger } from '@/lib/logger';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const BAR_ORDER_CONFIRMATION_THRESHOLD = 50; // EUR
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000; // Initial delay, can be exponential

type BarOrderStatus = 'idle' | 'processing' | 'retrying' | 'success' | 'error' | 'conflict';


export const BarOrderSystem: React.FC = () => {
  const [products, setProducts] = useState<BarProduct[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cardId, setCardId] = useState('');
  // const [isProcessing, setIsProcessing] = useState(false); // Replaced by paymentStatus
  const [paymentStatus, setPaymentStatus] = useState<BarOrderStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const [currentTotal, setCurrentTotal] = useState<number>(0);
  const [orderModifiedAfterScan, setOrderModifiedAfterScan] = useState(false);
  const previousOrderRef = useRef<string>('');

  // Confirmation Dialog State
  const [isBarConfirmDialogOpen, setBarConfirmDialogOpen] = useState(false);
  const [pendingBarOrderPayload, setPendingBarOrderPayload] = useState<ProcessBarOrderPayload | null>(null);
  const [currentClientRequestId, setCurrentClientRequestId] = useState<string>('');


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
  const {
    nfcState, // Use nfcState for more detailed UI feedback if needed later
    startScan,
    stopScan,
    isSupported: nfcIsSupported, // Renamed for clarity
    errorDetails: nfcErrorDetails // Get error details
  } = useNfc({
    validateId: (id) => /^[a-zA-Z0-9]{8}$/.test(id),
    onScan: (scannedId) => {
      console.log("[NFC Scan - BarOrderSystem] Card scanned with ID:", scannedId);
      setCardId(scannedId);
      
      const calculatedTotal = orderItems.reduce((sum, item) => {
        return sum + (item.is_return ? -1 : 1) * item.price * item.quantity;
      }, 0);
      
      console.log("[NFC Scan - BarOrderSystem] State total:", currentTotal);
      console.log("[NFC Scan - BarOrderSystem] Calculated total:", calculatedTotal);
      
      const finalTotal = calculatedTotal;
      console.log("[NFC Scan - BarOrderSystem] *** FINAL AMOUNT TO PROCESS:", finalTotal, "€ ***");
      
      processPayment(scannedId, finalTotal);
    },
    scan_location_context: 'bar_main_terminal_1', // Added context
    cooldownDuration: 3000,
  });
  
  // Function to reset NFC scanner with appropriate logging
  // Note: useNfc hook now handles its own reset/cooldown logic internally.
  // This resetScan might need adjustment if it conflicts with internal cooldown.
  // For now, keeping it as it might be used for manual error resets.
  const resetScan = (reason: string) => {
    if (nfcState === 'SCANNING') { // Check against nfcState
      console.log(`Resetting NFC scanner after ${reason}`);
      stopScan(); // This should ideally trigger cooldown in useNfc
      // Consider if manual restart is needed or if useNfc handles it.
      // For now, let useNfc's cooldown manage restart.
      // setTimeout(() => {
      //   startScan();
      // }, 500);
    }
  };

  // Update currentTotal whenever orderItems change
  useEffect(() => {
    const total = calculateTotal();
    setCurrentTotal(total);
    
    // The enhanced useNfc hook doesn't require manual restart on total change.
    // It can be provided a getTotalAmount callback, or payment can be triggered with current total.
    // The current onScan implementation already calculates total at scan time.
    // Removing the logic that restarts scan on orderItems change.
    // If isScanning, the user expects the current scan session to use the latest total when a card is presented.
    
  }, [orderItems]); // Removed isScanning, stopScan, startScan from dependencies

  // Add an effect to track scanning state changes from the useNfc hook
  useEffect(() => {
    console.log("[BarOrderSystem] NFC state changed:", nfcState);
    if (nfcErrorDetails) {
      setErrorMessage(`Erreur NFC: ${nfcErrorDetails}`);
    }
    // If scanning stopped (and it wasn't due to order modification)
    if (nfcState !== 'SCANNING' && nfcState !== 'COOLDOWN' && !orderModifiedAfterScan) {
      if (cardId && nfcState === 'IDLE') { // Check if idle after a scan attempt
        console.log("[BarOrderSystem] NFC interaction ended, cardId:", cardId);
      }
    }
  }, [nfcState, nfcErrorDetails, orderModifiedAfterScan, cardId]);

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
          product_id: product.id, // Add product_id
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

  // Actual API call logic with retries
  const executeBarOrder = async (payload: ProcessBarOrderPayload, attempt = 1) => {
    setPaymentStatus(attempt > 1 ? 'retrying' : 'processing');
    setErrorMessage(null);

    if (attempt > 1) {
      toast({
        title: "Problème réseau",
        description: `Nouvel essai de paiement (${attempt -1}/${MAX_RETRIES})...`,
        variant: "default"
      });
    }

    logger.payment('submitting_order', { ...payload, attempt }); // Changed event type
    console.log("Calling Edge Function with (attempt " + attempt + "):", payload);

    try {
      const orderResult = await processBarOrder(payload); // processBarOrder is from lib/supabase

      if (orderResult.status === 'success') {
        setPaymentStatus('success');
        logger.payment('payment_success', {
          cardId: payload.card_id,
          previousBalance: orderResult.previous_balance,
          amount: payload.total_amount,
          newBalance: orderResult.new_balance,
          orderId: orderResult.order_id,
          client_request_id: orderResult.client_request_id || payload.client_request_id
        });
        
        toast({
          title: "Paiement Réussi",
          description: `${orderResult.message} (ID: ${orderResult.order_id}). Solde: ${orderResult.new_balance?.toFixed(2)}€`
        });
        
        setOrderItems([]);
        setCardId('');
        setCurrentTotal(0);
        previousOrderRef.current = '';
        setCurrentClientRequestId(''); // Clear after successful operation
        return; // Success, exit
      }

      // Handle errors from processBarOrder
      const knownNonRetriableStatuses: (typeof orderResult.status)[] = ['insufficient_funds', 'card_not_found', 'idempotency_conflict', 'invalid_input'];
      const isRetriableSupabaseError = (
        orderResult.status === 'error' &&
        !knownNonRetriableStatuses.includes(orderResult.status) && // Check against current status if originalStatus is not available
        attempt <= MAX_RETRIES
      );
      // Add more specific checks if orderResult.errorObject or orderResult.message indicate network issues

      if (isRetriableSupabaseError) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, attempt - 1)));
        return executeBarOrder(payload, attempt + 1);
      }

      // Non-retriable errors or max retries reached
      let userMessage = orderResult.message || "Erreur inconnue.";
      let toastTitle = "Erreur Serveur";
      setPaymentStatus(orderResult.status === 'idempotency_conflict' ? 'conflict' : 'error');

      switch (orderResult.status) {
        case 'insufficient_funds':
          toastTitle = "Solde Insuffisant";
          userMessage = `Solde insuffisant. ${orderResult.message} La carte a ${orderResult.previous_balance?.toFixed(2)}€, total ${payload.total_amount.toFixed(2)}€.`;
          break;
        case 'card_not_found':
          toastTitle = "Carte Non Trouvée";
          userMessage = `Carte non trouvée. ${orderResult.message || "Vérifiez l'ID."}`;
          break;
        case 'idempotency_conflict':
          toastTitle = "Déjà Traité";
          userMessage = `Conflit: ${orderResult.message || "Cette requête a déjà été traitée."}`;
          // Treat as success for UI reset
          setOrderItems([]);
          setCardId('');
          setCurrentTotal(0);
          previousOrderRef.current = '';
          break;
        case 'invalid_input':
          toastTitle = "Erreur de Données";
          userMessage = `Données invalides: ${orderResult.message}`;
          break;
        case 'error': // Generic error from processBarOrder
        default:
          userMessage = attempt > MAX_RETRIES ? `Échec après ${MAX_RETRIES} essais: ${userMessage}` : userMessage;
          break;
      }
      toast({ title: toastTitle, description: userMessage, variant: orderResult.status === 'idempotency_conflict' ? "default" : "destructive" });
      setErrorMessage(userMessage);
      logger.error('Order processing failed', { ...payload, status: orderResult.status, message: orderResult.message, attempt });
      if (orderResult.status !== 'idempotency_conflict') setCurrentClientRequestId(''); // Clear unless it's a conflict we might want to show

    } catch (error: any) { // Catch errors from the invoke call itself (e.g. network down before reaching function)
      logger.error('Critical error during executeBarOrder:', error, { ...payload, attempt });
      if (attempt <= MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, attempt - 1)));
        return executeBarOrder(payload, attempt + 1);
      }
      setPaymentStatus('error');
      setErrorMessage("Une erreur réseau critique s'est produite. Veuillez réessayer.");
      toast({ title: "Erreur Réseau Critique", description: `Échec après ${MAX_RETRIES} essais.`, variant: "destructive" });
      setCurrentClientRequestId(''); // Clear after final failure
    } finally {
      setBarConfirmDialogOpen(false);
      setPendingBarOrderPayload(null);
      // Do not reset paymentStatus here if it's success/error/conflict, only if it was processing/retrying and failed to transition
      if (paymentStatus === 'processing' || paymentStatus === 'retrying') {
         // If it's still processing/retrying, it means an unhandled case or early exit, set to idle or error
         // This path should ideally not be hit if all states are handled.
      }
    }
  };


  // Initiates the payment process, handles validation and confirmation dialog
  const processPayment = async (cardIdToProcess: string, totalAmountToProcess: number) => {
    if (orderItems.length === 0) {
      setErrorMessage("Commande vide. Veuillez ajouter des produits.");
      logger.warn('Payment attempted with empty order');
      return;
    }

    setPaymentStatus('processing'); // Initial status
    setErrorMessage(null);

    // Validate total amount
    if (totalAmountToProcess === 0 && orderItems.length > 0) {
      logger.error("ERROR: Total amount is 0 but order has items!", { orderItems });
      // Fallback calculation (should ideally not be needed if currentTotal is always correct)
      totalAmountToProcess = calculateTotal();
      logger.info('Recalculated total as fallback for processPayment:', totalAmountToProcess);
    }
    if (totalAmountToProcess <= 0 && orderItems.some(item => !item.is_return)) {
      logger.error("CRITICAL ERROR: Total is zero or negative but has non-return items!", {
        total: totalAmountToProcess,
        orderItems: orderItems.filter(item => !item.is_return)
      });
      setErrorMessage("Erreur de calcul. Le montant total est incorrect.");
      setPaymentStatus('error');
      return;
    }

    const opClientRequestId = currentClientRequestId || uuidv4();
    if (!currentClientRequestId) {
      setCurrentClientRequestId(opClientRequestId);
    }
    
    const formattedItems = orderItems.map(item => ({
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.price,
      name: item.product_name,
      is_deposit: item.is_deposit || false,
      is_return: item.is_return || false
    }));

    const payload: ProcessBarOrderPayload = {
      card_id: cardIdToProcess.trim(),
      total_amount: totalAmountToProcess,
      items: formattedItems,
      client_request_id: opClientRequestId,
      point_of_sale: "bar_main_terminal_1" // Or make this dynamic
    };

    logger.payment('payment_started', { ...payload }); // Changed event type

    if (totalAmountToProcess > BAR_ORDER_CONFIRMATION_THRESHOLD) {
      setPendingBarOrderPayload(payload);
      setBarConfirmDialogOpen(true);
    } else {
      executeBarOrder(payload);
    }
  };

  const handleConfirmBarOrder = () => {
    if (pendingBarOrderPayload) {
      executeBarOrder(pendingBarOrderPayload);
    }
    // setBarConfirmDialogOpen(false); // executeBarOrder will handle this in finally
  };

  const handleCancelBarOrder = () => {
    setBarConfirmDialogOpen(false);
    setPendingBarOrderPayload(null);
    setPaymentStatus('idle'); // Reset status
    // Do not clear currentClientRequestId here, user might retry manually
    toast({ title: "Commande annulée", description: "La transaction n'a pas été effectuée.", variant: "default"});
  };


  // Handler for NFC scanning button
  const handleNfcToggle = async () => {
    try {
      if (nfcState === 'SCANNING' || nfcState === 'COOLDOWN') {
        console.log("Stopping NFC scanner (current state: " + nfcState + ")");
        stopScan();
      } else {
        console.log("Starting NFC scanner (current state: " + nfcState + ")");
        setErrorMessage(null); // Reset errors
        // previousOrderRef.current = JSON.stringify(orderItems); // Not strictly needed with new onScan
        await startScan();
      }
    } catch (error) {
      console.error("Error toggling NFC scanner:", error);
      setErrorMessage("Une erreur est survenue avec le scanner NFC.");
    }
  };
  
  const getNfcButtonText = () => {
    switch (nfcState) {
      case 'SCANNING': return "Scanner Actif (Arrêter)";
      case 'COOLDOWN': return "Cooldown (Arrêter)";
      case 'PROCESSING_INITIATED': return "Traitement NFC...";
      case 'CARD_DETECTED': return "Carte Détectée...";
      default: return "Activer Scanner NFC";
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
    <>
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
                  <button
                    className="text-xs text-red-400 hover:text-red-200"
                    onClick={handleClearOrder}
                  >
                    Effacer
                  </button>
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
                          className="text-xs text-gray-400 hover:text-red-400 px-2 py-1"
                          onClick={() => handleRemoveItem(index)}
                        >
                          -
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
                      disabled={paymentStatus === 'processing' || paymentStatus === 'retrying' || orderItems.length === 0}
                      className="w-full pl-9 py-2 rounded-md bg-white/10 border border-white/20 text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  
                  <button
                    onClick={handleNfcToggle}
                    disabled={paymentStatus === 'processing' || paymentStatus === 'retrying' || orderItems.length === 0 || !nfcIsSupported || nfcState === 'PROCESSING_INITIATED'}
                    className={`w-full mb-2 flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-white transition-colors ${
                      paymentStatus === 'processing' || paymentStatus === 'retrying' || orderItems.length === 0 || !nfcIsSupported || nfcState === 'PROCESSING_INITIATED'
                        ? "bg-gray-500 cursor-not-allowed opacity-50"
                        : (nfcState === 'SCANNING' || nfcState === 'COOLDOWN')
                          ? "bg-red-600 hover:bg-red-700"
                          : "bg-blue-600 hover:bg-blue-700"
                    }`}
                  >
                    <Scan className="h-4 w-4 mr-2" />
                    {getNfcButtonText()}
                  </button>
                   {!nfcIsSupported && nfcIsSupported !== null && (
                      <div className="bg-yellow-900/50 text-yellow-300 p-1.5 rounded-md flex items-start text-xs mt-1 mb-1">
                          <AlertCircle className="h-3 w-3 mr-1 mt-0.5 flex-shrink-0" />
                          <span>NFC non supporté.</span>
                      </div>
                  )}
                  
                  {(nfcState !== 'IDLE' && nfcIsSupported) && (
                    <div className={`p-1.5 rounded-md flex items-start text-xs mt-1 mb-1 ${
                      nfcState === 'SCANNING' ? 'bg-blue-900/50 text-blue-300' :
                      nfcState === 'CARD_DETECTED' ? 'bg-indigo-900/50 text-indigo-300' :
                      nfcState === 'PROCESSING_INITIATED' ? 'bg-green-900/50 text-green-300' :
                      nfcState === 'COOLDOWN' ? 'bg-gray-700 text-gray-300' :
                      nfcState === 'ERROR' ? 'bg-red-900/50 text-red-300' : ''
                    }`}>
                      {nfcState === 'SCANNING' && orderItems.length === 0 && <span>Ajoutez des produits</span>}
                      {nfcState === 'SCANNING' && orderItems.length > 0 && <span>Présentez une carte - <strong>{currentTotal.toFixed(2)}€</strong></span>}
                      {nfcState === 'CARD_DETECTED' && <span>Carte détectée...</span>}
                      {nfcState === 'PROCESSING_INITIATED' && <span>Traitement NFC...</span>}
                      {nfcState === 'COOLDOWN' && <span>Cooldown NFC. Retirez la carte.</span>}
                      {nfcState === 'ERROR' && <span>Erreur NFC: {nfcErrorDetails || "Réessayez."}</span>}
                    </div>
                  )}
                  
                  {(paymentStatus === 'processing' || paymentStatus === 'retrying') && (
                    <div className="mt-1 flex items-center justify-center text-white">
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      <span className="text-xs">{paymentStatus === 'retrying' ? 'Nouvel essai...' : 'Traitement...'}</span>
                    </div>
                  )}
                  
                  {errorMessage && paymentStatus === 'error' && (
                    <div className="mt-1 bg-red-900/50 text-red-300 p-1.5 rounded-md flex items-start text-xs">
                      <AlertCircle className="h-3 w-3 mr-1 mt-0.5 flex-shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}
                   {paymentStatus === 'conflict' && errorMessage && (
                     <div className="mt-1 bg-orange-900/50 text-orange-300 p-1.5 rounded-md flex items-start text-xs">
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

      <AlertDialog open={isBarConfirmDialogOpen} onOpenChange={setBarConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la commande</AlertDialogTitle>
            <AlertDialogDescription>
              Vous êtes sur le point de valider une commande d'un montant de {pendingBarOrderPayload?.total_amount?.toFixed(2)}€ pour la carte {pendingBarOrderPayload?.card_id}.
              <br />
              Voulez-vous continuer?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelBarOrder}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmBarOrder}>Confirmer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
