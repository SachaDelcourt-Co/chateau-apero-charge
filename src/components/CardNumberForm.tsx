
import React, { useState } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getCardById } from "@/lib/supabase";
import { useNavigate } from "react-router-dom";

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

    try {
      const card = await getCardById(cardId.trim());
      
      if (!card) {
        toast({
          title: "Carte non trouvée",
          description: "Cet ID de carte n'existe pas dans notre système",
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
        description: "Une erreur s'est produite lors de la vérification de la carte",
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
          placeholder="ID de carte"
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
        {isLoading ? "Vérification..." : "Accéder au paiement"}
      </Button>
    </form>
  );
};

export default CardNumberForm;
