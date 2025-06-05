import React, { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BarOrder, processBarOrder, ProcessBarOrderPayload } from '@/lib/supabase'; // Added ProcessBarOrderPayload
import { toast } from '@/hooks/use-toast';
import { ArrowLeft, CreditCard, CheckCircle, AlertCircle, Loader2, Euro, Scan, WifiOff } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNfc, NfcState } from '@/hooks/use-nfc';
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

const BAR_PAYMENT_CONFIRMATION_THRESHOLD = 50; // EUR

interface BarPaymentFormProps {
  order: BarOrder; // This likely contains items and total_amount
  onBack: () => void;
  onComplete: () => void;
}

// Define the expected structure of the response from the Edge Function
interface ProcessBarOrderResponse {
  status: 'success' | 'error' | 'card_not_found' | 'insufficient_funds' | 'idempotency_conflict' | 'invalid_input';
  message: string;
  order_id?: string;
  new_balance?: number;
  previous_balance?: number;
  client_request_id?: string;
}


export const BarPaymentForm: React.FC<BarPaymentFormProps> = ({
  order,
  onBack,
  onComplete
}) => {
  const [cardId, setCardId] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [processedOrderId, setProcessedOrderId] = useState<string | null>(null);
  const [finalBalance, setFinalBalance] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const [clientRequestId, setClientRequestId] = useState<string | null>(null); // This will hold the ID for the current logical operation
  const currentOrderAttemptIdRef = useRef<string | null>(null); // Tracks ID for a specific submit attempt (including its retries)

  // Confirmation Dialog State
  const [isConfirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pendingOrderPayloadForConfirmation, setPendingOrderPayloadForConfirmation] = useState<ProcessBarOrderPayload | null>(null);


  const getCurrentTotal = (): number => {
    return order.total_amount;
  };

  const {
    nfcState,
    startScan,
    stopScan,
    isSupported: nfcIsSupported,
    errorDetails: nfcErrorDetails
  } = useNfc({
    validateId: (id) => /^[a-zA-Z0-9]{8}$/.test(id),
    onScan: (scannedId) => {
      console.log("[NFC Scan] Card scanned with ID:", scannedId);
      setCardId(scannedId);
      handlePaymentWithId(scannedId); // This will call handleSubmit
    },
    scan_location_context: 'bar_payment_terminal_1',
    cooldownDuration: 3000,
  });

  useEffect(() => {
    if (nfcErrorDetails) {
      setErrorMessage(`Erreur NFC: ${nfcErrorDetails}`);
    }
  }, [nfcErrorDetails]);
  
  const resetFormState = () => {
    setCardId('');
    setIsProcessing(false);
    setPaymentSuccess(false);
    setProcessedOrderId(null);
    setFinalBalance(null);
    setErrorMessage(null);
    setClientRequestId(null);
    currentOrderAttemptIdRef.current = null;
    setPendingOrderPayloadForConfirmation(null);
    setConfirmDialogOpen(false);
    if (nfcState === 'SCANNING' || nfcState === 'COOLDOWN') {
      stopScan();
    }
  };

  const handleBack = () => {
    resetFormState();
    onBack();
  };

  const handleComplete = () => {
    resetFormState();
    onComplete();
  };
  
  useEffect(() => {
    console.log("BarPaymentForm initialized with total amount:", getCurrentTotal());
    return () => {
      if (nfcState === 'SCANNING' || nfcState === 'COOLDOWN') {
        stopScan();
      }
    };
  }, []);

  const handleCardIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCardId(e.target.value);
    setErrorMessage(null);
  };

  // This is called by NFC scan or manual submit button
  const handlePaymentWithId = async (id: string) => {
    setCardId(id); // Ensure cardId state is updated
    await handleSubmit(); // Call the main submission logic
  };
  
  // Core logic for processing the payment, including retries
  const executePaymentProcessing = async (payload: ProcessBarOrderPayload) => {
    setIsProcessing(true);
    setErrorMessage(null);
    
    const maxRetries = 2; // Max 2 retries (total 3 attempts)
    let retryCount = 0;
    let shouldRetry = false;

    // Use the client_request_id from the payload, which was set in handleSubmit
    const currentAttemptRequestId = payload.client_request_id;

    do {
      if (retryCount > 0) {
        const backoffTime = Math.min(2 ** retryCount * 1000, 8000); // 1s, 2s, 4s
        console.log(`Network error or retryable issue. Retry ${retryCount}/${maxRetries} after ${backoffTime}ms backoff for client_request_id: ${currentAttemptRequestId}`);
        setErrorMessage(`Problème de connexion. Nouvelle tentative (${retryCount}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
      
      try {
        console.log(`Calling processBarOrder (attempt ${retryCount + 1}) with payload:`, payload);
        const result: ProcessBarOrderResponse = await processBarOrder(payload);
        console.log("processBarOrder response:", result);

        shouldRetry = false;

        switch (result.status) {
          case 'success':
            setPaymentSuccess(true);
            setProcessedOrderId(result.order_id || null);
            setFinalBalance(result.new_balance !== undefined ? result.new_balance : null);
            toast({
              title: "Paiement Réussi",
              description: `${result.message} (ID Commande: ${result.order_id}). Nouveau solde: ${result.new_balance?.toFixed(2)}€`
            });
            currentOrderAttemptIdRef.current = null;
            setClientRequestId(null); // Clear logical operation ID on full success
            break;
          case 'insufficient_funds':
            setErrorMessage(result.message || `Solde insuffisant. La carte dispose de ${result.previous_balance?.toFixed(2)}€ mais le total est de ${payload.total_amount.toFixed(2)}€.`);
            currentOrderAttemptIdRef.current = null;
            setClientRequestId(null);
            break;
          case 'card_not_found':
            setErrorMessage(result.message || "Carte non trouvée. Veuillez vérifier l'ID de la carte.");
            currentOrderAttemptIdRef.current = null;
            setClientRequestId(null);
            break;
          case 'idempotency_conflict':
            setPaymentSuccess(true);
            setProcessedOrderId(result.order_id || null);
            setFinalBalance(result.new_balance !== undefined ? result.new_balance : null);
            toast({
              title: "Conflit d'Idempotence",
              description: result.message || "Cette requête a déjà été traitée.",
              variant: "default"
            });
            currentOrderAttemptIdRef.current = null;
            setClientRequestId(null); // Clear as the original op is resolved
            break;
          case 'invalid_input':
             setErrorMessage(`Erreur de validation: ${result.message || 'Données invalides.'}`);
             currentOrderAttemptIdRef.current = null;
             setClientRequestId(null);
             break;
          case 'error':
            if ((result.message?.toLowerCase().includes('network error') || result.message?.toLowerCase().includes('failed to fetch')) && retryCount < maxRetries) {
              shouldRetry = true;
              retryCount++;
            } else {
              setErrorMessage(`Erreur serveur: ${result.message || 'Erreur inconnue.'} ${retryCount >= maxRetries ? "(après plusieurs essais)" : ""}`);
              currentOrderAttemptIdRef.current = null;
              setClientRequestId(null); // Clear on final error
            }
            break;
          default:
            setErrorMessage(`Réponse inattendue: ${result.message || 'Statut inconnu.'}`);
            currentOrderAttemptIdRef.current = null;
            setClientRequestId(null);
            break;
        }
      } catch (error: any) { // Client-side errors (e.g. network totally down)
        console.error('Client-side error processing payment:', error);
        if (retryCount < maxRetries) {
          shouldRetry = true;
          retryCount++;
        } else {
          setErrorMessage("Erreur réseau majeure après plusieurs tentatives. Vérifiez votre connexion.");
          currentOrderAttemptIdRef.current = null;
          setClientRequestId(null);
        }
      }
    } while (shouldRetry && retryCount <= maxRetries);

    if (!paymentSuccess && retryCount > maxRetries) {
       setErrorMessage("Échec du traitement après plusieurs tentatives. Veuillez réessayer.");
       currentOrderAttemptIdRef.current = null;
       setClientRequestId(null);
    }
    
    setIsProcessing(false);
    setConfirmDialogOpen(false); // Ensure dialog is closed
    setPendingOrderPayloadForConfirmation(null);
  };

  // Entry point for submission (form submit or NFC scan)
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (!cardId.trim()) {
      setErrorMessage("Veuillez entrer ou scanner un ID de carte.");
      return;
    }

    // Generate a client_request_id for this logical operation if one doesn't exist
    // This ID will persist across confirmations and retries for THIS specific order attempt.
    const operationClientRequestId = clientRequestId || uuidv4();
    if (!clientRequestId) {
      setClientRequestId(operationClientRequestId);
    }
    currentOrderAttemptIdRef.current = operationClientRequestId; // Also use it for the current attempt ref

    const currentTotal = getCurrentTotal();
    const formattedItems = order.items.map(item => ({
      product_id: item.product_id || 0,
      quantity: item.quantity,
      unit_price: item.price,
      name: item.product_name,
      is_deposit: item.is_deposit || false,
      is_return: item.is_return || false,
    }));

    const payload: ProcessBarOrderPayload = {
      card_id: cardId.trim(),
      total_amount: currentTotal,
      items: formattedItems,
      client_request_id: operationClientRequestId, // Use the persistent ID for this operation
      point_of_sale: "BAR_KIOSK_1" // Or make dynamic
    };
    
    console.log(`Initiating payment for card ${cardId} with total: ${currentTotal}, client_request_id: ${operationClientRequestId}`);

    if (currentTotal > BAR_PAYMENT_CONFIRMATION_THRESHOLD) {
      setPendingOrderPayloadForConfirmation(payload);
      setConfirmDialogOpen(true);
    } else {
      executePaymentProcessing(payload);
    }
  };

  const handleConfirmPayment = () => {
    if (pendingOrderPayloadForConfirmation) {
      executePaymentProcessing(pendingOrderPayloadForConfirmation);
    }
  };

  const handleCancelPaymentConfirmation = () => {
    setConfirmDialogOpen(false);
    setPendingOrderPayloadForConfirmation(null);
    setIsProcessing(false); // Stop processing indicator
    // Do not clear clientRequestId here, as the user might want to retry the same logical operation.
    // currentOrderAttemptIdRef.current will be reset if they try a new submission.
    toast({title: "Paiement annulé", description: "La transaction n'a pas été effectuée.", variant: "default"});
  };


  if (paymentSuccess) {
    return (
      <Card className="bg-white/90 shadow-lg">
        <CardContent className={`${isMobile ? 'p-4' : 'p-8'} flex flex-col items-center`}>
          <CheckCircle className={`${isMobile ? 'h-12 w-12 mb-3' : 'h-16 w-16 mb-4'} text-green-500`} />
          <h3 className={`${isMobile ? 'text-xl' : 'text-2xl'} font-semibold mb-2 text-center`}>Paiement Traité!</h3>
          <p className="text-gray-600 mb-4 sm:mb-6 text-center">
            {processedOrderId ? `Commande ${processedOrderId} traitée.` : 'La commande a été traitée.'}
          </p>
          
          <div className="bg-gray-100 p-3 sm:p-4 rounded-lg w-full max-w-md mb-4 sm:mb-6">
            <div className="grid grid-cols-2 gap-2 sm:gap-4 text-sm sm:text-base">
              <div className="text-gray-600">ID de carte:</div>
              <div className="font-medium">{cardId}</div>
              
              {/* Display previous balance if available from response, otherwise calculate */}
              {/* For now, let's assume new_balance is the primary source of truth post-payment */}
              <div className="text-gray-600">Montant payé:</div>
              <div className="font-medium">{getCurrentTotal().toFixed(2)}€</div>
              
              {finalBalance !== null && (
                <>
                  <div className="text-gray-600">Nouveau solde:</div>
                  <div className="font-medium">{finalBalance.toFixed(2)}€</div>
                </>
              )}
            </div>
          </div>
          
          <Button onClick={handleComplete} size={isMobile ? "default" : "lg"}>
            Nouvelle commande
          </Button>
        </CardContent>
      </Card>
    );
  }
  
  const getNfcStatusMessage = () => {
    switch (nfcState) {
      case 'IDLE':
        return "Prêt à scanner. Cliquez pour activer NFC.";
      case 'SCANNING':
        return "Scanning... Approchez la carte NFC.";
      case 'CARD_DETECTED':
        return "Carte détectée, lecture en cours...";
      case 'VALIDATING_CARD':
        return "Validation de la carte...";
      case 'PROCESSING_INITIATED':
        return "Paiement initié via NFC...";
      case 'COOLDOWN':
        return "Cooldown NFC. Retirez la carte et attendez.";
      case 'ERROR':
        return `Erreur NFC: ${nfcErrorDetails || 'Veuillez réessayer.'}`;
      default:
        return "Statut NFC inconnu.";
    }
  };

  return (
    <>
      <Card className="bg-white/90 shadow-lg">
        <CardContent className={`${isMobile ? 'p-3 sm:p-4' : 'p-6'}`}>
          <div className="flex items-center mb-4 sm:mb-6">
            <Button variant="ghost" onClick={handleBack} className="mr-2 p-1.5 sm:p-2">
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
                        placeholder="Entrez l'ID ou scannez"
                        className="pl-10"
                        disabled={isProcessing || nfcState === 'SCANNING' || nfcState === 'PROCESSING_INITIATED'}
                        required
                      />
                    </div>
                  </div>
                  
                  {nfcIsSupported !== null && (
                    <Button
                      type="button"
                      onClick={nfcState === 'SCANNING' || nfcState === 'COOLDOWN' ? stopScan : startScan}
                      variant={(nfcState === 'SCANNING' || nfcState === 'COOLDOWN') ? "destructive" : "outline"}
                      disabled={isProcessing || !nfcIsSupported}
                      className="w-full"
                    >
                      <Scan className="h-4 w-4 mr-2" />
                      {nfcState === 'SCANNING' ? "Arrêter le scan NFC" :
                       nfcState === 'COOLDOWN' ? "Scan en Cooldown (Cliquer pour arrêter)" :
                       "Activer le scan NFC"}
                    </Button>
                  )}
                   {!nfcIsSupported && nfcIsSupported !== null && (
                      <div className="bg-yellow-100 text-yellow-800 p-2 sm:p-3 rounded-md flex items-start text-sm sm:text-base mt-2">
                          <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 mr-2 mt-0.5 flex-shrink-0" />
                          <span>NFC non supporté sur cet appareil/navigateur.</span>
                      </div>
                  )}
                  
                  {(nfcState !== 'IDLE' && nfcState !== 'ERROR' && nfcIsSupported) && (
                    <div className={`p-2 sm:p-3 rounded-md flex items-start text-sm sm:text-base mt-2 ${
                      nfcState === 'SCANNING' ? 'bg-blue-100 text-blue-800' :
                      nfcState === 'CARD_DETECTED' ? 'bg-indigo-100 text-indigo-800' :
                      nfcState === 'VALIDATING_CARD' ? 'bg-purple-100 text-purple-800' :
                      nfcState === 'PROCESSING_INITIATED' ? 'bg-green-100 text-green-800' :
                      nfcState === 'COOLDOWN' ? 'bg-gray-100 text-gray-800' : ''
                    }`}>
                      <span>{getNfcStatusMessage()}</span>
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
                    disabled={isProcessing || !cardId.trim() || nfcState === 'SCANNING' || nfcState === 'PROCESSING_INITIATED' || nfcState === 'COOLDOWN'}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                        Traitement...
                      </>
                    ) : (
                      "Payer Manuellement"
                    )}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={isConfirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer le Paiement</AlertDialogTitle>
            <AlertDialogDescription>
              Vous êtes sur le point de payer {pendingOrderPayloadForConfirmation?.total_amount?.toFixed(2)}€ pour la carte {pendingOrderPayloadForConfirmation?.card_id}.
              <br />
              Voulez-vous continuer?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelPaymentConfirmation}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmPayment}>Confirmer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
