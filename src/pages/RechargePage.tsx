import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import ChateauLogo from '@/components/ChateauLogo';
import CardTopup from '@/components/admin/CardTopup';
import { Home, LogOut, History } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { NfcDebugger } from '@/components/NfcDebugger';
import { NfcTest } from '@/components/NfcTest';
import { logger } from '@/lib/logger';

// Transaction history component to show recent recharges
const RecentTransactions = () => {
  const [transactions, setTransactions] = useState<any[]>([]);
  const isMobile = useIsMobile();

  useEffect(() => {
    // Get recent recharge logs from localStorage
    const allLogs = logger.getAllLogs();
    const rechargeLogs = allLogs.recharge || [];
    
    // Filter for successful recharges only and sort by timestamp (newest first)
    const successfulRecharges = Array.isArray(rechargeLogs) 
      ? rechargeLogs
        .filter(log => log.event === 'recharge_success')
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 5) // Get only the 5 most recent
      : [];
    
    setTransactions(successfulRecharges);
  }, []);

  if (transactions.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-200">
      <div className="flex items-center mb-3">
        <History className="h-4 w-4 mr-2 text-gray-600" />
        <h3 className="text-sm sm:text-base font-medium">Recharges récentes</h3>
      </div>
      <div className="space-y-2">
        {transactions.map((tx, index) => (
          <div key={index} className="bg-white p-2 rounded-md border border-gray-100 text-xs sm:text-sm">
            <div className="flex justify-between">
              <span>Carte: <strong>{tx.data?.cardId || 'N/A'}</strong></span>
              <span className="text-green-600">{tx.data?.amount || '0'}€</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>{tx.formattedTime}</span>
              <span>Nouveau solde: {tx.data?.newBalance != null ? tx.data.newBalance.toFixed(2) : '0.00'}€</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const RechargePage: React.FC = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { signOut, email, isLoggedIn } = useAuth();
  const { toast } = useToast();
  
  // Trigger component refresh when a recharge happens
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // Check if we're in development mode
  const isDevelopment = import.meta.env.MODE === 'development';

  // Effect to redirect to login if not logged in
  useEffect(() => {
    if (!isLoggedIn) {
      navigate('/login');
    }
  }, [isLoggedIn, navigate]);

  const handleLogout = async () => {
    try {
      await signOut();
      
      toast({
        title: "Déconnexion réussie",
        description: "Vous avez été déconnecté avec succès"
      });
      
      // Force navigation to login page after successful logout
      navigate('/login');
    } catch (error) {
      console.error('Error during logout:', error);
      toast({
        title: "Erreur",
        description: "Une erreur est survenue lors de la déconnexion",
        variant: "destructive"
      });
    }
  };

  // Callback when recharge is successful - refresh recent transactions
  const handleRechargeSuccess = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full max-w-6xl mx-auto p-2 sm:p-4">
        <div className="flex justify-between items-center mb-4 sm:mb-6">
          <div className={`flex items-center ${isMobile ? 'space-x-2' : 'space-x-4'}`}>
            <div className={isMobile ? "scale-75 origin-left" : ""}>
              <ChateauLogo />
            </div>
            {email && !isMobile && (
              <div className="text-sm text-gray-600">
                {email}
              </div>
            )}
          </div>
          <div className="flex space-x-2">
            <Button 
              variant="outline" 
              size={isMobile ? "sm" : "default"}
              onClick={() => navigate("/")}
            >
              <Home className="h-4 w-4 mr-1 sm:mr-2" />
              {isMobile ? "" : "Accueil"}
            </Button>
            <Button 
              variant="destructive" 
              size={isMobile ? "sm" : "default"}
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4 mr-1 sm:mr-2" />
              {isMobile ? "" : "Déconnexion"}
            </Button>
          </div>
        </div>
        
        {/* Add test NFC component in development mode */}
        {isDevelopment && <NfcTest />}
        
        <div className="bg-white p-3 sm:p-6 rounded-lg shadow-xl">
          <h1 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-center">
            Recharge de Carte
          </h1>
          
          <div className="mt-2 sm:mt-4">
            <CardTopup onSuccess={handleRechargeSuccess} />
          </div>
        </div>
        
        {/* Transaction history display - updates when refreshTrigger changes */}
        <div key={refreshTrigger}>
          <RecentTransactions />
        </div>
        
        {/* Show NFC debugger only in development mode */}
        {isDevelopment && <NfcDebugger />}
      </div>
    </div>
  );
};

export default RechargePage;
