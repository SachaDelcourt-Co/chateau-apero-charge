import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from "@/hooks/use-toast";
import ChateauBackground from '@/components/ChateauBackground';
import ChateauCard from '@/components/ChateauCard';
import ChateauLogo from '@/components/ChateauLogo';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getTableCardById, TableCard } from '@/lib/supabase';
import { Loader2, CreditCard, AlertCircle } from "lucide-react";
import { redirectToCheckout } from '@/api/stripe';

// Payment method logos
const PAYMENT_LOGOS = {
  bancontact: "https://www.bancontact.com/sites/default/files/2022-12/logo-bancontact-payconiq-color.svg",
  visa: "https://upload.wikimedia.org/wikipedia/commons/5/5e/Visa_Inc._logo.svg",
  mastercard: "https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg"
};

const Payment: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
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
                {stripeProcessing ? "Traitement en cours..." : "Payer par carte ou Bancontact"}
              </Button>
              
              <div className="text-xs text-white/70 text-center mt-1 mb-3">
                Paiement sécurisé via Stripe. Bancontact et cartes de crédit acceptés.
              </div>
              
              <div className="flex justify-center items-center space-x-3 mb-4">
                <img 
                  src={PAYMENT_LOGOS.bancontact} 
                  alt="Bancontact" 
                  className="h-6 bg-white rounded p-0.5" 
                />
                <img 
                  src={PAYMENT_LOGOS.visa} 
                  alt="Visa" 
                  className="h-5" 
                />
                <img 
                  src={PAYMENT_LOGOS.mastercard} 
                  alt="Mastercard" 
                  className="h-5" 
                />
              </div>
              
              <Button
                variant="outline"
                className="w-full bg-transparent text-white border-white hover:bg-white/10"
                onClick={() => navigate("/")}
                disabled={stripeProcessing}
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
