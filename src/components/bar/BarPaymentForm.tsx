
import React, { useState } from 'react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BarOrder, createBarOrder, getTableCardById } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import { ArrowLeft, CreditCard, CheckCircle, AlertCircle, Loader2, Euro } from 'lucide-react';

interface BarPaymentFormProps {
  order: BarOrder;
  onBack: () => void;
  onComplete: () => void;
}

export const BarPaymentForm: React.FC<BarPaymentFormProps> = ({
  order,
  onBack,
  onComplete
}) => {
  const [cardId, setCardId] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [cardBalance, setCardBalance] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCardIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCardId(e.target.value);
    setErrorMessage(null); // Clear any previous errors
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      // Check if card exists and has sufficient balance
      const card = await getTableCardById(cardId.trim());
      
      if (!card) {
        setErrorMessage("Carte non trouvée. Veuillez vérifier l'ID de la carte.");
        setIsProcessing(false);
        return;
      }

      const cardAmountFloat = parseFloat(card.amount || '0');
      
      if (cardAmountFloat < order.total_amount) {
        setErrorMessage(`Solde insuffisant. La carte dispose de ${cardAmountFloat.toFixed(2)}€ mais le total est de ${order.total_amount.toFixed(2)}€.`);
        setIsProcessing(false);
        return;
      }

      setCardBalance(card.amount);

      // Process the order
      const orderResult = await createBarOrder({
        ...order,
        card_id: cardId.trim()
      });

      if (orderResult.success) {
        setPaymentSuccess(true);
        toast({
          title: "Paiement réussi",
          description: `La commande a été traitée avec succès. Nouveau solde: ${(cardAmountFloat - order.total_amount).toFixed(2)}€`
        });
      } else {
        setErrorMessage("Erreur lors du traitement de la commande. Veuillez réessayer.");
      }
    } catch (error) {
      console.error('Error processing payment:', error);
      setErrorMessage("Une erreur s'est produite. Veuillez réessayer.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (paymentSuccess) {
    const newBalance = parseFloat(cardBalance || '0') - order.total_amount;
    
    return (
      <Card className="bg-white/90 shadow-lg">
        <CardContent className="p-8 flex flex-col items-center">
          <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
          <h3 className="text-2xl font-semibold mb-2">Paiement réussi!</h3>
          <p className="text-gray-600 mb-6 text-center">
            La commande a été traitée avec succès.
          </p>
          
          <div className="bg-gray-100 p-4 rounded-lg w-full max-w-md mb-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-gray-600">ID de carte:</div>
              <div className="font-medium">{cardId}</div>
              
              <div className="text-gray-600">Ancien solde:</div>
              <div className="font-medium">{parseFloat(cardBalance || '0').toFixed(2)}€</div>
              
              <div className="text-gray-600">Montant payé:</div>
              <div className="font-medium">{order.total_amount.toFixed(2)}€</div>
              
              <div className="text-gray-600">Nouveau solde:</div>
              <div className="font-medium">{newBalance.toFixed(2)}€</div>
            </div>
          </div>
          
          <Button onClick={onComplete} size="lg">
            Nouvelle commande
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white/90 shadow-lg">
      <CardContent className="p-6">
        <div className="flex items-center mb-6">
          <Button variant="ghost" onClick={onBack} className="mr-2 p-2">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h3 className="text-xl font-semibold">Paiement</h3>
        </div>
        
        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <h4 className="text-lg font-medium mb-3">Récapitulatif de la commande</h4>
            <div className="bg-gray-100 p-4 rounded-lg mb-4">
              <div className="space-y-2">
                {order.items.map((item, index) => (
                  <div key={index} className="flex justify-between">
                    <span>
                      {item.product_name} {item.quantity > 1 ? `(x${item.quantity})` : ''}
                    </span>
                    <span className={item.is_return ? 'text-green-600 font-medium' : ''}>
                      {item.is_return 
                        ? `-${(item.price * item.quantity).toFixed(2)}€`
                        : `${(item.price * item.quantity).toFixed(2)}€`}
                    </span>
                  </div>
                ))}
                <div className="border-t pt-2 mt-2 flex justify-between font-bold">
                  <span>Total</span>
                  <span className="flex items-center">
                    <Euro className="h-4 w-4 mr-1" />
                    {order.total_amount.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          <div>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="card-id">ID de la carte</Label>
                  <div className="relative mt-1">
                    <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <Input 
                      id="card-id"
                      value={cardId}
                      onChange={handleCardIdChange}
                      placeholder="Entrez l'ID de la carte"
                      className="pl-10"
                      disabled={isProcessing}
                      required
                    />
                  </div>
                </div>
                
                {errorMessage && (
                  <div className="bg-red-100 text-red-800 p-3 rounded-md flex items-start">
                    <AlertCircle className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}
                
                <Button 
                  type="submit" 
                  className="w-full" 
                  size="lg"
                  disabled={isProcessing || !cardId.trim()}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Traitement en cours...
                    </>
                  ) : (
                    "Payer maintenant"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
