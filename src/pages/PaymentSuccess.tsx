import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ChateauBackground from '@/components/ChateauBackground';
import ChateauCard from '@/components/ChateauCard';
import ChateauLogo from '@/components/ChateauLogo';
import { Button } from "@/components/ui/button";
import { CheckCircle, CreditCard, Loader2, Euro } from "lucide-react";
import { getTableCardById, updateTableCardAmount, TableCard } from '@/lib/supabase';
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';

const PaymentSuccess: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [amount, setAmount] = useState<string | null>(null);
  const [cardId, setCardId] = useState<string | null>(null);
  const [card, setCard] = useState<TableCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [updatingBalance, setUpdatingBalance] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;

  useEffect(() => {
    // Create an async function inside the effect
    const processPayment = async () => {
      // Get parameters from URL if present
      const params = new URLSearchParams(location.search);
      const amountParam = params.get('amount');
      const cardIdParam = params.get('cardId');
      
      // Check multiple possible parameter names for the session ID
      // Stripe might use 'session_id', 'sessionId', or other variants
      const sessionIdParam = params.get('session_id') || params.get('sessionId') || params.get('CHECKOUT_SESSION_ID');
      
      // Clean up old localStorage entries
      cleanupLocalStorage();
      
      if (amountParam) {
        setAmount(amountParam);
      }
      
      if (cardIdParam) {
        setCardId(cardIdParam);
      }

      // Log the found session ID and URL parameters for debugging
      console.log('URL parameters:', Object.fromEntries(params.entries()));
      console.log('Session ID found:', sessionIdParam);

      if (sessionIdParam) {
        setSessionId(sessionIdParam);
        
        // Check if this session has already been processed
        const processedTransactions = JSON.parse(localStorage.getItem('processedTransactions') || '[]');
        const isAlreadyProcessed = processedTransactions.includes(sessionIdParam);
        
        if (isAlreadyProcessed) {
          console.log(`Transaction ${sessionIdParam} already processed. Skipping balance update.`);
          toast({
            title: "Information",
            description: "Cette transaction a déjà été traitée. Pas de rechargement supplémentaire."
          });
          
          // Still fetch the current card data to display the balance
          if (cardIdParam) {
            fetchCardData(cardIdParam);
          }
        } else {
          // Si nous avons un ID de session, cela signifie que le paiement a été complété
          if (cardIdParam && amountParam) {
            // Mark this session as processed before updating the balance
            localStorage.setItem(
              'processedTransactions', 
              JSON.stringify([...processedTransactions, sessionIdParam])
            );
            
            // Update the balance and get back the new balance
            const newBalance = await updateCardBalance(cardIdParam, amountParam);
            
            // Only fetch card data if the update didn't return a balance (failed)
            if (newBalance === null) {
              fetchCardData(cardIdParam);
            }
            // Otherwise we already have the latest balance from the update operation
          }
        }
      } else {
        // If no session ID was found but we have card ID and amount,
        // attempt to update the balance anyway - the webhook might have already processed it
        if (cardIdParam) {
          fetchCardData(cardIdParam);
        }
      }
    };
    
    // Call the async function
    processPayment();
  }, [location]);

  // Fonction pour mettre à jour directement le solde de la carte
  const updateCardBalance = async (id: string, rechargeAmount: string) => {
    console.log(`Attempting to update card balance: Card ID=${id}, Amount=${rechargeAmount}`);
    
    // Generate a unique transaction key for this update
    const transactionKey = `card_${id}_amount_${rechargeAmount}_time_${Date.now()}`;
    
    // Check if we're in an update operation already - prevent concurrent updates
    const ongoingUpdate = localStorage.getItem('ongoingCardUpdate');
    if (ongoingUpdate) {
      console.log('Another update is already in progress. Aborting.');
      toast({
        title: "Mise à jour en cours",
        description: "Une mise à jour est déjà en cours. Veuillez patienter."
      });
      return;
    }
    
    // Set the flag that we're updating
    localStorage.setItem('ongoingCardUpdate', transactionKey);
    setUpdatingBalance(true);
    
    try {
      // Récupérer d'abord le solde actuel
      const currentCard = await getTableCardById(id);
      
      if (!currentCard) {
        console.error(`Card not found: ${id}`);
        throw new Error("Carte non trouvée");
      }
      
      console.log('Current card data:', currentCard);
      
      // Calculer le nouveau solde
      const currentAmount = parseFloat(currentCard.amount || '0');
      const addAmount = parseFloat(rechargeAmount);
      const newAmount = (currentAmount + addAmount).toFixed(2);
      
      console.log(`Mise à jour du solde: ${currentAmount} + ${addAmount} = ${newAmount}`);
      
      // Mettre à jour le solde dans Supabase
      const updateSuccess = await updateTableCardAmount(id, newAmount);
      
      if (!updateSuccess) {
        console.error(`Failed to update card amount in Supabase: ${id}`);
        throw new Error("Échec de la mise à jour du solde");
      }
      
      console.log(`Card balance updated successfully: ${newAmount}€`);
      
      // Record this transaction in local storage to prevent duplicate updates
      const completedUpdates = JSON.parse(localStorage.getItem('completedCardUpdates') || '[]');
      completedUpdates.push({
        cardId: id,
        amount: rechargeAmount,
        timestamp: Date.now(),
        transactionKey
      });
      localStorage.setItem('completedCardUpdates', JSON.stringify(completedUpdates));
      
      // IMPORTANT: Add a delay before fetching updated data to allow consistency
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Manually update the card data with our known new value
      // instead of immediately fetching possibly stale data
      setCard({
        id: id,
        amount: newAmount,
        description: currentCard.description
      });

      toast({
        title: "Solde mis à jour",
        description: `Votre carte a été rechargée de ${rechargeAmount}€`,
      });
      
      return newAmount; // Return the new amount so we know what it is
    } catch (error) {
      console.error('Erreur lors de la mise à jour du solde:', error);
      toast({
        title: "Erreur",
        description: "Une erreur s'est produite lors de la mise à jour du solde",
        variant: "destructive"
      });
    } finally {
      setUpdatingBalance(false);
      // Clear the ongoing update flag
      localStorage.removeItem('ongoingCardUpdate');
    }
    
    return null; // Return null if the update failed
  };

  const fetchCardData = async (id: string, knownNewBalance = null) => {
    setLoading(true);
    try {
      // If we have a known new balance from a recent update, use it directly
      if (knownNewBalance !== null) {
        console.log(`Using known new balance: ${knownNewBalance}€ instead of fetching`);
        // Create a card object with the known balance
        setCard({
          id: id,
          amount: knownNewBalance.toString(),
          description: card?.description || null
        });
        return;
      }

      // If we don't have a known balance, add a delay before fetching to allow for consistency
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const cardData = await getTableCardById(id);
      
      if (!cardData) {
        throw new Error("Données de carte non trouvées");
      }
      
      console.log('Données de carte récupérées:', cardData);
      setCard(cardData);

      // If we didn't find a card with the expected amount and we have retries left,
      // schedule another fetch after a delay (webhook might still be processing)
      if (amount && cardData.amount && 
          parseFloat(cardData.amount) < parseFloat(amount) && 
          retryCount < MAX_RETRIES) {
        console.log(`Card amount (${cardData.amount}) doesn't include payment (${amount}). Scheduling retry...`);
        setRetryCount(prev => prev + 1);
        setTimeout(() => fetchCardData(id), 3000); // Retry after 3 seconds
      }
    } catch (error) {
      console.error('Erreur lors de la récupération des détails de la carte:', error);
    } finally {
      setLoading(false);
    }
  };

  // Gestion du bouton de rafraîchissement manuel
  const handleManualRefresh = () => {
    if (cardId) {
      toast({
        title: "Rafraîchissement en cours",
        description: "Récupération des données de la carte...",
      });
      
      // Add a longer delay for manual refresh to ensure we get the latest data
      setTimeout(() => fetchCardData(cardId), 2000);
    }
  };

  // Add manual update functionality
  const handleManualUpdate = () => {
    if (cardId && amount && sessionId) {
      // Check if this session has already been manually updated
      const manuallyUpdatedSessions = JSON.parse(localStorage.getItem('manuallyUpdatedSessions') || '[]');
      
      if (manuallyUpdatedSessions.includes(sessionId)) {
        toast({
          title: "Action impossible",
          description: "Cette transaction a déjà été mise à jour manuellement.",
          variant: "destructive"
        });
        return;
      }
      
      toast({
        title: "Mise à jour manuelle",
        description: "Tentative de mise à jour du solde..."
      });
      
      // Add to manually updated sessions
      localStorage.setItem(
        'manuallyUpdatedSessions',
        JSON.stringify([...manuallyUpdatedSessions, sessionId])
      );
      
      updateCardBalance(cardId, amount);
    } else if (cardId && amount) {
      // No session ID, but we have cardId and amount
      // Generate a unique ID for this manual update to prevent duplicates
      const manualUpdateId = `manual_${Date.now()}_${cardId}_${amount}`;
      const manualUpdates = JSON.parse(localStorage.getItem('manualUpdates') || '[]');
      
      if (manualUpdates.some(update => update.cardId === cardId && update.amount === amount)) {
        toast({
          title: "Action impossible",
          description: "Un rechargement manuel a déjà été effectué pour ce montant.",
          variant: "destructive"
        });
        return;
      }
      
      toast({
        title: "Mise à jour manuelle",
        description: "Tentative de mise à jour du solde..."
      });
      
      // Add to manual updates
      localStorage.setItem(
        'manualUpdates',
        JSON.stringify([...manualUpdates, { id: manualUpdateId, cardId, amount }])
      );
      
      updateCardBalance(cardId, amount);
    }
  };

  // Function to clean up old localStorage entries to prevent them from growing too large
  const cleanupLocalStorage = () => {
    try {
      // Get the current timestamp
      const now = Date.now();
      const ONE_WEEK = 7 * 24 * 60 * 60 * 1000; // One week in milliseconds
      
      // Clean up processed transactions - keep only those from the last week
      const processedTransactions = JSON.parse(localStorage.getItem('processedTransactions') || '[]');
      const timestampedTransactions = JSON.parse(localStorage.getItem('completedCardUpdates') || '[]');
      
      // Filter out transactions older than one week
      const recentTransactions = timestampedTransactions.filter(tx => 
        (now - tx.timestamp) < ONE_WEEK
      );
      
      // Limit the number of processedTransactions to the last 50
      const limitedProcessedTransactions = processedTransactions.slice(-50);
      
      // Save back to localStorage
      localStorage.setItem('completedCardUpdates', JSON.stringify(recentTransactions));
      localStorage.setItem('processedTransactions', JSON.stringify(limitedProcessedTransactions));
      
      // Clean up manual updates too
      const manualUpdates = JSON.parse(localStorage.getItem('manualUpdates') || '[]');
      if (manualUpdates.length > 50) {
        localStorage.setItem('manualUpdates', JSON.stringify(manualUpdates.slice(-50)));
      }
      
      // Clean up manually updated sessions
      const manuallyUpdatedSessions = JSON.parse(localStorage.getItem('manuallyUpdatedSessions') || '[]');
      if (manuallyUpdatedSessions.length > 50) {
        localStorage.setItem('manuallyUpdatedSessions', JSON.stringify(manuallyUpdatedSessions.slice(-50)));
      }
      
      // Always clear any stale ongoing update flags
      if (localStorage.getItem('ongoingCardUpdate')) {
        // If the flag is older than 5 minutes, clear it (in case of interrupted updates)
        const ongoingUpdateTime = parseInt(localStorage.getItem('ongoingCardUpdate')?.split('_time_')[1] || '0');
        if ((now - ongoingUpdateTime) > 5 * 60 * 1000) {
          localStorage.removeItem('ongoingCardUpdate');
        }
      }
    } catch (error) {
      console.error('Error cleaning up localStorage:', error);
    }
  };

  return (
    <ChateauBackground>
      <ChateauCard className="w-full max-w-md">
        <div className="flex flex-col items-center justify-center space-y-6">
          <ChateauLogo />
          <div className="text-white text-center space-y-4">
            <CheckCircle className="h-12 w-12 mx-auto text-green-400" />
            <h2 className="text-xl font-medium">Rechargement réussi !</h2>
            
            <div className="inline-flex items-center bg-blue-600/20 px-3 py-1 rounded-full text-sm">
              <CreditCard className="h-3 w-3 mr-1" />
              Paiement par carte bancaire
            </div>
            
            {amount && (
              <p className="text-lg">Montant rechargé: <span className="font-bold">{amount}€</span></p>
            )}
            
            {updatingBalance || loading ? (
              <div className="flex items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span>{updatingBalance ? "Mise à jour du solde..." : "Chargement des détails..."}</span>
              </div>
            ) : (
              card && (
                <div className="bg-green-600/20 p-3 rounded-lg">
                  <p className="text-lg">Solde actuel: <span className="font-bold">{card.amount}€</span></p>
                </div>
              )
            )}
            
            {cardId && (
              <p className="text-sm">Carte: <span className="font-mono">{cardId}</span></p>
            )}
            
            <p>Votre carte a été rechargée avec succès.</p>
            <p className="text-sm">
              Traitez cette carte comme du cash.<br />
              En cas de perte, vous ne serez pas remboursé.
            </p>
            
            {!updatingBalance && !loading && retryCount >= MAX_RETRIES && (
              <div className="bg-amber-600/20 p-3 rounded-lg mt-2">
                <p className="text-sm">Si votre solde n'a pas été mis à jour, vous pouvez:</p>
                <Button
                  variant="outline"
                  className="bg-transparent text-white border-white hover:bg-white/10 w-full mt-2"
                  onClick={handleManualUpdate}
                >
                  Réessayer la mise à jour
                </Button>
              </div>
            )}
          </div>
          <Button
            className="bg-white text-amber-800 hover:bg-amber-50 w-full"
            onClick={() => navigate("/")}
          >
            Retour à l'accueil
          </Button>
          <Button
            variant="outline"
            className="bg-transparent text-white border-white hover:bg-white/10 w-full"
            onClick={handleManualRefresh}
          >
            Rafraîchir le solde
          </Button>
        </div>
      </ChateauCard>
    </ChateauBackground>
  );
};

export default PaymentSuccess;
