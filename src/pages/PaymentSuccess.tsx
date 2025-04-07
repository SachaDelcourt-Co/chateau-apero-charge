
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ChateauBackground from '@/components/ChateauBackground';
import ChateauCard from '@/components/ChateauCard';
import ChateauLogo from '@/components/ChateauLogo';
import { Button } from "@/components/ui/button";
import { CheckCircle, Loader2 } from "lucide-react";
import { updateTableCardAmount } from '@/lib/supabase';
import { useToast } from "@/components/ui/use-toast";

const PaymentSuccess: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [updating, setUpdating] = useState(true);
  const cardId = searchParams.get('cardId');
  const amount = searchParams.get('amount');
  const { toast } = useToast();

  useEffect(() => {
    const updateCardBalance = async () => {
      if (!cardId || !amount) {
        toast({
          title: "Paramètres manquants",
          description: "Impossible de mettre à jour le montant de la carte",
          variant: "destructive"
        });
        setUpdating(false);
        return;
      }

      try {
        const success = await updateTableCardAmount(cardId, amount);
        
        if (!success) {
          toast({
            title: "Erreur",
            description: "Impossible de mettre à jour le montant de la carte",
            variant: "destructive"
          });
        }
      } catch (error) {
        console.error("Error updating card amount:", error);
        toast({
          title: "Erreur",
          description: "Une erreur s'est produite lors de la mise à jour du montant",
          variant: "destructive"
        });
      } finally {
        setUpdating(false);
      }
    };

    updateCardBalance();
  }, [cardId, amount, toast]);

  return (
    <ChateauBackground>
      <ChateauCard className="w-full max-w-md">
        <div className="flex flex-col items-center justify-center space-y-6">
          <ChateauLogo />
          
          {updating ? (
            <div className="text-white text-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin mx-auto" />
              <p>Mise à jour du solde de votre carte...</p>
            </div>
          ) : (
            <div className="text-white text-center space-y-4">
              <CheckCircle className="h-12 w-12 mx-auto text-green-400" />
              <h2 className="text-xl font-medium">Paiement réussi !</h2>
              <p>Votre carte a été rechargée de {amount}€ avec succès.</p>
              <p className="text-sm">
                Traitez cette carte comme du cash.<br />
                En cas de perte, vous ne serez pas remboursé.
              </p>
            </div>
          )}
          
          <Button
            className="bg-white text-amber-800 hover:bg-amber-50 w-full"
            onClick={() => navigate("/")}
            disabled={updating}
          >
            Retour à l'accueil
          </Button>
        </div>
      </ChateauCard>
    </ChateauBackground>
  );
};

export default PaymentSuccess;
