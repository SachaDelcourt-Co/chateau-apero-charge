
import React, { useState } from 'react';
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CreditCard, CheckCircle } from "lucide-react";
import { getCardById, getTableCardById, updateCardAmount, updateTableCardAmount } from '@/lib/supabase';

const CardTopup: React.FC = () => {
  const [cardId, setCardId] = useState('');
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [currentAmount, setCurrentAmount] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!cardId || !amount) {
      toast({
        title: "Champs requis",
        description: "Veuillez entrer un numéro de carte et un montant",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    setSuccess(false);
    
    try {
      // Vérifier d'abord dans table_cards
      let tableCard = await getTableCardById(cardId);
      
      if (tableCard) {
        // Carte trouvée dans table_cards
        const currentAmountValue = tableCard.amount?.toString() || '0';
        setCurrentAmount(currentAmountValue);
        
        // Calculer le nouveau montant
        const newAmount = (parseFloat(currentAmountValue) + parseFloat(amount)).toString();
        
        // Mettre à jour le montant
        const success = await updateTableCardAmount(cardId, newAmount);
        
        if (success) {
          setSuccess(true);
          toast({
            title: "Carte rechargée",
            description: `La carte ${cardId} a été rechargée de ${amount}€`,
          });
        } else {
          toast({
            title: "Erreur",
            description: "Erreur lors de la mise à jour du montant",
            variant: "destructive"
          });
        }
      } else {
        // Vérifier dans la table cards
        const card = await getCardById(cardId);
        
        if (card) {
          // Carte trouvée dans cards
          const currentAmountValue = card.amount || '0';
          setCurrentAmount(currentAmountValue);
          
          // Calculer le nouveau montant
          const newAmount = (parseFloat(currentAmountValue) + parseFloat(amount)).toString();
          
          // Mettre à jour le montant
          const success = await updateCardAmount(cardId, newAmount);
          
          if (success) {
            setSuccess(true);
            toast({
              title: "Carte rechargée",
              description: `La carte ${cardId} a été rechargée de ${amount}€`,
            });
          } else {
            toast({
              title: "Erreur",
              description: "Erreur lors de la mise à jour du montant",
              variant: "destructive"
            });
          }
        } else {
          toast({
            title: "Carte non trouvée",
            description: "Aucune carte trouvée avec ce numéro",
            variant: "destructive"
          });
        }
      }
    } catch (error) {
      console.error("Erreur lors de la recharge:", error);
      toast({
        title: "Erreur",
        description: "Une erreur est survenue lors de la recharge",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setCardId('');
    setAmount('');
    setSuccess(false);
    setCurrentAmount(null);
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="text-xl font-semibold mb-4">Recharger une carte</h2>
        
        {success ? (
          <div className="flex flex-col items-center py-6">
            <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
            <p className="mb-2">Carte rechargée avec succès!</p>
            <p className="mb-4">
              <span className="font-medium">Numéro de carte:</span> {cardId}<br />
              <span className="font-medium">Ancien solde:</span> {currentAmount}€<br />
              <span className="font-medium">Montant ajouté:</span> {amount}€<br />
              <span className="font-medium">Nouveau solde:</span> {parseFloat(currentAmount || '0') + parseFloat(amount)}€
            </p>
            <Button onClick={handleReset}>Recharger une autre carte</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="card-id">Numéro de carte</Label>
              <div className="relative">
                <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="card-id"
                  value={cardId}
                  onChange={(e) => setCardId(e.target.value)}
                  placeholder="Entrez le numéro de la carte"
                  className="pl-10"
                  disabled={isLoading}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="amount">Montant (€)</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Montant à recharger"
                disabled={isLoading}
              />
            </div>
            
            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Chargement...
                </>
              ) : (
                "Recharger la carte"
              )}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
};

export default CardTopup;
