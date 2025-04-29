
import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BarOrder, createBarOrder, getTableCardById } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import { ArrowLeft, CreditCard, CheckCircle, AlertCircle, Loader2, Euro } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

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
  const isMobile = useIsMobile();

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
        <CardContent className={`${isMobile ? 'p-4' : 'p-8'} flex flex-col items-center`}>
          <CheckCircle className={`${isMobile ? 'h-12 w-12 mb-3' : 'h-16 w-16 mb-4'} text-green-500`} />
          <h3 className={`${isMobile ? 'text-xl' : 'text-2xl'} font-semibold mb-2 text-center`}>Paiement réussi!</h3>
          <p className="text-gray-600 mb-4 sm:mb-6 text-center">
            La commande a été traitée avec succès.
          </p>
          
          <div className="bg-gray-100 p-3 sm:p-4 rounded-lg w-full max-w-md mb-4 sm:mb-6">
            <div className="grid grid-cols-2 gap-2 sm:gap-4 text-sm sm:text-base">
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
          
          <Button onClick={onComplete} size={isMobile ? "default" : "lg"}>
            Nouvelle commande
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white/90 shadow-lg">
      <CardContent className={`${isMobile ? 'p-3 sm:p-4' : 'p-6'}`}>
        <div className="flex items-center mb-4 sm:mb-6">
          <Button variant="ghost" onClick={onBack} className="mr-2 p-1.5 sm:p-2">
            <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
          <h3 className="text-lg sm:text-xl font-semibold">Paiement</h3>
        </div>
        
        <div className="grid md:grid-cols-2 gap-4 sm:gap-8">
          <div>
            <h4 className="text-base sm:text-lg font-medium mb-2 sm:mb-3">Récapitulatif</h4>
            <div className="bg-gray-100 p-3 sm:p-4 rounded-lg mb-4">
              <div className="space-y-2 text-sm sm:text-base">
                {order.items.map((item, index) => (
                  <div key={index} className="flex justify-between">
                    <span className="truncate pr-2">
                      {item.product_name} {item.quantity > 1 ? `(x${item.quantity})` : ''}
                    </span>
                    <span className={`${item.is_return ? 'text-green-600 font-medium' : ''} whitespace-nowrap`}>
                      {item.is_return 
                        ? `-${(item.price * item.quantity).toFixed(2)}€`
                        : `${(item.price * item.quantity).toFixed(2)}€`}
                    </span>
                  </div>
                ))}
                <div className="border-t pt-2 mt-2 flex justify-between font-bold">
                  <span>Total</span>
                  <span className="flex items-center">
                    <Euro className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                    {order.total_amount.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          <div>
            <form onSubmit={handleSubmit}>
              <div className="space-y-3 sm:space-y-4">
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
                  <div className="bg-red-100 text-red-800 p-2 sm:p-3 rounded-md flex items-start text-sm sm:text-base">
                    <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 mr-2 mt-0.5 flex-shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}
                
                <Button 
                  type="submit" 
                  className="w-full" 
                  size={isMobile ? "default" : "lg"}
                  disabled={isProcessing || !cardId.trim()}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                      Traitement...
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
