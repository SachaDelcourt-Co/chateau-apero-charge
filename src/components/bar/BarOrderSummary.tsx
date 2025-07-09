
import React from 'react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { OrderItem } from '@/lib/supabase';
import { Trash2, MinusCircle, Euro, CreditCard, CheckCircle, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useIsMobile } from '@/hooks/use-mobile';

interface BarOrderSummaryProps {
  orderItems: OrderItem[];
  total: number;
  onRemoveItem: (index: number) => void;
  onClearOrder: () => void;
  onProceedToPayment: () => void;
}

export const BarOrderSummary: React.FC<BarOrderSummaryProps> = ({
  orderItems,
  total,
  onRemoveItem,
  onClearOrder,
  onProceedToPayment
}) => {
  const isMobile = useIsMobile();
  const scrollHeight = isMobile ? '200px' : '300px';

  return (
    <Card className="bg-white/90 shadow-lg h-full flex flex-col">
      <CardContent className="p-3 sm:p-6 flex-grow">
        <div className="flex justify-between items-center mb-3 sm:mb-4">
          <h3 className="text-lg sm:text-xl font-semibold">Récapitulatif</h3>
          
          {orderItems.length > 0 && (
            <Button 
              variant="outline" 
              size={isMobile ? "sm" : "default"} 
              className="text-red-600" 
              onClick={onClearOrder}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Effacer
            </Button>
          )}
        </div>
        
        {orderItems.length === 0 ? (
          <div className="text-center text-gray-500 py-6 sm:py-10">
            Votre commande est vide
          </div>
        ) : (
          <ScrollArea className={`h-[${scrollHeight}] pr-4`}>
            <ul className="space-y-2 sm:space-y-3">
              {orderItems.map((item, index) => (
                <li key={`${item.product_name}-${index}`} className="flex justify-between items-center border-b pb-2">
                  <div>
                    <div className="flex items-center">
                      <span className={`font-medium ${item.is_return ? 'text-green-600' : ''}`}>
                        {item.product_name}
                      </span>
                      {item.quantity > 1 && (
                        <span className="ml-2 text-sm bg-gray-200 px-2 py-0.5 rounded-full">
                          x{item.quantity}
                        </span>
                      )}
                    </div>
                    
                    <div className="text-xs sm:text-sm text-gray-600 flex items-center mt-1">
                      <Euro className="h-3 w-3 mr-1" />
                      <span>
                        {item.is_return 
                          ? `-${(item.price * item.quantity).toFixed(2)}`
                          : (item.price * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  </div>
                  
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-gray-500 hover:text-red-600" 
                    onClick={() => onRemoveItem(index)}
                  >
                    <MinusCircle className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
      
      <CardFooter className="border-t p-3 sm:p-6 flex flex-col">
        <div className="flex justify-between items-center w-full mb-3 sm:mb-4">
          <span className="text-base sm:text-lg font-semibold">Total:</span>
          <span className="text-lg sm:text-xl font-bold flex items-center">
            <Euro className="h-4 w-4 sm:h-5 sm:w-5 mr-1" />
            {total.toFixed(2)}
          </span>
        </div>
        
        <Button 
          className="w-full" 
          size={isMobile ? "default" : "lg"} 
          disabled={orderItems.length === 0}
          onClick={onProceedToPayment}
        >
          <CreditCard className="mr-2 h-5 w-5" />
          Procéder au paiement
        </Button>
      </CardFooter>
    </Card>
  );
};

// New component for showing completed order in a popup
export interface CompletedOrder {
  items: OrderItem[];
  total: number;
  cardId: string;
  newBalance?: number;
  orderId?: number;
}

interface BarOrderCompletedPopupProps {
  isOpen: boolean;
  completedOrder: CompletedOrder | null;
  onClose: () => void;
}

export const BarOrderCompletedPopup: React.FC<BarOrderCompletedPopupProps> = ({
  isOpen,
  completedOrder,
  onClose
}) => {
  const isMobile = useIsMobile();

  if (!completedOrder) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg w-[95vw] max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center text-green-600">
            <CheckCircle className="h-5 w-5 mr-2" />
            Commande Terminée
          </DialogTitle>
        </DialogHeader>
        
        {/* Scrollable content area */}
        <ScrollArea className="flex-1 pr-2">
          <div className="space-y-4 pb-2">
            {/* Order Details */}
            <div className="bg-gray-50 p-3 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">Détails de la commande</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Carte ID:</span>
                  <span className="font-mono">{completedOrder.cardId}</span>
                </div>
                {completedOrder.orderId && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Commande ID:</span>
                    <span className="font-mono text-xs">#{completedOrder.orderId}</span>
                  </div>
                )}
                {completedOrder.newBalance !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Nouveau solde:</span>
                    <span className="font-medium text-green-600">
                      {completedOrder.newBalance.toFixed(2)}€
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Order Items */}
            <div>
              <h4 className="font-medium text-gray-900 mb-2">
                Articles commandés ({completedOrder.items.length} article{completedOrder.items.length > 1 ? 's' : ''})
              </h4>
              <div className="border rounded-md">
                <div className="max-h-[300px] overflow-y-auto">
                  <ul className="divide-y divide-gray-100">
                    {completedOrder.items.map((item, index) => (
                      <li key={`${item.product_name}-${index}`} className="p-3 hover:bg-gray-50">
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center flex-wrap gap-2">
                              <span className={`font-medium text-sm ${item.is_return ? 'text-green-600' : 'text-gray-900'}`}>
                                {item.product_name}
                              </span>
                              {item.quantity > 1 && (
                                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-medium">
                                  ×{item.quantity}
                                </span>
                              )}
                              {item.is_return && (
                                <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full font-medium">
                                  Retour
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {item.price.toFixed(2)}€ {item.quantity > 1 ? `× ${item.quantity}` : ''}
                            </div>
                          </div>
                          <div className="text-sm font-semibold ml-3 flex-shrink-0">
                            <span className={item.is_return ? 'text-green-600' : 'text-gray-900'}>
                              {item.is_return ? '-' : ''}{(item.price * item.quantity).toFixed(2)}€
                            </span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Total */}
            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <div className="flex justify-between items-center">
                <span className="text-lg font-semibold text-green-800">Total payé:</span>
                <span className="text-xl font-bold text-green-600 flex items-center">
                  <Euro className="h-5 w-5 mr-1" />
                  {completedOrder.total.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Fixed footer */}
        <div className="flex-shrink-0 pt-4 border-t">
          <Button onClick={onClose} className="w-full" size={isMobile ? "default" : "lg"}>
            <X className="h-4 w-4 mr-2" />
            Fermer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
