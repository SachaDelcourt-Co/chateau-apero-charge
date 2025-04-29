
import React, { useState } from 'react';
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CreditCard, CheckCircle } from "lucide-react";
import { getTableCardById, updateTableCardAmount } from '@/lib/supabase';
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";

interface CardTopupProps {
  onSuccess?: () => void;
}

const CardTopup: React.FC<CardTopupProps> = ({ onSuccess }) => {
  const [cardId, setCardId] = useState('');
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [currentAmount, setCurrentAmount] = useState<string | null>(null);
  const [paidByCard, setPaidByCard] = useState(false);
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
      // Vérifier dans table_cards
      let tableCard = await getTableCardById(cardId);
      
      if (tableCard) {
        // Carte trouvée dans table_cards
        const currentAmountValue = tableCard.amount?.toString() || '0';
        setCurrentAmount(currentAmountValue);
        
        // Calculer le nouveau montant en additionnant l'ancien montant et le montant de recharge
        const newAmount = (parseFloat(currentAmountValue) + parseFloat(amount)).toString();
        
        // Mettre à jour le montant
        const success = await updateTableCardAmount(cardId, newAmount);
        
        if (success) {
          // Enregistrer la recharge dans la nouvelle table recharge
          const { error } = await supabase
            .from('recharge')
            .insert({
              id_card: cardId,
              amount: parseFloat(amount),
              paid_by_card: paidByCard
            });
            
          if (error) {
            console.error("Erreur lors de l'enregistrement de la recharge:", error);
            toast({
              title: "Attention",
              description: "La carte a été rechargée, mais l'historique n'a pas pu être enregistré.",
              variant: "destructive"
            });
          }
          
          setSuccess(true);
          toast({
            title: "Carte rechargée",
            description: `La carte ${cardId} a été rechargée de ${amount}€`,
          });
          
          // Call the onSuccess callback if provided
          if (onSuccess) {
            onSuccess();
          }
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
          description: "Aucune carte trouvée avec cet identifiant",
          variant: "destructive"
        });
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
    setPaidByCard(false);
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
              <span className="font-medium">Nouveau solde:</span> {parseFloat(currentAmount || '0') + parseFloat(amount)}€<br />
              <span className="font-medium">Payé par carte:</span> {paidByCard ? "Oui" : "Non"}
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
            
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="paid-by-card" 
                checked={paidByCard} 
                onCheckedChange={(checked) => setPaidByCard(checked === true)}
              />
              <Label 
                htmlFor="paid-by-card" 
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Payé par carte
              </Label>
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
