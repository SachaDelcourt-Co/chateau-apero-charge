import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { getCardBalance } from '@/lib/supabase';
import { CreditCardIcon } from 'lucide-react';

interface BarPaymentFormProps {
  onSubmit: (cardId: string) => void;
  onCancel: () => void;
  total: number;
  nfcCardId: string | null;
}

export const BarPaymentForm: React.FC<BarPaymentFormProps> = ({
  onSubmit,
  onCancel,
  total,
  nfcCardId
}) => {
  const [cardId, setCardId] = useState('');
  const [cardBalance, setCardBalance] = useState<number | null>(null);
  const [checkingCard, setCheckingCard] = useState(false);
  const [isNfcActive, setIsNfcActive] = useState(false);

  // Effect to check card balance when card ID is entered manually or via NFC
  useEffect(() => {
    if (nfcCardId) {
      setCardId(nfcCardId);
      setIsNfcActive(true);
    } else {
      setIsNfcActive(false);
    }
  }, [nfcCardId]);

  // Manual card ID check
  const checkCardBalance = async () => {
    if (!cardId) {
      toast({
        title: "Erreur",
        description: "Veuillez entrer un numéro de carte",
        variant: "destructive"
      });
      return;
    }
    
    try {
      setCheckingCard(true);
      // Convert ID to string to fix type issue
      const cardData = await getCardBalance(String(cardId)); 
      
      if (cardData) {
        setCardBalance(cardData.balance);
      } else {
        setCardBalance(null);
        toast({
          title: "Erreur",
          description: "Carte non trouvée",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error("Error checking card balance:", error);
      setCardBalance(null);
      toast({
        title: "Erreur",
        description: error.message || "Erreur lors de la vérification du solde",
        variant: "destructive"
      });
    } finally {
      setCheckingCard(false);
    }
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Convert cardId to string to fix type error
    onSubmit(String(cardId));
  };

  // Update cardId state with proper type handling
  const handleCardIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCardId(e.target.value);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Input
          type="text"
          placeholder="Numéro de carte"
          value={cardId}
          onChange={handleCardIdChange}
          disabled={checkingCard || isNfcActive}
        />
      </div>
      
      <div className="flex items-center space-x-2">
        <Button 
          type="button" 
          variant="secondary" 
          onClick={checkCardBalance} 
          disabled={checkingCard || isNfcActive}
        >
          <CreditCardIcon className="h-4 w-4 mr-2" />
          Vérifier le solde
        </Button>
        {cardBalance !== null && (
          <div className="text-sm text-gray-500">
            Solde: {cardBalance.toFixed(2)}€
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" disabled={checkingCard || !cardId}>
          Payer {total.toFixed(2)}€
        </Button>
      </div>
    </form>
  );
};
