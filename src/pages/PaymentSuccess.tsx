
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
    }

    if (sessionIdParam) {
      setSessionId(sessionIdParam);
      // Si nous avons un ID de session, cela signifie que le paiement a été complété
      if (cardIdParam && amountParam) {
        updateCardBalance(cardIdParam, amountParam);
      }
    }
  }, [location]);

  // Fonction pour mettre à jour directement le solde de la carte
  const updateCardBalance = async (id: string, rechargeAmount: string) => {
    setUpdatingBalance(true);
    try {
      // Récupérer d'abord le solde actuel
      const currentCard = await getTableCardById(id);
      
      if (!currentCard) {
        throw new Error("Carte non trouvée");
      }
      
      // Calculer le nouveau solde
      const currentAmount = parseFloat(currentCard.amount || '0');
      const addAmount = parseFloat(rechargeAmount);
      const newAmount = (currentAmount + addAmount).toFixed(2);
      
      console.log(`Mise à jour du solde: ${currentAmount} + ${addAmount} = ${newAmount}`);
      
      // Mettre à jour le solde dans Supabase
      const updateSuccess = await updateTableCardAmount(id, newAmount);
      
      if (!updateSuccess) {
        throw new Error("Échec de la mise à jour du solde");
      }
      
      // Récupérer les données mises à jour
      fetchCardData(id);

      toast({
        title: "Solde mis à jour",
        description: `Votre carte a été rechargée de ${rechargeAmount}€`,
      });
    } catch (error) {
      console.error('Erreur lors de la mise à jour du solde:', error);
      toast({
        title: "Erreur",
        description: "Une erreur s'est produite lors de la mise à jour du solde",
        variant: "destructive"
      });
    } finally {
      setUpdatingBalance(false);
    }
  };

  const fetchCardData = async (id: string) => {
    setLoading(true);
    try {
      // Ajout d'un petit délai pour s'assurer que la mise à jour a été effectuée
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const cardData = await getTableCardById(id);
      
      if (!cardData) {
        throw new Error("Données de carte non trouvées");
      }
      
      console.log('Données de carte récupérées:', cardData);
      setCard(cardData);
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
