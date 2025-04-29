
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ChateauBackground from '@/components/ChateauBackground';
import ChateauCard from '@/components/ChateauCard';
import ChateauLogo from '@/components/ChateauLogo';
import { Button } from "@/components/ui/button";
import { CheckCircle, CreditCard, Loader2, Euro } from "lucide-react";
import { getTableCardById, TableCard } from '@/lib/supabase';
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
  const [retryCount, setRetryCount] = useState(0);
  const [showRetryDialog, setShowRetryDialog] = useState(false);

  useEffect(() => {
    // Get parameters from URL if present
    const params = new URLSearchParams(location.search);
    const amountParam = params.get('amount');
    const cardIdParam = params.get('cardId');
    const sessionIdParam = params.get('session_id');
    
    if (amountParam) {
      setAmount(amountParam);
    }
    
    if (cardIdParam) {
      setCardId(cardIdParam);
      // Fetch the current card data to show the updated balance
      fetchCardData(cardIdParam);
    }

    if (sessionIdParam) {
      setSessionId(sessionIdParam);
    }
  }, [location]);

  const fetchCardData = async (id: string) => {
    setLoading(true);
    try {
      // Add a significant delay to ensure the webhook has time to process the update
      // Especially since the webhook can take time to be triggered by Stripe
      if (sessionId) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      const cardData = await getTableCardById(id);
      
      if (!cardData) {
        throw new Error("Card data not found");
      }
      
      console.log('Fetched card data:', cardData);
      setCard(cardData);
      
      // Check if we have the amount parameter and the current card amount
      if (amount && cardData.amount) {
        const expectedAmount = (parseFloat(amount) + parseFloat(cardData.amount)).toFixed(2);
        console.log(`Expected amount: ${expectedAmount}, Current amount: ${cardData.amount}`);
        
        // If the expected amount is different from the card amount after delay, 
        // and we haven't retried too many times, retry fetching
        if (parseFloat(expectedAmount) !== parseFloat(cardData.amount) && retryCount < 3) {
          setRetryCount(prev => prev + 1);
          setTimeout(() => fetchCardData(id), 2000);
        }
      }
    } catch (error) {
      console.error('Error fetching card details:', error);
      // If we have retried a few times and still can't get the updated data, show retry dialog
      if (retryCount >= 2) {
        setShowRetryDialog(true);
      } else {
        setRetryCount(prev => prev + 1);
        setTimeout(() => fetchCardData(id), 2000);
      }
    } finally {
      setLoading(false);
    }
  };

  // Manual refresh button handler
  const handleManualRefresh = () => {
    if (cardId) {
      toast({
        title: "Rafraîchissement en cours",
        description: "Récupération des données de la carte...",
      });
      setShowRetryDialog(false);
      fetchCardData(cardId);
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
            
            {loading ? (
              <div className="flex items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span>Chargement des détails...</span>
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
      
      {/* Retry Dialog */}
      <Dialog open={showRetryDialog} onOpenChange={setShowRetryDialog}>
        <DialogContent className="bg-amber-800 text-white border-0">
          <DialogTitle>Mise à jour du solde</DialogTitle>
          <p>Le solde de votre carte est en cours de mise à jour. Cela peut prendre quelques instants.</p>
          <div className="flex justify-end gap-2 mt-4">
            <Button 
              className="bg-white text-amber-800 hover:bg-amber-50"
              onClick={handleManualRefresh}
            >
              Rafraîchir maintenant
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ChateauBackground>
  );
};

export default PaymentSuccess;
