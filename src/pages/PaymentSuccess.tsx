
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ChateauBackground from '@/components/ChateauBackground';
import ChateauCard from '@/components/ChateauCard';
import ChateauLogo from '@/components/ChateauLogo';
import { Button } from "@/components/ui/button";
import { CheckCircle, CreditCard, Loader2 } from "lucide-react";
import { getTableCardById, TableCard } from '@/lib/supabase';

const PaymentSuccess: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [amount, setAmount] = useState<string | null>(null);
  const [cardId, setCardId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [card, setCard] = useState<TableCard | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Get parameters from URL if present
    const params = new URLSearchParams(location.search);
    const amountParam = params.get('amount');
    const cardIdParam = params.get('cardId');
    const sessionId = params.get('session_id');
    
    if (amountParam) {
      setAmount(amountParam);
    }
    
    if (cardIdParam) {
      setCardId(cardIdParam);
      // Fetch the current card data to show the updated balance
      fetchCardData(cardIdParam);
    }
    
    // If we have a session_id, it means the payment was made with Stripe
    if (sessionId) {
      setPaymentMethod("stripe");
    }
  }, [location]);

  const fetchCardData = async (id: string) => {
    setLoading(true);
    try {
      const cardData = await getTableCardById(id);
      setCard(cardData);
    } catch (error) {
      console.error('Error fetching card details:', error);
    } finally {
      setLoading(false);
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
            
            {paymentMethod === "stripe" && (
              <div className="inline-flex items-center bg-blue-600/20 px-3 py-1 rounded-full text-sm">
                <CreditCard className="h-3 w-3 mr-1" />
                Paiement par carte bancaire
              </div>
            )}
            
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
                <p className="text-lg">Solde actuel: <span className="font-bold">{card.amount}€</span></p>
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
