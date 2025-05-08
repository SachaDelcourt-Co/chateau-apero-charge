import React, { useState, useEffect } from 'react';
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CreditCard, CheckCircle, Scan, Info } from "lucide-react";
import { getTableCardById, updateTableCardAmount } from '@/lib/supabase';
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { useNfc } from '@/hooks/use-nfc';
import { Alert, AlertDescription } from "@/components/ui/alert";

interface CardTopupProps {
  onSuccess?: () => void;
}

const CardTopup: React.FC<CardTopupProps> = ({ onSuccess }) => {
  const [cardId, setCardId] = useState('');
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingCard, setIsCheckingCard] = useState(false);
  const [success, setSuccess] = useState(false);
  const [currentAmount, setCurrentAmount] = useState<string | null>(null);
  const [paidByCard, setPaidByCard] = useState(false);
  const [cardInfo, setCardInfo] = useState<any>(null);
  const { toast } = useToast();
  
  // Initialize NFC hook with a validation function and scan handler
  const { isScanning, startScan, stopScan, isSupported } = useNfc({
    // Validate that ID is 8 characters long
    validateId: (id) => id.length === 8,
    // Handle scanned ID
    onScan: (id) => {
      console.log('[CardTopup] NFC card scanned with ID:', id);
      setCardId(id);
      checkCardBalance(id);
      // Optional: toast to indicate successful scan
      toast({
        title: "Carte détectée",
        description: `ID de carte: ${id}`,
      });

      stopScan();
    }
  });

  // Effect to check card balance when card ID changes
  useEffect(() => {
    if (cardId.length === 8) {
      checkCardBalance(cardId);
    } else {
      setCardInfo(null);
      setCurrentAmount(null);
    }
  }, [cardId]);

  // Debug effect to log NFC support status
  useEffect(() => {
    console.log('[CardTopup] NFC isSupported:', isSupported);
  }, [isSupported]);

  const checkCardBalance = async (id: string) => {
    if (!id || id.length !== 8) return;
    
    setIsCheckingCard(true);
    try {
      const card = await getTableCardById(id);
      if (card) {
        setCardInfo(card);
        setCurrentAmount(card.amount?.toString() || '0');
      } else {
        setCardInfo(null);
        setCurrentAmount(null);
      }
    } catch (error) {
      console.error('Error checking card:', error);
      setCardInfo(null);
      setCurrentAmount(null);
    } finally {
      setIsCheckingCard(false);
    }
  };

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
          // Ajouter l'enregistrement dans la table paiements
          const { error } = await supabase
            .from('paiements')
            .insert({
              id_card: cardId,
              amount: parseFloat(amount),
              paid_by_card: paidByCard
            });
          
          if (error) {
            console.error('Error logging payment:', error);
            toast({
              title: "Attention",
              description: "La carte a été rechargée mais l'historique n'a pas pu être enregistré",
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
    setPaidByCard(false);
    setSuccess(false);
    setCurrentAmount(null);
    setCardInfo(null);
    // Reset NFC scanning state
    if (isScanning) {
      stopScan();
      // Use setTimeout to ensure scan is properly stopped before restarting
      setTimeout(() => {
        startScan();
      }, 100);
    } else {
      startScan();
    }
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
              <span className="font-medium">Payé par carte:</span> {paidByCard ? 'Oui' : 'Non'}
            </p>
            <Button onClick={handleReset}>Recharger une autre carte</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* NFC Scan Button - Prominent placement */}
            {isSupported !== null && (
              <div className="flex justify-center mb-4">
                <Button
                  type="button"
                  onClick={isScanning ? stopScan : startScan}
                  variant={isScanning ? "destructive" : "default"}
                  size="lg"
                  disabled={isSupported === false}
                  className="w-full text-center"
                >
                  <Scan className="h-5 w-5 mr-2" />
                  {isScanning ? "Arrêter le scan NFC" : "Scanner une carte via NFC"}
                </Button>
              </div>
            )}
            
            {isSupported === false && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>
                  Le scan NFC n'est pas disponible. Cette fonctionnalité nécessite Chrome sur Android avec HTTPS.
                </AlertDescription>
              </Alert>
            )}
            
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
              <div className="flex justify-between items-center mt-1">
                <div>
                  {isCheckingCard ? (
                    <div className="text-sm text-gray-500 flex items-center">
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Vérification...
                    </div>
                  ) : cardInfo ? (
                    <div className="text-sm text-green-600 flex items-center">
                      <Info className="h-3 w-3 mr-1" />
                      Solde actuel: <span className="font-medium ml-1">{parseFloat(currentAmount || '0').toFixed(2)}€</span>
                    </div>
                  ) : cardId.length === 8 ? (
                    <div className="text-sm text-red-600 flex items-center">
                      <Info className="h-3 w-3 mr-1" />
                      Carte non trouvée
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            
            {cardInfo && (
              <Alert className="bg-amber-50 border-amber-200">
                <AlertDescription className="text-amber-700">
                  <div className="flex flex-col space-y-1">
                    <span><strong>ID:</strong> {cardInfo.id}</span>
                  </div>
                </AlertDescription>
              </Alert>
            )}
            
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
            
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 mt-4">
              <div className="flex items-center">
                <Checkbox 
                  id="paid-by-card" 
                  checked={paidByCard}
                  onCheckedChange={(checked) => setPaidByCard(checked === true)}
                  className="h-6 w-6 border-2 border-blue-500"
                />
                <Label 
                  htmlFor="paid-by-card" 
                  className="ml-3 text-base sm:text-lg font-medium text-blue-700 cursor-pointer select-none flex-1"
                >
                  Payé par carte
                </Label>
              </div>
            </div>
            
            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading || !cardInfo}
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
