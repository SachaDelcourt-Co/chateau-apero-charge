import React, { useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { CheckCircle2, Home } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getCardBalance } from '@/lib/supabase';

const PaymentSuccess: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const [balance, setBalance] = React.useState<number | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const success = params.get('success');

    if (success === 'true') {
      toast({
        title: "Paiement réussi!",
        description: "Votre paiement a été effectué avec succès.",
      });
    } else {
      toast({
        title: "Paiement échoué!",
        description: "Votre paiement a échoué. Veuillez réessayer.",
        variant: "destructive",
      });
    }

    const fetchCardBalance = async () => {
      // Get card ID from URL parameters
      const cardParam = params.get('card');
      if (cardParam) {
        // Convert to string to fix type error
        const cardData = await getCardBalance(String(cardParam));

        if (cardData) {
          setBalance(cardData.balance);
        } else {
          toast({
            title: "Erreur",
            description: "Impossible de récupérer le solde de la carte.",
            variant: "destructive",
          });
        }
      }
    };

    fetchCardBalance();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded shadow-md w-96">
        <div className="flex items-center justify-center mb-4">
          <CheckCircle2 className="text-green-500 w-12 h-12 mr-2" />
          <h2 className="text-2xl font-semibold text-gray-800">Succès!</h2>
        </div>
        <p className="text-gray-600 mb-4">
          Votre paiement a été traité avec succès.
        </p>
        {balance !== null && (
          <p className="text-gray-600 mb-4">
            Nouveau solde: {balance.toFixed(2)}€
          </p>
        )}
        <div className="flex justify-between">
          <Button onClick={() => navigate('/')} variant="outline">
            <Home className="w-4 h-4 mr-2" />
            Retour à l'accueil
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PaymentSuccess;
