import React, { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { BarProductList } from './BarProductList';
import { BarOrderSummary } from './BarOrderSummary';
import { BarPaymentForm } from './BarPaymentForm';
import { ScanIcon, CreditCardIcon, ArrowLeftIcon, ArrowRightIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getBarProducts, getCardBalance, registerPayment, BarProduct } from '@/lib/supabase';
import { useNfc } from '@/hooks/use-nfc';

export interface BarOrder {
  products: Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
    is_return?: boolean;
    is_deposit?: boolean;
  }>;
  total: number;
}

export interface BarOrderSystemProps {
  pointOfSale: number;
}

export const BarOrderSystem: React.FC<BarOrderSystemProps> = ({ pointOfSale }) => {
  const [products, setProducts] = useState<BarProduct[]>([]);
  const [currentOrder, setCurrentOrder] = useState<BarOrder>({ products: [], total: 0 });
  const [paymentSuccessful, setPaymentSuccessful] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'scan' | 'manual'>('scan');
  const [isPaymentProcessing, setIsPaymentProcessing] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const { toast } = useToast();
  const { isScanning, isSupported, lastScannedId, startScan, stopScan } = useNfc();

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const productList = await getBarProducts();
      setProducts(productList);
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de charger les produits",
        variant: "destructive"
      });
    }
  };

  const addProductToOrder = (product: BarProduct) => {
    const existingProductIndex = currentOrder.products.findIndex(p => p.id === product.id);

    if (existingProductIndex > -1) {
      const updatedProducts = [...currentOrder.products];
      updatedProducts[existingProductIndex].quantity += 1;
      updatedProducts[existingProductIndex].price = product.price;

      setCurrentOrder({
        ...currentOrder,
        products: updatedProducts,
        total: updatedProducts.reduce((acc, p) => acc + (p.price * p.quantity), 0)
      });
    } else {
      const updatedProducts = [...currentOrder.products, { 
        ...product, 
        quantity: 1, 
        is_return: product.is_return,
        is_deposit: product.is_deposit
      }];
      
      setCurrentOrder({
        ...currentOrder,
        products: updatedProducts,
        total: updatedProducts.reduce((acc, p) => acc + (p.price * p.quantity), 0)
      });
    }
  };

  const removeProductFromOrder = (productId: string) => {
    const updatedProducts = currentOrder.products.filter(p => p.id !== productId);
    setCurrentOrder({
      ...currentOrder,
      products: updatedProducts,
      total: updatedProducts.reduce((acc, p) => acc + (p.price * p.quantity), 0)
    });
  };

  const clearOrder = () => {
    setCurrentOrder({ products: [], total: 0 });
  };

  const handlePaymentModeChange = (mode: 'scan' | 'manual') => {
    setPaymentMode(mode);
    setShowPaymentForm(true);
  };

  const cancelPayment = () => {
    setShowPaymentForm(false);
    setPaymentMode('scan');
  };

  const resetOrder = () => {
    clearOrder();
    setPaymentSuccessful(false);
    setShowPaymentForm(false);
    setPaymentMode('scan');
  };

  const processPayment = async (cardId: string) => {
    if (!cardId) {
      toast({
        title: "Erreur",
        description: "Veuillez scanner ou entrer un ID de carte valide.",
        variant: "destructive"
      });
      return;
    }

    if (currentOrder.products.length === 0) {
      toast({
        title: "Erreur",
        description: "Votre commande est vide. Veuillez ajouter des produits.",
        variant: "destructive"
      });
      return;
    }

    setIsPaymentProcessing(true);
    try {
      const result = await registerPayment({
        cardId,
        products: currentOrder.products,
        total: currentOrder.total,
        pointOfSale: String(pointOfSale)
      });

      if (result?.success) {
        toast({
          title: "Paiement réussi",
          description: "Le paiement a été effectué avec succès.",
        });
        setPaymentSuccessful(true);
        setShowPaymentForm(false);
        resetOrder();
      } else {
        toast({
          title: "Erreur de paiement",
          description: result?.message || "Une erreur est survenue lors du paiement.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Payment error:", error);
      toast({
        title: "Erreur",
        description: "Une erreur est survenue lors du traitement du paiement.",
        variant: "destructive"
      });
    } finally {
      setIsPaymentProcessing(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* Product List Section */}
      <div className="w-full md:w-3/5 p-4">
        <h2 className="text-xl font-semibold mb-4">Produits</h2>
        <BarProductList products={products} onAddProduct={addProductToOrder} />
      </div>

      {/* Order Summary and Payment Section */}
      <div className="w-full md:w-2/5 p-4 bg-gray-50">
        <h2 className="text-xl font-semibold mb-4">Commande</h2>
        <BarOrderSummary
          products={currentOrder.products}
          total={currentOrder.total}
          onRemoveProduct={removeProductFromOrder}
          onClearOrder={clearOrder}
          onProceedToPayment={() => setShowPaymentForm(true)}
        />

        {/* Payment Options */}
        {!showPaymentForm && currentOrder.products.length > 0 && (
          <div className="mt-4">
            <Button
              variant="secondary"
              className="w-full mb-2"
              onClick={() => handlePaymentModeChange('scan')}
              disabled={isPaymentProcessing}
            >
              <ScanIcon className="h-4 w-4 mr-2" />
              Payer avec Scan
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => handlePaymentModeChange('manual')}
              disabled={isPaymentProcessing}
            >
              <CreditCardIcon className="h-4 w-4 mr-2" />
              Entrer ID de la carte
            </Button>
          </div>
        )}

        {/* Payment Form */}
        {showPaymentForm && (
          <div className="mt-4">
            <BarPaymentForm
              onSubmit={processPayment}
              onCancel={cancelPayment}
              total={currentOrder.total}
              nfcCardId={lastScannedId}
            />
          </div>
        )}
      </div>
    </div>
  );
};
