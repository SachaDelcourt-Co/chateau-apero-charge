
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Home } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import { supabase } from "@/integrations/supabase/client";
import ChateauLogo from '@/components/ChateauLogo';

const RefundPage: React.FC = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  
  const [cardId, setCardId] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [account, setAccount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!cardId || !firstName || !lastName || !email || !account) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir tous les champs",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    
    try {
      // Insert into refunds table
      const { error } = await supabase
        .from('refunds')
        .insert({
          id_card: cardId,
          "first name": firstName,
          "last name": lastName,
          email,
          account
        });
      
      if (error) throw error;
      
      toast({
        title: "Demande envoyée",
        description: "Votre demande de remboursement a été enregistrée avec succès"
      });
      
      // Reset the form
      setCardId('');
      setFirstName('');
      setLastName('');
      setEmail('');
      setAccount('');
      
    } catch (error) {
      console.error("Erreur lors de l'envoi de la demande:", error);
      toast({
        title: "Erreur",
        description: "Une erreur est survenue lors de l'envoi de votre demande",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full max-w-6xl mx-auto p-2 sm:p-4">
        <div className="flex justify-between items-center mb-4 sm:mb-6">
          <div className={isMobile ? "scale-75 origin-left" : ""}>
            <ChateauLogo />
          </div>
          <Button 
            variant="outline" 
            size={isMobile ? "sm" : "default"}
            onClick={() => navigate("/")}
          >
            <Home className="h-4 w-4 mr-1 sm:mr-2" />
            {isMobile ? "" : "Accueil"}
          </Button>
        </div>
        
        <Card className="p-3 sm:p-6 bg-white shadow-xl">
          <h1 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-center">
            Demande de Remboursement
          </h1>
          
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-md text-sm">
            <p className="font-medium">Information importante</p>
            <p>Des frais de traitement de 1,5€ seront déduits du montant de votre remboursement.</p>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="card-id">Numéro de carte</Label>
              <Input
                id="card-id"
                value={cardId}
                onChange={(e) => setCardId(e.target.value)}
                placeholder="Entrez le numéro de votre carte"
                disabled={isSubmitting}
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first-name">Prénom</Label>
                <Input
                  id="first-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Votre prénom"
                  disabled={isSubmitting}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="last-name">Nom</Label>
                <Input
                  id="last-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Votre nom"
                  disabled={isSubmitting}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.com"
                disabled={isSubmitting}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="account">IBAN</Label>
              <Input
                id="account"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="FR76XXXXXXXXXXXXXXXXXX"
                disabled={isSubmitting}
              />
              <p className="text-xs text-gray-500">Format IBAN de votre compte bancaire pour le remboursement</p>
            </div>
            
            <Button 
              type="submit" 
              className="w-full" 
              disabled={isSubmitting}
            >
              {isSubmitting ? "Traitement en cours..." : "Soumettre la demande"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default RefundPage;
