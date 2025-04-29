
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from "@/hooks/use-toast";
import ChateauBackground from '@/components/ChateauBackground';
import ChateauCard from '@/components/ChateauCard';
import ChateauLogo from '@/components/ChateauLogo';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getTableCardById, updateTableCardAmount, TableCard } from '@/lib/supabase';
import { Loader2, CreditCard, AlertCircle } from "lucide-react";
import { redirectToCheckout } from '@/api/stripe';

const Payment: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [stripeProcessing, setStripeProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [card, setCard] = useState<TableCard | null>(null);
  const [amount, setAmount] = useState("");
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!id) {
      setError("ID de carte non valide");
      setLoading(false);
      return;
    }

    const fetchCardDetails = async () => {
      try {
        console.log('Vérification de la carte:', id);
        const cardData = await getTableCardById(id);
        
        console.log('Résultat de la recherche:', cardData);

        if (!cardData) {
          setError("Carte non trouvée");
          setLoading(false);
          return;
        }

        setCard(cardData);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching card details:', error);
        setError("Une erreur s'est produite");
        setLoading(false);
      }
    };

    fetchCardDetails();
  }, [id]);

  const handleStripePayment = async () => {
    if (!amount.trim() || isNaN(Number(amount)) || Number(amount) <= 0) {
      toast({
        title: "Montant invalide",
        description: "Veuillez entrer un montant valide",
        variant: "destructive"
      });
      return;
    }

    setStripeProcessing(true);
    setStripeError(null);

    try {
      await redirectToCheckout(parseFloat(amount), id!);
    } catch (error) {
      console.error("Error creating checkout session:", error);
      setStripeError("Une erreur s'est produite lors de la création de la session de paiement");
      toast({
        title: "Erreur",
        description: "Une erreur s'est produite lors de la création de la session de paiement",
        variant: "destructive"
      });
      setStripeProcessing(false);
    }
  };

  const handleRecharge = async () => {
    if (!amount.trim() || isNaN(Number(amount)) || Number(amount) <= 0) {
      toast({
        title: "Montant invalide",
        description: "Veuillez entrer un montant valide",
        variant: "destructive"
      });
      return;
    }

    setProcessing(true);

    try {
      // Calculate new amount by adding the recharge amount to the existing balance
      const currentAmount = card?.amount ? parseFloat(card.amount.toString()) : 0;
      const rechargeAmount = parseFloat(amount);
      const newAmount = (currentAmount + rechargeAmount).toString();
      
      const success = await updateTableCardAmount(id!, newAmount);
      
      if (success) {
        // Redirection vers la page de succès avec le montant rechargé
        navigate(`/payment-success?amount=${rechargeAmount}&cardId=${id}`);
      } else {
        toast({
          title: "Erreur",
          description: "Impossible de mettre à jour le montant de la carte",
          variant: "destructive"
        });
        setProcessing(false);
      }
    } catch (error) {
      console.error("Error updating card amount:", error);
      toast({
        title: "Erreur",
        description: "Une erreur s'est produite lors de la mise à jour du montant",
        variant: "destructive"
      });
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <ChateauBackground>
        <ChateauCard className="w-full max-w-md">
          <div className="flex flex-col items-center justify-center space-y-6">
            <ChateauLogo />
            <div className="text-white text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
              <p>Chargement des détails de la carte...</p>
            </div>
          </div>
        </ChateauCard>
      </ChateauBackground>
    );
  }

  if (error) {
    return (
      <ChateauBackground>
        <ChateauCard className="w-full max-w-md">
          <div className="flex flex-col items-center justify-center space-y-6">
            <ChateauLogo />
            <div className="text-white text-center">
              <p className="mb-4">{error}</p>
              <Button
                className="bg-white text-amber-800 hover:bg-amber-50 px-4 py-2 rounded"
                onClick={() => navigate("/")}
              >
                Retour à l'accueil
              </Button>
            </div>
          </div>
        </ChateauCard>
      </ChateauBackground>
    );
  }

  return (
    <ChateauBackground>
      <ChateauCard className="w-full max-w-md">
        <div className="flex flex-col items-center justify-center space-y-6">
          <ChateauLogo />
          <div className="text-white text-center w-full">
            <h2 className="text-xl font-bold mb-4">Recharger votre carte</h2>
            <p className="mb-6">ID de carte: <span className="font-mono">{id}</span></p>
            <p className="mb-6">Montant actuel: <span className="font-mono">{card?.amount || '0.00'}€</span></p>
            
            <div className="space-y-4">
              <div>
                <label htmlFor="amount" className="block text-sm mb-1">Montant à recharger (€)</label>
                <Input
                  id="amount"
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="bg-white/80 border-amber-200 placeholder:text-amber-800/50 w-full text-black"
                />
              </div>
              
              {stripeError && (
                <div className="bg-red-500/20 text-white p-3 rounded-md flex items-center">
                  <AlertCircle className="h-5 w-5 mr-2" />
                  {stripeError}
                </div>
              )}
              
              <Button
                className="w-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleStripePayment}
                disabled={stripeProcessing}
              >
                {stripeProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CreditCard className="h-4 w-4 mr-2" />}
                {stripeProcessing ? "Traitement en cours..." : "Payer par carte bancaire"}
              </Button>
              
              <Button
                className="w-full bg-white text-amber-800 hover:bg-amber-50"
                onClick={handleRecharge}
                disabled={processing || stripeProcessing}
              >
                {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {processing ? "Traitement en cours..." : "Recharger avec espèces"}
              </Button>
              
              <Button
                variant="outline"
                className="w-full bg-transparent text-white border-white hover:bg-white/10"
                onClick={() => navigate("/")}
                disabled={processing || stripeProcessing}
              >
                Annuler
              </Button>
            </div>
          </div>
        </div>
      </ChateauCard>
    </ChateauBackground>
  );
};

export default Payment;
