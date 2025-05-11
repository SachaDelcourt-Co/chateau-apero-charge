import { useEffect, useState } from 'react';
import Layout from '@/components/layout';
import AppHeader from '@/components/AppHeader';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loadTableCards, TableCard, updateTableCardAmount, createCashTransaction } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { logger } from '@/lib/logger';

export default function CashierPage() {
  useReloadOnFocus();
  const [isWorking, setIsWorking] = useState(false);
  const [cardId, setCardId] = useState('');
  const [amount, setAmount] = useState('');
  const [action, setAction] = useState<'deposit' | 'withdraw'>('deposit');
  const [cards, setCards] = useState<TableCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load all cards on page load
  useEffect(() => {
    logger.info('Cashier page initialized');
    
    const loadCards = async () => {
      setIsLoading(true);
      try {
        const loadedCards = await loadTableCards();
        setCards(loadedCards);
        logger.info('Loaded cards for cashier page', { cardCount: loadedCards.length });
      } catch (error) {
        logger.error('Error loading cards for cashier page', error);
        toast({
          title: 'Erreur',
          description: "Impossible de charger les cartes",
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadCards();
  }, []);

  // Handle amount change
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow only numbers and a single decimal point
    const value = e.target.value.replace(/[^0-9.]/g, '');
    
    // Ensure only one decimal point
    const parts = value.split('.');
    const sanitized = parts.length > 1 
      ? `${parts[0]}.${parts.slice(1).join('')}`
      : value;
    
    setAmount(sanitized);
  };

  // Process the transaction
  const processTransaction = async () => {
    if (!cardId) {
      toast({
        title: 'Erreur',
        description: "Veuillez entrer l'ID de la carte",
        variant: 'destructive',
      });
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      toast({
        title: 'Erreur',
        description: "Veuillez entrer un montant valide",
        variant: 'destructive',
      });
      return;
    }

    setIsWorking(true);
    const amountFloat = parseFloat(amount);
    
    try {
      // Find the card
      const card = cards.find(c => c.id === cardId.trim());
      
      if (!card) {
        toast({
          title: 'Erreur',
          description: "Carte non trouvée",
          variant: 'destructive',
        });
        logger.error('Card not found for cash transaction', { cardId });
        setIsWorking(false);
        return;
      }

      // Log the transaction details
      logger.payment('cash_transaction_initiated', {
        cardId,
        currentBalance: parseFloat(card.amount || '0'),
        amount: amountFloat,
        action
      });

      // Calculate new amount
      const currentAmount = parseFloat(card.amount || '0');
      const newAmount = action === 'deposit' 
        ? currentAmount + amountFloat 
        : currentAmount - amountFloat;
      
      // Verify sufficient funds for withdrawal
      if (action === 'withdraw' && newAmount < 0) {
        toast({
          title: 'Erreur',
          description: "Solde insuffisant pour ce retrait",
          variant: 'destructive',
        });
        logger.payment('cash_transaction_insufficient_funds', {
          cardId,
          currentBalance: currentAmount,
          requestedWithdrawal: amountFloat,
          deficit: Math.abs(newAmount)
        });
        setIsWorking(false);
        return;
      }

      // First create the transaction record
      const transactionResult = await createCashTransaction({
        card_id: cardId.trim(),
        amount: amountFloat,
        type: action
      });

      if (!transactionResult.success) {
        throw new Error("Failed to create transaction record");
      }

      // Then update the card balance
      const updateResult = await updateTableCardAmount(cardId.trim(), newAmount.toString());
      
      if (!updateResult.success) {
        throw new Error("Failed to update card balance");
      }
      
      // Log successful transaction
      logger.payment('cash_transaction_success', {
        cardId,
        previousBalance: currentAmount,
        amount: amountFloat,
        newBalance: newAmount,
        action,
        transactionId: transactionResult.id
      });

      // Update the local card data
      const updatedCards = cards.map(c => {
        if (c.id === cardId.trim()) {
          return { ...c, amount: newAmount.toString() };
        }
        return c;
      });
      
      setCards(updatedCards);
      
      // Show success message
      toast({
        title: 'Succès',
        description: action === 'deposit' 
          ? `${amount}€ ajoutés à la carte. Nouveau solde: ${newAmount.toFixed(2)}€`
          : `${amount}€ retirés de la carte. Nouveau solde: ${newAmount.toFixed(2)}€`,
      });
      
      // Reset form
      setCardId('');
      setAmount('');
      setAction('deposit');
      
    } catch (error) {
      logger.error('Error processing cash transaction', {
        error,
        cardId,
        amount: amountFloat,
        action
      });
      
      toast({
        title: 'Erreur',
        description: "Une erreur s'est produite lors du traitement de la transaction",
        variant: 'destructive',
      });
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <Layout>
      <AppHeader title="Caisse" />
      
      <div className="container mx-auto p-4">
        <Card className="w-full max-w-md mx-auto">
          <CardHeader>
            <CardTitle>Gestion des espèces</CardTitle>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cardId">ID de la carte</Label>
              <Input
                id="cardId"
                placeholder="Entrez l'ID de la carte"
                value={cardId}
                onChange={(e) => setCardId(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="amount">Montant (€)</Label>
              <Input
                id="amount"
                type="text"
                placeholder="0.00"
                value={amount}
                onChange={handleAmountChange}
              />
            </div>
            
            <div className="flex space-x-2 pt-2">
              <Button
                variant={action === 'deposit' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setAction('deposit')}
              >
                Dépôt
              </Button>
              <Button
                variant={action === 'withdraw' ? 'default' : 'outline'} 
                className="flex-1"
                onClick={() => setAction('withdraw')}
              >
                Retrait
              </Button>
            </div>
          </CardContent>
          
          <CardFooter>
            <Button 
              className="w-full" 
              disabled={isWorking}
              onClick={processTransaction}
            >
              {isWorking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Traitement...
                </>
              ) : (
                action === 'deposit' ? 'Ajouter des fonds' : 'Retirer des fonds'
              )}
            </Button>
          </CardFooter>
        </Card>
        
        {isLoading ? (
          <div className="flex justify-center mt-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="mt-8">
            <h2 className="text-xl font-bold mb-4">Cartes disponibles</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {cards.map(card => (
                <Card key={card.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setCardId(card.id)}>
                  <CardContent className="p-4">
                    <div className="font-bold">{card.id}</div>
                    <div>Solde: {parseFloat(card.amount || '0').toFixed(2)}€</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
} 