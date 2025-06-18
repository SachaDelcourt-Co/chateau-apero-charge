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
    const cardIdParam = params.get('card_id') || params.get('cardId');
      
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
      console.log('Full URL:', window.location.href);
      console.log('URL search params:', location.search);
      console.log('All URL parameters:', Object.fromEntries(params.entries()));
      console.log('Raw card_id param:', params.get('card_id'));
      console.log('Raw cardId param:', params.get('cardId'));
      console.log('Session ID found:', sessionIdParam);
      console.log('Card ID found:', cardIdParam);
      console.log('Amount found:', amountParam);

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
          // La balance sera mise à jour par le webhook Stripe automatiquement
          if (cardIdParam && amountParam) {
            // Mark this session as processed to avoid duplicate processing
            localStorage.setItem(
              'processedTransactions', 
              JSON.stringify([...processedTransactions, sessionIdParam])
            );
            
            console.log(`[PaymentSuccess] Payment completed with session ${sessionIdParam}. Webhook will handle balance update.`);
            
            // Wait a moment for webhook to process, then fetch updated card data
            setTimeout(() => {
              fetchCardData(cardIdParam);
            }, 2000); // Give webhook time to process
          }
        }
              } else {
        // If no session ID was found but we have card ID and amount,
        // attempt to update the balance anyway - the webhook might have already processed it
        if (cardIdParam) {
          console.log('No session ID found, but have card ID. Fetching card data...');
          fetchCardData(cardIdParam);
        } else {
          console.error('No session ID or card ID found in URL parameters');
          toast({
            title: "Erreur",
            description: "Paramètres de paiement manquants. Veuillez vérifier l'URL.",
            variant: "destructive"
          });
        }
      }
    };
    
    // Call the async function
    processPayment();
  }, [location]);

  // Function to wait for webhook processing and show appropriate message
  const waitForWebhookProcessing = async (cardId: string, expectedAmount: string) => {
    setUpdatingBalance(true);
    
    try {
      console.log(`[PaymentSuccess] Waiting for webhook to process payment for card ${cardId}, amount ${expectedAmount}`);
      
      // Give webhook some time to process
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Fetch updated card data
      await fetchCardData(cardId);
      
      toast({
        title: "Paiement traité",
        description: `Votre carte a été rechargée de ${expectedAmount}€`,
      });
    } catch (error) {
      console.error('Erreur lors de la vérification du solde:', error);
      toast({
        title: "Vérification en cours",
        description: "Le paiement est en cours de traitement. Rafraîchissez la page dans quelques instants.",
        variant: "default"
      });
    } finally {
      setUpdatingBalance(false);
    }
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

      // If we have a payment amount to check against and the webhook might still be processing
      if (amount && cardData.amount && sessionId && 
          parseFloat(cardData.amount) < (parseFloat(cardData.amount) + parseFloat(amount)) && 
          retryCount < MAX_RETRIES) {
        console.log(`[PaymentSuccess] Balance may not reflect recent payment yet. Scheduling retry... (${retryCount + 1}/${MAX_RETRIES})`);
        setRetryCount(prev => prev + 1);
        setTimeout(() => fetchCardData(id), 5000); // Give webhook more time
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

  // Manual update functionality - waits for webhook processing
  const handleManualUpdate = () => {
    if (cardId && amount) {
      toast({
        title: "Actualisation manuelle",
        description: "Récupération des dernières données..."
      });
      
      // Wait for webhook processing and fetch updated data
      waitForWebhookProcessing(cardId, amount);
    } else {
      toast({
        title: "Action impossible",
        description: "Informations de paiement manquantes.",
        variant: "destructive"
      });
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
            
            {!updatingBalance && !loading && sessionId && (
              <div className="bg-blue-600/20 p-3 rounded-lg mt-2">
                <p className="text-sm">💡 Votre paiement est traité automatiquement par notre système sécurisé.</p>
                {retryCount >= MAX_RETRIES && (
                  <>
                    <p className="text-sm mt-1">Si le solde ne s'affiche pas correctement:</p>
                    <Button
                      variant="outline"
                      className="bg-transparent text-white border-white hover:bg-white/10 w-full mt-2"
                      onClick={handleManualUpdate}
                    >
                      Actualiser le solde
                    </Button>
                  </>
                )}
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
