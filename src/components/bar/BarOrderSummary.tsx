
import React from 'react';
import { Button } from "@/components/ui/button";
import { Trash2Icon, CreditCardIcon } from "lucide-react";
import { OrderItem } from '@/lib/supabase';

export interface BarOrderSummaryProps {
  products: Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
    is_deposit?: boolean;
    is_return?: boolean;
  }>;
  total: number;
  onRemoveProduct: (productId: string) => void;
  onClearOrder: () => void;
  onProceedToPayment: () => void;
}

export const BarOrderSummary: React.FC<BarOrderSummaryProps> = ({
  products,
  total,
  onRemoveProduct,
  onClearOrder,
  onProceedToPayment
}) => {
  // Function to determine CSS classes based on product type
  const getItemClasses = (item: {is_deposit?: boolean; is_return?: boolean}) => {
    if (item.is_deposit) return "border-l-4 border-yellow-400 pl-2";
    if (item.is_return) return "border-l-4 border-green-400 pl-2 text-green-600";
    return "";
  };

  return (
    <div className="space-y-4">
      {products.length === 0 ? (
        <div className="text-center p-8 text-gray-500">
          Panier vide
        </div>
      ) : (
        <>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {products.map((item) => (
              <div 
                key={`${item.id}-${item.name}`} 
                className={`flex justify-between items-center p-2 bg-white rounded-md shadow-sm ${getItemClasses(item)}`}
              >
                <div className="flex-1">
                  <div className="font-medium">{item.name}</div>
                  <div className="text-sm text-gray-500">
                    {item.price.toFixed(2)}€ x {item.quantity}
                  </div>
                </div>
                <div className="font-semibold text-right mr-2">
                  {(item.price * item.quantity).toFixed(2)}€
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => onRemoveProduct(item.id)}
                  className="text-red-500 hover:bg-red-50 hover:text-red-600 p-1 h-auto"
                >
                  <Trash2Icon className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex justify-between font-bold p-2 border-t border-dashed">
            <span>Total</span>
            <span>{total.toFixed(2)}€</span>
          </div>

          <div className="flex justify-between space-x-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onClearOrder}
              className="flex-1"
            >
              Vider
            </Button>
            <Button 
              variant="default"
              size="sm" 
              onClick={onProceedToPayment}
              className="flex-1"
            >
              <CreditCardIcon className="h-4 w-4 mr-2" />
              Payer
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
