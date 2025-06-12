import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CreditCard, CheckCircle, Scan, Info, Check, AlertCircle } from "lucide-react";
import { getTableCardById, updateTableCardAmount, processCheckpointRecharge, generateClientRequestId } from '@/lib/supabase';
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { useNfc } from '@/hooks/use-nfc';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { logger } from '@/lib/logger';

// Define state types for better type safety
type RechargeStatus = 'idle' | 'checking' | 'processing' | 'success' | 'error';

interface CardTopupProps {
  onSuccess?: () => void;
}

// Staff operation mode for checkpoint recharges
type OperationMode = 'standard' | 'checkpoint';

const CardTopup: React.FC<CardTopupProps> = ({ onSuccess }) => {
  // Basic form state
  const [cardId, setCardId] = useState('');
  const [amount, setAmount] = useState('');
  const [paidByCard, setPaidByCard] = useState(false);
  
  // New Phase 2 state for checkpoint recharges
  const [operationMode, setOperationMode] = useState<OperationMode>('standard');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
  const [staffId, setStaffId] = useState('');
  const [checkpointId, setCheckpointId] = useState('');

  // Advanced state management
  const [status, setStatus] = useState<RechargeStatus>('idle');
  const [cardInfo, setCardInfo] = useState<any>(null);
  const [currentAmount, setCurrentAmount] = useState<string | null>(null);
  const [originalBalance, setOriginalBalance] = useState<number | null>(null);
  const [transactionId, setTransactionId] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  
  const { toast } = useToast();
  
  // Initialize NFC hook with a validation function and scan handler
  const { isScanning, startScan, stopScan, isSupported } = useNfc({
    // Validate that ID is 8 characters long
    validateId: (id) => id.length === 8,
    // Handle scanned ID
    onScan: (id) => {
      console.log('[CardTopup] NFC card scanned with ID:', id);
      setCardId(id);
      
      // Log the NFC scan attempt for recharging
      logger.recharge('recharge_scan_attempt', { 
        cardId: id, 
        timestamp: new Date().toISOString() 
      });
      
      checkCardBalance(id);
      // Optional: toast to indicate successful scan
      toast({
        title: "Carte détectée",
        description: `ID de carte: ${id}`,
      });

      stopScan();
    }
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

  // Generate a unique transaction ID for tracking
  const generateTransactionId = useCallback(() => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000000);
    return `tx-${timestamp}-${random}`;
  }, []);

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

  // Process checkpoint recharge using the new edge function
  const processCheckpointRechargeOperation = async (txId: string) => {
    try {
      const clientRequestId = generateClientRequestId();
      
      const rechargeResult = await processCheckpointRecharge({
        card_id: cardId,
        amount: parseFloat(amount),
        payment_method: paymentMethod,
        staff_id: staffId,
        client_request_id: clientRequestId,
        checkpoint_id: checkpointId || undefined
      });

      if (rechargeResult.success) {
        // Log the successful recharge
        logger.recharge('recharge_success', {
          cardId,
          amount: parseFloat(amount),
          previousBalance: rechargeResult.previous_balance,
          newBalance: rechargeResult.new_balance,
          transactionId: txId,
          operationMode: 'checkpoint',
          paymentMethod,
          staffId
        });
        
        setStatus('success');
        setCurrentAmount(rechargeResult.new_balance?.toString() || currentAmount);
        setOriginalBalance(rechargeResult.previous_balance || 0);

        toast({
          title: "Recharge checkpoint réussie",
          description: `La carte ${cardId} a été rechargée de ${amount}€. Nouveau solde: ${rechargeResult.new_balance?.toFixed(2)}€`,
        });
        
        // Call the onSuccess callback if provided
        if (onSuccess) {
          onSuccess();
        }
        
        // Reset amount field but keep the card ID
        setAmount('');
      } else {
        // Handle specific error cases
        if (rechargeResult.error?.includes('Insufficient funds')) {
          setErrorMessage("Solde insuffisant sur la carte.");
        } else if (rechargeResult.error?.includes('Card not found')) {
          setErrorMessage("Carte non trouvée. Veuillez vérifier l'ID de la carte.");
        } else {
          setErrorMessage(`Erreur lors du traitement de la recharge: ${rechargeResult.error || 'Erreur inconnue'}`);
        }
        
        logger.recharge('recharge_error', {
          cardId,
          amount: parseFloat(amount),
          error: rechargeResult.error,
          transactionId: txId,
          operationMode: 'checkpoint'
        });
        
        setStatus('error');
        
        toast({
          title: "Erreur",
          description: rechargeResult.error || "Une erreur est survenue lors de la recharge",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Erreur lors de la recharge checkpoint:", error);
      
      logger.recharge('recharge_error', {
        cardId,
        amount: parseFloat(amount),
        error: String(error),
        transactionId: txId,
        operationMode: 'checkpoint'
      });
      
      setErrorMessage("Une erreur est survenue lors de la recharge checkpoint");
      setStatus('error');
      
      toast({
        title: "Erreur",
        description: "Une erreur est survenue lors de la recharge checkpoint",
        variant: "destructive"
      });
    }
  };

  // Process the recharge with retry logic for rate limiting
  const processTopup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (!cardId || cardId.length !== 8) {
      toast({
        title: "ID de carte invalide",
        description: "Veuillez saisir un ID de carte valide (8 caractères).",
        variant: "destructive"
      });
      return;
    }
    
    if (!amount || parseFloat(amount) <= 0) {
      toast({
        title: "Montant invalide",
        description: "Veuillez saisir un montant valide supérieur à 0.",
        variant: "destructive"
      });
      return;
    }

    // Additional validation for checkpoint mode
    if (operationMode === 'checkpoint') {
      if (!staffId.trim()) {
        toast({
          title: "ID du personnel requis",
          description: "Veuillez saisir l'ID du personnel pour les recharges checkpoint.",
          variant: "destructive"
        });
        return;
      }
    }

    setStatus('processing');
    const txId = generateTransactionId();
    setTransactionId(txId);
    
    // Log the start of the topup process
    logger.recharge('recharge_topup_attempt', {
      cardId,
      amount: parseFloat(amount),
      currentBalance: currentAmount,
      transactionId: txId,
      operationMode,
      paymentMethod: operationMode === 'checkpoint' ? paymentMethod : (paidByCard ? 'card' : 'cash')
    });

    // Use checkpoint recharge for staff operations
    if (operationMode === 'checkpoint') {
      await processCheckpointRechargeOperation(txId);
      return;
    }
    
    // Rate limit handling variables
    const maxRetries = 5;
    let retryCount = 0;
    let shouldRetry = false;

    do {
      // If this is a retry, add an exponential backoff delay
      if (retryCount > 0) {
        const backoffTime = Math.min(2 ** retryCount * 500, 10000); // 500ms, 1s, 2s, 4s, 8s up to max 10s
        console.log(`Rate limit hit. Retry ${retryCount}/${maxRetries} after ${backoffTime}ms backoff`);
        
        logger.recharge('recharge_retry', {
          cardId,
          attempt: retryCount,
          maxRetries,
          backoffTime,
          transactionId: txId
        });
        
        // Show a toast for the retry
        toast({
          title: "Serveur occupé",
          description: `Nouvelle tentative dans ${backoffTime/1000} secondes (${retryCount}/${maxRetries})`,
          variant: "destructive"
        });
        
        // Wait for the backoff time
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
    
      try {
        // Récupérer la carte
      let tableCard = await getTableCardById(cardId);
      
      if (tableCard) {
        // Carte trouvée dans table_cards
        const currentAmountValue = tableCard.amount?.toString() || '0';
          
          // Store the original balance for display
          const currentAmountFloat = parseFloat(currentAmountValue);
          setOriginalBalance(currentAmountFloat);
        
        // Calculer le nouveau montant en additionnant l'ancien montant et le montant de recharge
          const amountFloat = parseFloat(amount);
          const newAmount = (currentAmountFloat + amountFloat).toString();
        
        // Mettre à jour le montant
        const success = await updateTableCardAmount(cardId, newAmount);
        
        if (success) {
            // Add transaction to recharges table if required
            if (paidByCard) {
          // Ajouter l'enregistrement dans la table recharges
          const { error } = await supabase
            .from('recharges')
            .insert({
              card_id: cardId,
                  amount: amountFloat,
                  payment_method: paidByCard ? 'card' : 'cash',
                  transaction_id: txId
            });
          
          if (error) {
                // Check for rate limit errors
                if (error.code === '429' || error.message?.includes('rate limit')) {
                  console.log('Rate limit error on payment logging, will retry');
                  
                  logger.recharge('recharge_rate_limited', {
                    cardId,
                    stage: 'payment_logging',
                    error: error.message,
                    transactionId: txId
                  });
                  
                  shouldRetry = true;
                  retryCount++;
                  continue; // Skip the rest of this iteration and retry
                } else {
            console.error('Error logging payment:', error);
                  logger.recharge('recharge_payment_log_error', {
                    cardId,
                    error: error.message,
                    transactionId: txId
                  });
                  
            toast({
              title: "Attention",
              description: "La carte a été rechargée mais l'historique n'a pas pu être enregistré",
              variant: "destructive"
            });
          }
              }
            }
            
            // Log the successful recharge
            logger.recharge('recharge_success', {
              cardId,
              amount: amountFloat,
              previousBalance: currentAmountFloat,
              newBalance: parseFloat(newAmount),
              transactionId: txId
            });
          
            setStatus('success');
            setCurrentAmount(newAmount);

          toast({
            title: "Carte rechargée",
              description: `La carte ${cardId} a été rechargée de ${amount}€. Nouveau solde: ${parseFloat(newAmount).toFixed(2)}€`,
          });
          
          // Call the onSuccess callback if provided
          if (onSuccess) {
            onSuccess();
          }
            
            // Reset amount field but keep the card ID
            setAmount('');
            
            // Operation completed successfully
            shouldRetry = false;
          } else {
            // Check if this is likely a rate limit error
            console.log('Failed to update card amount, checking if rate limited');
            
            logger.recharge('recharge_update_failed', {
              cardId,
              checking_rate_limit: true,
              transactionId: txId
            });
            
            // Try to get the card again to see if we're rate limited
            try {
              const checkCard = await getTableCardById(cardId);
              if (!checkCard) {
                // If we can't even get the card now, it's likely a rate limit
                shouldRetry = true;
                retryCount++;
                logger.recharge('recharge_rate_limited', {
                  cardId,
                  stage: 'card_update',
                  detected: 'card_not_found_after_update',
                  transactionId: txId
                });
                console.log('Potential rate limit detected, will retry');
              } else {
                // Some other error occurred
                logger.recharge('recharge_error', {
                  cardId,
                  amount: amountFloat,
                  error: "Failed to update card balance but card exists",
                  transactionId: txId
                });
                
                setErrorMessage("Erreur lors de la mise à jour du montant");
                setStatus('error');
                
                toast({
                  title: "Erreur",
                  description: "Erreur lors de la mise à jour du montant",
                  variant: "destructive"
                });
                shouldRetry = false;
              }
            } catch (checkError: any) {
              // If this second request fails with a rate limit, retry
              if (checkError.status === 429 || checkError.message?.includes('rate limit')) {
                shouldRetry = true;
                retryCount++;
                
                logger.recharge('recharge_rate_limited', {
                  cardId,
                  stage: 'card_check_after_update',
                  error: String(checkError),
                  transactionId: txId
                });
                
                console.log('Rate limit confirmed, will retry');
        } else {
                logger.recharge('recharge_error', {
                  cardId,
                  amount: parseFloat(amount),
                  error: String(checkError),
                  transactionId: txId
                });
                
                setErrorMessage("Erreur lors de la mise à jour du montant");
                setStatus('error');
                
          toast({
            title: "Erreur",
            description: "Erreur lors de la mise à jour du montant",
            variant: "destructive"
          });
                shouldRetry = false;
              }
            }
          }
        } else {
          // Card not found
          logger.recharge('recharge_error', {
            cardId,
            amount: parseFloat(amount),
            error: "Card not found",
            transactionId: txId
          });
          
          setErrorMessage("Aucune carte trouvée avec cet identifiant");
          setStatus('error');
          
          // Check if this is a rate limit error
          if (retryCount < 2) { // Try at least once more for card not found
            shouldRetry = true;
            retryCount++;
            console.log('Card not found, might be rate limited. Will retry');
      } else {
        toast({
          title: "Carte non trouvée",
          description: "Aucune carte trouvée avec cet identifiant",
          variant: "destructive"
        });
            shouldRetry = false;
          }
      }
      } catch (error: any) {
      console.error("Erreur lors de la recharge:", error);
        
        logger.recharge('recharge_error', {
          cardId,
          amount: parseFloat(amount),
          error: String(error),
          transactionId: txId
        });
          
        // Check if error is a rate limit error
        if (error.status === 429 || error.code === '429' || error.message?.includes('rate limit') || error.message?.includes('too many requests')) {
          console.log('Rate limit error detected, will retry');
          
          logger.recharge('recharge_rate_limited', {
            cardId,
            stage: 'general_operation',
            error: String(error),
            transactionId: txId
          });
          
          shouldRetry = true;
          retryCount++;        
        } else {
          setErrorMessage(String(error) || "Une erreur est survenue lors de la recharge");
          setStatus('error');
          
      toast({
        title: "Erreur",
        description: "Une erreur est survenue lors de la recharge",
        variant: "destructive"
      });
          shouldRetry = false;
        }
      }
    } while (shouldRetry && retryCount <= maxRetries);
    
    // If we exited due to max retries
    if (retryCount > maxRetries) {
      logger.recharge('recharge_max_retries_exceeded', {
        cardId,
        amount: parseFloat(amount),
        transactionId: txId
      });
      
      setErrorMessage("Le serveur est actuellement surchargé. Veuillez réessayer dans quelques instants.");
      setStatus('error');
      
      toast({
        title: "Service temporairement indisponible",
        description: "Le serveur est actuellement surchargé. Veuillez réessayer dans quelques instants.",
        variant: "destructive"
      });
    }
    
    // If we're still in processing state, ensure we go back to idle
    if (status === 'processing') {
      setStatus('idle');
    }
  };

  const handleReset = () => {
    setCardId('');
    setAmount('');
    setPaidByCard(false);
    setOperationMode('standard');
    setPaymentMethod('cash');
    setStaffId('');
    setCheckpointId('');
    setStatus('idle');
    setCurrentAmount(null);
    setCardInfo(null);
    setOriginalBalance(null);
    setErrorMessage('');
    // Reset NFC scanning state
    if (isScanning) {
      stopScan();
      // Use setTimeout to ensure scan is properly stopped before restarting
      setTimeout(() => {
        startScan();
      }, 100);
    } else {
      startScan();
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
      if (isScanning) {
        stopScan();
      }
    };
  }, [isScanning, stopScan]);

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
              <span className="font-medium">Ancien solde:</span> {originalBalance?.toFixed(2)}€<br />
              <span className="font-medium">Montant ajouté:</span> {amount}€<br />
              <span className="font-medium">Nouveau solde:</span> {currentAmount ? parseFloat(currentAmount).toFixed(2) : '0.00'}€<br />
              <span className="font-medium">Mode:</span> {operationMode === 'checkpoint' ? 'Checkpoint' : 'Standard'}<br />
              {operationMode === 'checkpoint' ? (
                <>
                  <span className="font-medium">Méthode de paiement:</span> {paymentMethod === 'cash' ? 'Espèces' : 'Carte'}<br />
                  <span className="font-medium">Personnel:</span> {staffId}<br />
                  {checkpointId && <><span className="font-medium">Checkpoint:</span> {checkpointId}<br /></>}
                </>
              ) : (
                <><span className="font-medium">Payé par carte:</span> {paidByCard ? 'Oui' : 'Non'}<br /></>
              )}
              <span className="font-medium">ID de transaction:</span> <span className="text-xs">{transactionId}</span>
            </p>
            <Button onClick={handleReset}>Recharger une autre carte</Button>
          </div>
        );
        
      case 'error':
        return (
          <div className="flex flex-col items-center py-6">
            <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
            <p className="text-red-600 font-semibold mb-2">Erreur lors de la recharge</p>
            <p className="text-center mb-4">{errorMessage}</p>
            <div className="flex space-x-4">
              <Button variant="outline" onClick={handleReset}>Recommencer</Button>
              {cardInfo && (
                <Button onClick={() => {
                  setStatus('idle');
                  setErrorMessage('');
                }}>Réessayer</Button>
              )}
            </div>
          </div>
        );
        
      default:
        return (
          <form onSubmit={processTopup} className="space-y-4">
            {/* NFC Scan Button - Prominent placement */}
            {isSupported !== null && (
              <div className="flex justify-center mb-4">
                <Button
                  type="button"
                  onClick={isScanning ? stopScan : startScan}
                  variant={isScanning ? "destructive" : "default"}
                  size="lg"
                  disabled={isSupported === false || status === 'processing'}
                  className="w-full text-center"
                >
                  <Scan className="h-5 w-5 mr-2" />
                  {isScanning ? "Arrêter le scan NFC" : "Scanner une carte via NFC"}
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
            
            {/* Operation Mode Selector */}
            <div className="space-y-2">
              <Label>Mode d'opération</Label>
              <div className="flex space-x-4">
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    value="standard"
                    checked={operationMode === 'standard'}
                    onChange={(e) => setOperationMode(e.target.value as OperationMode)}
                    disabled={status === 'processing'}
                  />
                  <span>Standard</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    value="checkpoint"
                    checked={operationMode === 'checkpoint'}
                    onChange={(e) => setOperationMode(e.target.value as OperationMode)}
                    disabled={status === 'processing'}
                  />
                  <span>Checkpoint (Personnel)</span>
                </label>
              </div>
            </div>

            {/* Staff ID field for checkpoint mode */}
            {operationMode === 'checkpoint' && (
              <div className="space-y-2">
                <Label htmlFor="staff-id">ID du personnel</Label>
                <Input
                  id="staff-id"
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                  placeholder="ID du membre du personnel"
                  disabled={status === 'processing'}
                  required
                />
              </div>
            )}

            {/* Checkpoint ID field for checkpoint mode (optional) */}
            {operationMode === 'checkpoint' && (
              <div className="space-y-2">
                <Label htmlFor="checkpoint-id">ID du checkpoint (optionnel)</Label>
                <Input
                  id="checkpoint-id"
                  value={checkpointId}
                  onChange={(e) => setCheckpointId(e.target.value)}
                  placeholder="ID du checkpoint"
                  disabled={status === 'processing'}
                />
              </div>
            )}

            {/* Payment method selector for checkpoint mode */}
            {operationMode === 'checkpoint' && (
              <div className="space-y-2">
                <Label>Méthode de paiement</Label>
                <div className="flex space-x-4">
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      value="cash"
                      checked={paymentMethod === 'cash'}
                      onChange={(e) => setPaymentMethod(e.target.value as 'cash' | 'card')}
                      disabled={status === 'processing'}
                    />
                    <span>Espèces</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      value="card"
                      checked={paymentMethod === 'card'}
                      onChange={(e) => setPaymentMethod(e.target.value as 'cash' | 'card')}
                      disabled={status === 'processing'}
                    />
                    <span>Carte</span>
                  </label>
                </div>
              </div>
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
            
            {/* Standard mode payment checkbox */}
            {operationMode === 'standard' && (
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 mt-4">
                <div className="flex items-center">
                  <Checkbox
                    id="paid-by-card"
                    checked={paidByCard}
                    onCheckedChange={(checked) => setPaidByCard(checked === true)}
                    className="h-6 w-6 border-2 border-blue-500"
                    disabled={status === 'processing'}
                  />
                  <Label
                    htmlFor="paid-by-card"
                    className="ml-3 text-base sm:text-lg font-medium text-blue-700 cursor-pointer select-none flex-1"
                  >
                    Payé par carte
                  </Label>
                </div>
              </div>
            )}
            
            <Button
              type="submit"
              className="w-full"
              disabled={status === 'processing' || !cardInfo || !amount || parseFloat(amount) <= 0 || (operationMode === 'checkpoint' && !staffId.trim())}
            >
              {status === 'processing' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Traitement...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  {operationMode === 'checkpoint' ? 'Recharge Checkpoint' : 'Recharger la carte'}
                </>
              )}
            </Button>
          </form>
        );
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="text-xl font-semibold mb-4">Recharger une carte</h2>
        {renderContent()}
      </CardContent>
    </Card>
  );
};

export default CardTopup;
