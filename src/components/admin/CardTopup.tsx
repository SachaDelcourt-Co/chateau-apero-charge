import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CreditCard, CheckCircle, Scan, Info, AlertCircle, User, MapPin, ShoppingCart } from "lucide-react"; // Added User, MapPin, ShoppingCart
import { getTableCardById } from '@/lib/supabase'; // Removed updateTableCardAmount
import { supabase } from "@/integrations/supabase/client";
// import { Checkbox } from "@/components/ui/checkbox"; // Commented out as paidByCard is removed for now, can be re-added if needed for payment_method_at_checkpoint
import { useNfc } from '@/hooks/use-nfc';
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { logger } from '@/lib/logger';
import { v4 as uuidv4 } from 'uuid'; // Added uuid
import { useAuth } from '@/hooks/use-auth'; // Added useAuth

// Define state types for better type safety
type RechargeStatus = 'idle' | 'checking' | 'processing' | 'retrying' | 'success' | 'error' | 'conflict'; // Added 'retrying', 'conflict'

interface CardTopupProps {
  onSuccess?: () => void;
  // staffId?: string; // Example if passed as prop
  // checkpointId?: string; // Example if passed as prop
}

const CardTopup: React.FC<CardTopupProps> = ({ onSuccess }) => {
  const { user } = useAuth(); // Get user from auth context

  // Basic form state
  const [cardId, setCardId] = useState('');
  const [amount, setAmount] = useState('');
  // const [paidByCard, setPaidByCard] = useState(false); // Removed for now, payment_method_at_checkpoint will handle this

  // New state for checkpoint recharge
  const [staffId, setStaffId] = useState(user?.id || ''); // Initialize with logged-in user ID if available
  const [checkpointId, setCheckpointId] = useState('CP01'); // Default or make it configurable
  const [paymentMethodAtCheckpoint, setPaymentMethodAtCheckpoint] = useState('CASH_CHECKPOINT'); // Default
  const [clientRequestId, setClientRequestId] = useState(''); // Persists through retries for a single operation

  // Confirmation Dialog State
  const [isConfirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pendingRechargePayload, setPendingRechargePayload] = useState<any>(null);


  // Advanced state management
  const [status, setStatus] = useState<RechargeStatus>('idle');
  const [cardInfo, setCardInfo] = useState<any>(null);
  const [currentAmount, setCurrentAmount] = useState<string | null>(null);
  const [originalBalance, setOriginalBalance] = useState<number | null>(null);
  // const [transactionId, setTransactionId] = useState<string>(''); // clientRequestId will serve a similar purpose for idempotency
  const [errorMessage, setErrorMessage] = useState<string>('');
  
  const { toast } = useToast();
  
  // Initialize NFC hook with a validation function and scan handler
  const { nfcState, startScan, stopScan, isSupported } = useNfc({
    // Validate that ID is 8 characters long
    validateId: (id) => id.length === 8,
    // Handle scanned ID
    onScan: (id, rawData) => { // rawData is now available
      console.log('[CardTopup] NFC card scanned with ID:', id, 'Raw Data:', rawData);
      setCardId(id);
      
      // Log the NFC scan attempt for recharging (using the hook's internal logging now, but can keep this for component-specific context if needed)
      // logger.recharge('recharge_scan_attempt', {
      //   cardId: id,
      //   timestamp: new Date().toISOString()
      // });
      
      checkCardBalance(id);
      // Optional: toast to indicate successful scan
      toast({
        title: "Carte détectée",
        description: `ID de carte: ${id}`,
      });

      // stopScan(); // The hook now manages its state and cooldown, explicit stop might not be needed here unless specific UX requires it.
                   // If scan should stop and wait for user action, then call stopScan().
                   // For continuous scanning after processing, the hook handles it.
    },
    scan_location_context: 'admin_card_topup', // Added scan_location_context
  });

  // Effect to check card balance when card ID changes
  useEffect(() => {
    if (cardId.length === 8) {
      checkCardBalance(cardId);
    } else {
      setCardInfo(null);
      setCurrentAmount(null);
    }
  }, [cardId]);

  // Debug effect to log NFC support status
  useEffect(() => {
    console.log('[CardTopup] NFC isSupported:', isSupported);
  }, [isSupported]);

  // Effect to update staffId if user context changes
  useEffect(() => {
    if (user?.id) {
      setStaffId(user.id);
    }
  }, [user]);

  // Unified card balance checking function that logs recharge attempts
  const checkCardBalance = async (id: string) => {
    if (!id || id.length !== 8) return;
    
    setStatus('checking');
    
    try {
      // Log card validation attempt
      logger.recharge('recharge_card_validated', { cardId: id });
      
      const card = await getTableCardById(id);
      if (card) {
        setCardInfo(card);
        setCurrentAmount(card.amount?.toString() || '0');
        setOriginalBalance(parseFloat(card.amount?.toString() || '0'));
        
        // Log successful card validation
        logger.recharge('recharge_card_validated', { 
          cardId: id, 
          currentBalance: card.amount,
          success: true
        });
        
        setStatus('idle');
      } else {
        setCardInfo(null);
        setCurrentAmount(null);
        setOriginalBalance(null);
        setErrorMessage('Aucune carte avec cet identifiant n\'a été trouvée.');
        setStatus('error');
        
        // Log failed card validation
        logger.recharge('recharge_card_validated', { 
          cardId: id, 
          success: false,
          error: 'Card not found'
        });
        
        toast({
          title: "Carte non trouvée",
          description: "Aucune carte avec cet identifiant n'a été trouvée.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error checking card:', error);
      setCardInfo(null);
      setCurrentAmount(null);
      setOriginalBalance(null);
      setErrorMessage('Impossible de récupérer les informations de la carte.');
      setStatus('error');
      
      // Log error during card validation
      logger.recharge('recharge_card_validated', { 
        cardId: id, 
        success: false,
        error: String(error)
      });
      
      toast({
        title: "Erreur",
        description: "Impossible de récupérer les informations de la carte.",
        variant: "destructive"
      });
    }
  };

const RECHARGE_CONFIRMATION_THRESHOLD = 100; // EUR
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000; // Initial delay, can be exponential

// ... (component definition)

  // Actual API call logic, to be called after confirmation (if needed) or directly
  const executeRecharge = async (payload: any, attempt = 1) => {
    setStatus(attempt > 1 ? 'retrying' : 'processing');
    setErrorMessage('');

    if (attempt > 1) {
      toast({
        title: "Problème réseau",
        description: `Nouvel essai (${attempt -1}/${MAX_RETRIES})...`,
        variant: "default"
      });
    }

    logger.recharge('recharge_checkpoint_attempt', { ...payload, attempt });

    try {
      const { data, error } = await supabase.functions.invoke('process-checkpoint-recharge', {
        body: payload,
      });

      if (error) {
        logger.recharge('recharge_checkpoint_error_invoke', { ...payload, error: error.message, context: error.context, attempt });
        
        // Retriable errors: network issues or specific server errors (e.g., 503)
        // For this example, we'll consider any error that isn't a 409 (conflict) or 404 (not found) as potentially retriable.
        // In a real app, you'd check error.context.status for 503, etc.
        const isRetriableError = !error.message.includes('already processed') &&
                                 !(error.context?.status === 409) &&
                                 !(error.context?.status === 404) &&
                                 !error.message.toLowerCase().includes('network error'); // Example, adjust based on actual error shapes

        if (isRetriableError && attempt <= MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, attempt - 1))); // Exponential backoff
          return executeRecharge(payload, attempt + 1); // Retry with the same payload (and client_request_id)
        }

        // Handle non-retriable errors or max retries reached
        if (error.message.includes('already processed') || (error.context?.status === 409)) {
          setStatus('conflict');
          setErrorMessage(`Conflit: La requête avec l'ID ${payload.client_request_id} a déjà été traitée ou est en cours de traitement.`);
          toast({ title: "Recharge déjà traitée", description: "Cette demande de recharge a déjà été enregistrée.", variant: "default" });
        } else if (error.message.includes('Card not found') || (error.context?.status === 404)) {
          setStatus('error');
          setErrorMessage(`Carte non trouvée: La carte avec l'ID ${payload.card_id} n'existe pas.`);
          toast({ title: "Carte non trouvée", description: `Aucune carte avec l'ID ${payload.card_id} n'a été trouvée.`, variant: "destructive" });
        } else {
          setStatus('error');
          setErrorMessage(error.message || 'Une erreur est survenue lors de la communication avec le serveur.');
          toast({ title: "Erreur de recharge", description: `Échec après ${attempt -1 > 0 ? `${attempt-1} essais`: 'la tentative'}: ${error.message || 'Une erreur inconnue est survenue.'}`, variant: "destructive" });
        }
        return;
      }

      // Assuming success if no error
      logger.recharge('recharge_checkpoint_success', { ...payload, responseData: data, attempt });
      setStatus('success');
      
      if (data?.new_balance !== undefined) {
        setCurrentAmount(data.new_balance.toString());
      } else {
        const newBalanceOptimistic = (originalBalance || 0) + payload.recharge_amount;
        setCurrentAmount(newBalanceOptimistic.toString());
      }
      
      toast({
        title: "Carte rechargée avec succès!",
        description: `La carte ${payload.card_id} a été rechargée de ${payload.recharge_amount}€. Nouveau solde: ${currentAmount ? parseFloat(currentAmount).toFixed(2) : 'N/A'}€`,
      });

      if (onSuccess) {
        onSuccess();
      }
      setAmount('');
      // setCardId(''); // Optional: clear card ID
      setClientRequestId(''); // Clear after successful operation or final failure

    } catch (e: any) {
      logger.recharge('recharge_checkpoint_error_catch', { ...payload, error: String(e), attempt });
      
      if (attempt <= MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, attempt - 1)));
        return executeRecharge(payload, attempt + 1);
      }

      setStatus('error');
      setErrorMessage(e.message || 'Une erreur inattendue est survenue.');
      toast({ title: "Erreur critique", description: `Une erreur inattendue est survenue après ${attempt-1 > 0 ? `${attempt-1} essais`: 'la tentative'}.`, variant: "destructive" });
      setClientRequestId(''); // Clear after final failure
    } finally {
      setConfirmDialogOpen(false); // Close dialog if it was open
      setPendingRechargePayload(null);
    }
  };


  // Initiates the top-up process, handles validation and confirmation dialog
  const processTopup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!cardId || cardId.length !== 8) {
      toast({ title: "ID de carte invalide", description: "Veuillez saisir un ID de carte valide (8 caractères).", variant: "destructive" });
      return;
    }
    const rechargeAmountNumber = parseFloat(amount);
    if (!amount || rechargeAmountNumber <= 0) {
      toast({ title: "Montant invalide", description: "Veuillez saisir un montant valide supérieur à 0.", variant: "destructive" });
      return;
    }
    if (!staffId) {
      toast({ title: "ID Staff manquant", description: "L'ID du staff est requis.", variant: "destructive" });
      return;
    }
    if (!checkpointId) {
      toast({ title: "ID Checkpoint manquant", description: "L'ID du checkpoint est requis.", variant: "destructive" });
      return;
    }

    // Generate client_request_id ONCE for the entire operation (including retries)
    const currentOpClientRequestId = clientRequestId || uuidv4();
    if (!clientRequestId) {
      setClientRequestId(currentOpClientRequestId);
    }
    
    setErrorMessage('');

    if (currentAmount !== null) {
      setOriginalBalance(parseFloat(currentAmount));
    }

    const rechargePayload = {
      card_id: cardId,
      recharge_amount: rechargeAmountNumber,
      payment_method_at_checkpoint: paymentMethodAtCheckpoint,
      staff_id: staffId,
      checkpoint_id: checkpointId,
      client_request_id: currentOpClientRequestId, // Use the persistent ID
    };

    if (rechargeAmountNumber > RECHARGE_CONFIRMATION_THRESHOLD) {
      setPendingRechargePayload(rechargePayload);
      setConfirmDialogOpen(true);
    } else {
      executeRecharge(rechargePayload);
    }
  };

  const handleConfirmRecharge = () => {
    if (pendingRechargePayload) {
      executeRecharge(pendingRechargePayload);
    }
    setConfirmDialogOpen(false);
  };

  const handleCancelRecharge = () => {
    setConfirmDialogOpen(false);
    setPendingRechargePayload(null);
    setStatus('idle'); // Reset status if operation was cancelled
    // Do not clear clientRequestId here, as the user might retry the same logical operation manually
  };

  const handleReset = () => {
    setCardId('');
    setAmount('');
    // setPaidByCard(false); // Removed
    setStatus('idle');
    setCurrentAmount(null);
    setCardInfo(null);
    setOriginalBalance(null);
    setErrorMessage('');
    setClientRequestId(''); // Reset client request ID
    // Reset NFC scanning state
    if (nfcState === 'SCANNING' || nfcState === 'CARD_DETECTED' || nfcState === 'PROCESSING_INITIATED' || nfcState === 'COOLDOWN') {
      stopScan();
      // Use setTimeout to ensure scan is properly stopped before restarting
      // The new hook manages restarts better, so direct startScan might be okay or let it idle.
      setTimeout(() => {
        startScan(); // Attempt to restart scanning
      }, 100);
    } else {
      startScan(); // Attempt to start scanning if IDLE or ERROR
    }
  };

  // Reset the success message after 5 seconds
  useEffect(() => {
    let timer: number;
    if (status === 'success') {
      timer = window.setTimeout(() => {
        setStatus('idle');
      }, 5000);
    }
    return () => {
      clearTimeout(timer);
    };
  }, [status]);
  
  // Clean up on component unmount
  useEffect(() => {
    return () => {
      // Stop scanning if active when component unmounts
      // The hook's internal useEffect cleanup should handle this, but an explicit stop here is fine.
      if (nfcState !== 'IDLE' && nfcState !== 'ERROR') {
        stopScan();
      }
    };
  }, [nfcState, stopScan]);

  // Format input to allow only numbers and a decimal point
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Only allow numbers and a single decimal point
    const regex = /^(\d+)?\.?(\d{0,2})?$/;
    if (regex.test(value) || value === '') {
      setAmount(value);
    }
  };

  // Handle card ID input changes with improved validation
  const handleCardIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const id = e.target.value;
    setCardId(id);
    
    // Reset error state when user is typing
    if (status === 'error') {
      setStatus('idle');
      setErrorMessage('');
    }
    
    // Automatically check card if ID is 8 characters
    if (id.length === 8) {
      checkCardBalance(id);
    } else {
      // Clear card info if ID is not valid
      setCardInfo(null);
      setCurrentAmount(null);
      setOriginalBalance(null);
    }
  };

  // Render different content based on the current status
  const renderContent = () => {
    switch (status) {
      case 'success':
        return (
          <div className="flex flex-col items-center py-6">
            <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
            <p className="mb-2">Carte rechargée avec succès!</p>
            <p className="mb-4">
              <span className="font-medium">Numéro de carte:</span> {cardId}<br />
              <span className="font-medium">Ancien solde:</span> {originalBalance?.toFixed(2) ?? 'N/A'}€<br />
              <span className="font-medium">Montant ajouté:</span> {pendingRechargePayload?.recharge_amount || amount}€<br />
              <span className="font-medium">Nouveau solde:</span> {currentAmount ? parseFloat(currentAmount).toFixed(2) : 'N/A'}€<br />
              <span className="font-medium">ID Requête Client:</span> <span className="text-xs">{pendingRechargePayload?.client_request_id || clientRequestId}</span>
            </p>
            <Button onClick={handleReset}>Recharger une autre carte</Button>
          </div>
        );
        
      case 'error':
      case 'conflict': // Handle conflict state similarly to error but with specific message
        return (
          <div className="flex flex-col items-center py-6">
            <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
            <p className="text-red-600 font-semibold mb-2">
              {status === 'conflict' ? 'Conflit de Requête' : 'Erreur lors de la recharge'}
            </p>
            <p className="text-center mb-4">{errorMessage}</p>
            <div className="flex space-x-4">
              <Button variant="outline" onClick={handleReset}>Recommencer</Button>
              {/* The retry button here would re-trigger 'processTopup' which handles clientRequestId generation/reuse */}
              {cardInfo && status !== 'conflict' && (
                <Button onClick={() => {
                  setStatus('idle');
                  setErrorMessage('');
                  // clientRequestId is preserved by default, processTopup will reuse it if it exists
                  // or generate a new one if it was cleared (e.g. after success/final failure)
                  // For an explicit "Retry this specific failed attempt", ensure clientRequestId is set from the failed attempt.
                  // Here, we assume processTopup will handle it.
                  processTopup();
                }}>Réessayer</Button>
              )}
            </div>
          </div>
        );
       case 'retrying': // Visual feedback for retrying state
        return (
          <div className="flex flex-col items-center py-6">
            <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
            <p className="text-blue-600 font-semibold mb-2">Tentative de reconnexion...</p>
            <p className="text-center mb-4">{errorMessage || "Veuillez patienter pendant que nous réessayons de traiter votre demande."}</p>
            <Button variant="outline" onClick={handleReset}>Annuler et recommencer</Button>
          </div>
        );
      default:
        return (
          <form onSubmit={processTopup} className="space-y-6"> {/* Increased spacing */}
            {/* NFC Scan Button - Prominent placement */}
            {isSupported !== null && (
              <div className="flex justify-center mb-4">
                <Button
                  type="button"
                  onClick={nfcState === 'SCANNING' || nfcState === 'CARD_DETECTED' ? stopScan : startScan}
                  variant={(nfcState === 'SCANNING' || nfcState === 'CARD_DETECTED') ? "destructive" : "default"}
                  size="lg"
                  disabled={isSupported === false || status === 'processing' || nfcState === 'PROCESSING_INITIATED' || nfcState === 'COOLDOWN'}
                  className="w-full text-center"
                >
                  <Scan className="h-5 w-5 mr-2" />
                  {(nfcState === 'SCANNING' || nfcState === 'CARD_DETECTED') ? "Arrêter le scan NFC" :
                   (nfcState === 'COOLDOWN') ? "En attente..." :
                   (nfcState === 'PROCESSING_INITIATED') ? "Traitement..." :
                   "Scanner une carte via NFC"}
                </Button>
              </div>
            )}
            
            {isSupported === false && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>
                  Le scan NFC n'est pas disponible. Cette fonctionnalité nécessite Chrome sur Android avec HTTPS.
                </AlertDescription>
              </Alert>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="card-id">Numéro de carte</Label>
              <div className="relative">
                <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="card-id"
                  value={cardId}
                  onChange={handleCardIdChange}
                  placeholder="Entrez le numéro de la carte"
                  className="pl-10"
                  disabled={status === 'processing'}
                  maxLength={8}
                />
              </div>
              <div className="flex justify-between items-center mt-1">
                <div>
                  {status === 'checking' ? (
                    <div className="text-sm text-gray-500 flex items-center">
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Vérification...
                    </div>
                  ) : cardInfo ? (
                    <div className="text-sm text-green-600 flex items-center">
                      <Info className="h-3 w-3 mr-1" />
                      Solde actuel: <span className="font-medium ml-1">{parseFloat(currentAmount || '0').toFixed(2)}€</span>
                    </div>
                  ) : cardId.length === 8 ? (
                    <div className="text-sm text-red-600 flex items-center">
                      <Info className="h-3 w-3 mr-1" />
                      Carte non trouvée
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            
            {cardInfo && (
              <Alert className="bg-amber-50 border-amber-200">
                <AlertDescription className="text-amber-700">
                  <div className="flex flex-col space-y-1">
                    <span><strong>ID:</strong> {cardInfo.id}</span>
                  </div>
                </AlertDescription>
              </Alert>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="amount">Montant (€)</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={handleAmountChange}
                placeholder="Montant à recharger"
                disabled={status === 'processing' || !cardInfo}
              />
            </div>

            {/* Staff ID Input */}
            <div className="space-y-2">
              <Label htmlFor="staff-id">ID du Staff</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="staff-id"
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                  placeholder="Entrez l'ID du staff"
                  className="pl-10"
                  disabled={status === 'processing' || !!user?.id} // Disable if auto-filled from auth
                  required
                />
              </div>
               {user?.id && <p className="text-xs text-muted-foreground">Auto-rempli depuis l'utilisateur connecté.</p>}
            </div>

            {/* Checkpoint ID Input */}
            <div className="space-y-2">
              <Label htmlFor="checkpoint-id">ID du Checkpoint</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="checkpoint-id"
                  value={checkpointId}
                  onChange={(e) => setCheckpointId(e.target.value)}
                  placeholder="Entrez l'ID du checkpoint (ex: CP01)"
                  className="pl-10"
                  disabled={status === 'processing'}
                  required
                />
              </div>
            </div>
            
            {/* Payment Method at Checkpoint Input */}
            <div className="space-y-2">
              <Label htmlFor="payment-method-checkpoint">Méthode de Paiement (au checkpoint)</Label>
              <div className="relative">
                <ShoppingCart className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input // Could be a Select component later
                  id="payment-method-checkpoint"
                  value={paymentMethodAtCheckpoint}
                  onChange={(e) => setPaymentMethodAtCheckpoint(e.target.value)}
                  placeholder="Ex: CASH_CHECKPOINT, CARD_TERMINAL"
                  className="pl-10"
                  disabled={status === 'processing'}
                  required
                />
              </div>
            </div>
            
            <Button
              type="submit"
              className="w-full"
              disabled={status === 'processing' || !cardInfo || !amount || parseFloat(amount) <= 0 || !staffId || !checkpointId || !paymentMethodAtCheckpoint}
            >
              {status === 'processing' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Traitement...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Recharger la carte
                </>
              )}
            </Button>
          </form>
        );
    }
  };

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-xl font-semibold mb-4">Recharger une carte (Checkpoint)</h2>
          {renderContent()}
        </CardContent>
      </Card>

      <AlertDialog open={isConfirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la recharge</AlertDialogTitle>
            <AlertDialogDescription>
              Vous êtes sur le point de recharger la carte {pendingRechargePayload?.card_id} avec un montant de {pendingRechargePayload?.recharge_amount?.toFixed(2)}€.
              <br />
              Voulez-vous continuer?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelRecharge}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRecharge}>Confirmer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default CardTopup;
