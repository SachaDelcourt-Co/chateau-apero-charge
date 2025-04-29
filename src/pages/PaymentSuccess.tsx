
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ChateauBackground from '@/components/ChateauBackground';
import ChateauCard from '@/components/ChateauCard';
import ChateauLogo from '@/components/ChateauLogo';
import { Button } from "@/components/ui/button";
import { CheckCircle, CreditCard, Loader2, Euro } from "lucide-react";
import { getTableCardById, TableCard } from '@/lib/supabase';

const PaymentSuccess: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [amount, setAmount] = useState<string | null>(null);
  const [cardId, setCardId] = useState<string | null>(null);
  const [card, setCard] = useState<TableCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

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
      // Add a small delay to ensure the webhook has time to process the update
      // Increase delay to 3 seconds to ensure webhook has completed processing
      if (sessionId) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      const cardData = await getTableCardById(id);
      setCard(cardData);
    } catch (error) {
      console.error('Error fetching card details:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate the expected new balance for display before the webhook completes
  const calculateExpectedBalance = (): string => {
    if (!card || !amount) return "Chargement...";
    
    const currentAmount = parseFloat(card.amount || '0');
    const rechargeAmount = parseFloat(amount);
    return (currentAmount + rechargeAmount).toFixed(2);  // Add recharge amount to show expected balance
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
        </div>
      </ChateauCard>
    </ChateauBackground>
  );
};

export default PaymentSuccess;
