
import React, { useState } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getTableCardById } from "@/lib/supabase";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

const CardNumberForm: React.FC = () => {
  const [cardId, setCardId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!cardId.trim()) {
      toast({
        title: "Erreur",
        description: "Veuillez entrer un ID de carte",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    console.log(`Vérification de la carte: ${cardId.trim()}`);

    try {
      const card = await getTableCardById(cardId.trim());
      console.log('Résultat de la recherche:', card);
      
      if (!card) {
        toast({
          title: "Carte non trouvée",
          description: "Cet ID de carte n'existe pas dans notre système. Veuillez vérifier l'ID et réessayer.",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      // Si nous avons trouvé la carte, redirigez vers la page de paiement
      navigate(`/payment/${card.id}`);
    } catch (error) {
      console.error('Error checking card:', error);
      toast({
        title: "Erreur",
        description: "Une erreur s'est produite lors de la vérification de la carte. Veuillez réessayer plus tard.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-4">
      <div className="space-y-2">
        <Input
          type="text"
          placeholder="ID de carte (ex: CARD001)"
          value={cardId}
          onChange={(e) => setCardId(e.target.value)}
          className="bg-white/80 border-amber-200 placeholder:text-amber-800/50"
        />
      </div>
      <Button 
        type="submit" 
        className="w-full bg-white text-amber-800 hover:bg-amber-50"
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Vérification...
          </>
        ) : "Accéder au paiement"}
      </Button>
    </form>
  );
};

export default CardNumberForm;
