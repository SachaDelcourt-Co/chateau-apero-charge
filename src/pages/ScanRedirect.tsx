
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from "@/components/ui/use-toast";
import ChateauBackground from '@/components/ChateauBackground';
import ChateauCard from '@/components/ChateauCard';
import ChateauLogo from '@/components/ChateauLogo';
import { Loader2 } from "lucide-react";
import { getTableCardById } from '@/lib/supabase';

const ScanRedirect: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const validateAndRedirect = async () => {
      if (!id) {
        setError("ID de carte manquant");
        setLoading(false);
        return;
      }

      try {
        // Vérifier si la carte existe
        const card = await getTableCardById(id);
        
        if (!card) {
          setError("Carte non trouvée");
          setLoading(false);
          return;
        }

        // Si la carte existe, rediriger vers la page de paiement
        navigate(`/payment/${id}`);
      } catch (err) {
        console.error('Erreur lors de la validation de la carte:', err);
        setError("Une erreur s'est produite lors de la vérification de la carte");
        setLoading(false);
      }
    };

    validateAndRedirect();
  }, [id, navigate, toast]);

  if (error) {
    return (
      <ChateauBackground>
        <ChateauCard className="w-full max-w-md">
          <div className="flex flex-col items-center justify-center space-y-6">
            <ChateauLogo />
            <div className="text-white text-center">
              <h2 className="text-xl font-medium mb-4">Erreur</h2>
              <p>{error}</p>
              <button 
                className="mt-6 bg-white text-amber-800 hover:bg-amber-50 px-4 py-2 rounded"
                onClick={() => navigate("/")}
              >
                Retour à l'accueil
              </button>
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
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
            <p>Redirection vers la page de paiement...</p>
          </div>
        </div>
      </ChateauCard>
    </ChateauBackground>
  );
};

export default ScanRedirect;
