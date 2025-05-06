
import React from 'react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { OrderItem } from '@/lib/supabase';
import { Trash2, MinusCircle, Euro, CreditCard } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useIsMobile } from '@/hooks/use-mobile';
import { BarOrder } from './BarOrderSystem';

interface BarOrderSummaryProps {
  order: BarOrder;
  onRemoveProduct: (productId: string) => void;
  onClearOrder?: () => void;
  onProceedToPayment?: () => void;
}

export const BarOrderSummary: React.FC<BarOrderSummaryProps> = ({
  order,
  onRemoveProduct,
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
          
          {order.products.length > 0 && onClearOrder && (
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
        
        {order.products.length === 0 ? (
          <div className="text-center text-gray-500 py-6 sm:py-10">
            Votre commande est vide
          </div>
        ) : (
          <ScrollArea className={`h-[${scrollHeight}] pr-4`}>
            <ul className="space-y-2 sm:space-y-3">
              {order.products.map((item, index) => (
                <li key={`${item.name}-${index}`} className="flex justify-between items-center border-b pb-2">
                  <div>
                    <div className="flex items-center">
                      <span className={`font-medium ${item.is_return ? 'text-green-600' : ''}`}>
                        {item.name}
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
                    onClick={() => onRemoveProduct(item.id)}
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
            {order.total.toFixed(2)}
          </span>
        </div>
        
        {onProceedToPayment && (
          <Button 
            className="w-full" 
            size={isMobile ? "default" : "lg"} 
            disabled={order.products.length === 0}
            onClick={onProceedToPayment}
          >
            <CreditCard className="mr-2 h-5 w-5" />
            Procéder au paiement
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};
