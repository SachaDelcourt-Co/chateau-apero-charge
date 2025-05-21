import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BarOrder, getTableCardById, processBarOrder } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import { ArrowLeft, CreditCard, CheckCircle, AlertCircle, Loader2, Euro, Scan } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNfc } from '@/hooks/use-nfc';

interface BarPaymentFormProps {
  order: BarOrder;
  onBack: () => void;
  onComplete: () => void;
}

export const BarPaymentForm: React.FC<BarPaymentFormProps> = ({
  order,
  onBack,
  onComplete
}) => {
  const [cardId, setCardId] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [cardBalance, setCardBalance] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isMobile = useIsMobile();
  
  // Get the current total amount (direct from order props to ensure it's always current)
  const getCurrentTotal = (): number => {
    return order.total_amount;
  };
  
  // Initialize NFC hook with a validation function and scan handler
  const { isScanning, startScan, stopScan, isSupported } = useNfc({
    // Validate that ID is 8 characters long
    validateId: (id) => id.length === 8,
    // Handle scanned ID with a forced refresh before payment
    onScan: (id) => {
      console.log("[NFC Scan] Card scanned with ID:", id);
      // Set card ID immediately for UI feedback
      setCardId(id);
      
      // Force a refresh of the total amount
      const refreshedTotal = getCurrentTotal();
      console.log("[NFC Scan] Force refreshed total:", refreshedTotal);
      
      // Short delay to ensure all state updates are processed
      setTimeout(() => {
        // Get the latest total again after refresh
        const finalTotal = getCurrentTotal();
        console.log("[NFC Scan] Final total amount for payment:", finalTotal);
        
        // Process payment with the final current total
        handlePaymentWithId(id);
      }, 100);
    },
    // Provide a callback to get the latest total at scan time
    getTotalAmount: getCurrentTotal
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

  // Log the total amount when the component mounts to aid debugging
  useEffect(() => {
    console.log("BarPaymentForm initialized with total amount:", getCurrentTotal());
  }, []);

  const handleCardIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCardId(e.target.value);
    setErrorMessage(null); // Clear any previous errors
  };

  const handlePaymentWithId = async (id: string) => {
    // Create a synthetic form event
    const syntheticEvent = {
      preventDefault: () => {}
    } as React.FormEvent;
    
    // Call the submit handler with the ID already set
    await handleSubmit(syntheticEvent);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setErrorMessage(null);
    
    // Do one final refresh to get the most current total
    const currentTotal = getCurrentTotal();
    console.log("Processing payment with total:", currentTotal);

    // Rate limit handling variables
    const maxRetries = 5;
    let retryCount = 0;
    let shouldRetry = false;

    do {
      // If this is a retry, add an exponential backoff delay
      if (retryCount > 0) {
        const backoffTime = Math.min(2 ** retryCount * 500, 10000); // 500ms, 1s, 2s, 4s, 8s up to max 10s
        console.log(`Rate limit hit. Retry ${retryCount}/${maxRetries} after ${backoffTime}ms backoff`);
        setErrorMessage(`Trop de requêtes. Nouvelle tentative dans ${backoffTime/1000} secondes... (${retryCount}/${maxRetries})`);
        resetScan("rate limit error");
        
        // Wait for the backoff time
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
      
      try {
        // Process the order with the current total amount - get it one more time for absolute certainty
        const finalTotal = getCurrentTotal();
        
        // Prepare formatted items for the Edge Function
        const formattedItems = order.items.map(item => ({
          product_id: 0, // Not used in the DB but required for the Edge Function format
          quantity: item.quantity,
          unit_price: item.price,
          name: item.product_name,
          is_deposit: item.is_deposit,
          is_return: item.is_return
        }));

        // Call the Edge Function
        const orderResult = await processBarOrder({
          card_id: cardId.trim(),
          total_amount: finalTotal,
          items: formattedItems
        });

        if (orderResult.success) {
          setPaymentSuccess(true);
          
          toast({
            title: "Paiement réussi",
            description: `La commande a été traitée avec succès. Nouveau solde: ${orderResult.new_balance?.toFixed(2)}€`
          });
          
          // Store the balance to display it on success screen
          if (orderResult.previous_balance !== undefined) {
            setCardBalance(orderResult.previous_balance.toString());
          }
          
          // Operation successful, no need to retry
          shouldRetry = false;
        } else {
          // Handle specific error cases
          if (orderResult.error?.includes('Insufficient funds')) {
            // Show toast for insufficient balance with data from transaction
            if (orderResult.previous_balance !== undefined) {
              setErrorMessage(`Solde insuffisant. La carte dispose de ${orderResult.previous_balance.toFixed(2)}€ mais le total est de ${finalTotal.toFixed(2)}€.`);
            } else {
              setErrorMessage("Solde insuffisant sur la carte.");
            }
            shouldRetry = false;
          } else if (orderResult.error?.includes('Card not found')) {
            setErrorMessage("Carte non trouvée. Veuillez vérifier l'ID de la carte.");
            shouldRetry = false;
          } else if (orderResult.error?.includes('rate limit') || orderResult.error?.includes('too many requests')) {
            shouldRetry = true;
            retryCount++;
            console.log('Rate limit detected in order result, will retry');
          } else {
            // Some other error
            setErrorMessage(`Erreur lors du traitement de la commande: ${orderResult.error || 'Erreur inconnue'}`);
            shouldRetry = false;
          }
        }
      } catch (error: any) {
        console.error('Error processing payment:', error);
        
        // Check if error is a rate limit error
        if (error?.status === 429 || error?.message?.includes('rate limit') || error?.message?.includes('too many requests')) {
          console.log('Rate limit error detected, will retry');
          shouldRetry = true;
          retryCount++;
        } else {
          setErrorMessage("Une erreur s'est produite. Veuillez réessayer.");
          resetScan("order processing error");
          shouldRetry = false;
        }
      }
    } while (shouldRetry && retryCount <= maxRetries);

    // If we exited the loop due to max retries
    if (retryCount > maxRetries) {
      setErrorMessage("Le service est momentanément surchargé. Veuillez réessayer dans quelques instants.");
      resetScan("max retries");
    }

    setIsProcessing(false);
  };

  if (paymentSuccess) {
    const newBalance = parseFloat(cardBalance || '0') - getCurrentTotal();
    
    return (
      <Card className="bg-white/90 shadow-lg">
        <CardContent className={`${isMobile ? 'p-4' : 'p-8'} flex flex-col items-center`}>
          <CheckCircle className={`${isMobile ? 'h-12 w-12 mb-3' : 'h-16 w-16 mb-4'} text-green-500`} />
          <h3 className={`${isMobile ? 'text-xl' : 'text-2xl'} font-semibold mb-2 text-center`}>Paiement réussi!</h3>
          <p className="text-gray-600 mb-4 sm:mb-6 text-center">
            La commande a été traitée avec succès.
          </p>
          
          <div className="bg-gray-100 p-3 sm:p-4 rounded-lg w-full max-w-md mb-4 sm:mb-6">
            <div className="grid grid-cols-2 gap-2 sm:gap-4 text-sm sm:text-base">
              <div className="text-gray-600">ID de carte:</div>
              <div className="font-medium">{cardId}</div>
              
              <div className="text-gray-600">Ancien solde:</div>
              <div className="font-medium">{parseFloat(cardBalance || '0').toFixed(2)}€</div>
              
              <div className="text-gray-600">Montant payé:</div>
              <div className="font-medium">{getCurrentTotal().toFixed(2)}€</div>
              
              <div className="text-gray-600">Nouveau solde:</div>
              <div className="font-medium">{newBalance.toFixed(2)}€</div>
            </div>
          </div>
          
          <Button onClick={onComplete} size={isMobile ? "default" : "lg"}>
            Nouvelle commande
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white/90 shadow-lg">
      <CardContent className={`${isMobile ? 'p-3 sm:p-4' : 'p-6'}`}>
        <div className="flex items-center mb-4 sm:mb-6">
          <Button variant="ghost" onClick={onBack} className="mr-2 p-1.5 sm:p-2">
            <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
          <h3 className="text-lg sm:text-xl font-semibold">Paiement</h3>
        </div>
        
        <div className="grid md:grid-cols-2 gap-4 sm:gap-8">
          <div>
            <h4 className="text-base sm:text-lg font-medium mb-2 sm:mb-3">Récapitulatif</h4>
            <div className="bg-gray-100 p-3 sm:p-4 rounded-lg mb-4">
              <div className="space-y-2 text-sm sm:text-base">
                {order.items.map((item, index) => (
                  <div key={index} className="flex justify-between">
                    <span className="truncate pr-2">
                      {item.product_name} {item.quantity > 1 ? `(x${item.quantity})` : ''}
                    </span>
                    <span className={`${item.is_return ? 'text-green-600 font-medium' : ''} whitespace-nowrap`}>
                      {item.is_return 
                        ? `-${(item.price * item.quantity).toFixed(2)}€`
                        : `${(item.price * item.quantity).toFixed(2)}€`}
                    </span>
                  </div>
                ))}
                <div className="border-t pt-2 mt-2 flex justify-between font-bold">
                  <span>Total</span>
                  <span className="flex items-center">
                    <Euro className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                    {getCurrentTotal().toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          <div>
            <form onSubmit={handleSubmit}>
              <div className="space-y-3 sm:space-y-4">
                <div>
                  <Label htmlFor="card-id">ID de la carte</Label>
                  <div className="relative mt-1">
                    <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <Input 
                      id="card-id"
                      value={cardId}
                      onChange={handleCardIdChange}
                      placeholder="Entrez l'ID de la carte"
                      className="pl-10"
                      disabled={isProcessing}
                      required
                    />
                  </div>
                </div>
                
                <Button
                  type="button"
                  onClick={isScanning ? stopScan : startScan}
                  variant={isScanning ? "destructive" : "outline"}
                  disabled={isProcessing || !isSupported}
                  className="w-full"
                >
                  <Scan className="h-4 w-4 mr-2" />
                  {isScanning ? "Arrêter le scan NFC" : "Activer le scan NFC pour payer"}
                </Button>
                
                {isScanning && (
                  <div className="bg-blue-100 text-blue-800 p-2 sm:p-3 rounded-md flex items-start text-sm sm:text-base mt-2">
                    <span>Scanner votre carte NFC maintenant pour payer {getCurrentTotal().toFixed(2)}€</span>
                  </div>
                )}
                
                {errorMessage && (
                  <div className="bg-red-100 text-red-800 p-2 sm:p-3 rounded-md flex items-start text-sm sm:text-base">
                    <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 mr-2 mt-0.5 flex-shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}
                
                <Button 
                  type="submit" 
                  className="w-full" 
                  size={isMobile ? "default" : "lg"}
                  disabled={isProcessing || !cardId.trim()}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                      Traitement...
                    </>
                  ) : (
                    "Payer maintenant"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
