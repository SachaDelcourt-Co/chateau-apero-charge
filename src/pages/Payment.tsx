
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from "@/components/ui/use-toast";
import ChateauBackground from '@/components/ChateauBackground';
import ChateauCard from '@/components/ChateauCard';
import ChateauLogo from '@/components/ChateauLogo';
import { Button } from "@/components/ui/input";
import { supabase } from '@/lib/supabase';
import { Loader2 } from "lucide-react";

const Payment: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
        const { data, error } = await supabase
          .from('cards')
          .select('*')
          .eq('id', id)
          .single();

        if (error || !data) {
          setError("Carte non trouvée");
          setLoading(false);
          return;
        }

        // Si la carte existe, nous pouvons maintenant rediriger vers Stripe
        // Normalement, nous devrions appeler une fonction Edge Supabase ici
        // Cependant, pour la démonstration, nous simulerons cette partie
        
        // Simulation de l'appel à la fonction Edge pour créer une session Stripe
        setTimeout(() => {
          setLoading(false);
          // Dans un cas réel, nous redirigerions vers l'URL de session Stripe retournée par la fonction Edge
          // Pour la démo, nous redirigeons vers la page de succès
          navigate("/payment-success");
        }, 1500);
      } catch (error) {
        console.error('Error fetching card details:', error);
        setError("Une erreur s'est produite");
        setLoading(false);
      }
    };

    fetchCardDetails();
  }, [id, navigate]);

  if (loading) {
    return (
      <ChateauBackground>
        <ChateauCard className="w-full max-w-md">
          <div className="flex flex-col items-center justify-center space-y-6">
            <ChateauLogo />
            <div className="text-white text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
              <p>Préparation de votre paiement...</p>
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
          <div className="text-white text-center">
            <p>Redirection vers la page de paiement...</p>
          </div>
        </div>
      </ChateauCard>
    </ChateauBackground>
  );
};

export default Payment;
