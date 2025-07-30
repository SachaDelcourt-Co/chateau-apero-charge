import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  RefreshCw,
  Calendar,
  Users,
  Euro,
  Package,
  Clock,
  TrendingUp,
  BarChart3,
  PieChart,
  Activity,
  CreditCard,
  Repeat,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  FileText,
  Settings,
  AlertCircle,
  CheckCircle,
  Loader2
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { validateBelgianIBAN } from "@/lib/refund-utils";
import { getCETDateRange } from "@/lib/utils";
import FinancialStatistics from "./FinancialStatistics";
import ProductStatistics from "./ProductStatistics";
import TemporalStatisticsComponent from "./TemporalStatistics";

// Edition Configuration Interface
interface EditionConfig {
  id: string;
  name: string;
  dateRange: {
    start: string;
    end: string;
  };
  status: 'done' | 'upcoming';
}

// Statistics Data Interfaces - Streamlined to required metrics only
interface CardLifecycleMetrics {
  averageCardLifespan: number; // in days
  dormancyPeriods: Array<{
    cardId: string;
    lastActivity: string;
    dormancyDays: number;
  }>;
  reactivationRate: number; // percentage of dormant cards that became active again
  cardsByLifecycleStage: {
    new: number; // cards activated this edition
    active: number; // cards with recent activity
    dormant: number; // cards with no activity for >30 days
    abandoned: number; // cards with no activity for >90 days
  };
}

interface UserStatistics {
  totalActivatedCards: number;
  averageAmountRechargedPerCard: number;
  cardReuseRate: number;
}

interface FinancialStatistics {
  totalSales: number;
  totalRecharges: number;
  paymentMethodBreakdown: Array<{
    method: string;
    amount: number;
    percentage: number;
  }>;
  averageSpendingPerCard: number;
  totalRemainingBalance: number;
  hourlyTransactions: Array<{
    hour: string;
    transactions: number;
  }>;
}

interface ProductStatistics {
  topSellingProductsByCategory: Array<{
    category: 'cocktails' | 'beers' | 'soft_drinks';
    products: Array<{
      name: string;
      quantitySold: number;
      revenue: number;
    }>;
  }>;
  hourlySalesByProduct: Array<{
    hour: string;
    productSales: Array<{
      product: string;
      quantity: number;
    }>;
  }>;
}

interface TemporalStatistics {
  rushHourPatterns: {
    recharges: Array<{
      hour: string;
      transactionsPerMinute: number;
    }>;
    barSpending: Array<{
      hour: string;
      transactionsPerHour: number;
    }>;
  };
  averageTransactionInterval: Array<{
    cardId: string;
    averageDurationBetweenTransactions: number; // in minutes
  }>;
}

// Refund Configuration Interfaces
interface RefundDebtorConfig {
  name: string;
  iban: string;
  bic?: string;
  address_line1?: string;
  address_line2?: string;
  country: string;
  organization_id?: string;
  organization_issuer?: string;
}

interface RefundXMLOptions {
  message_id_prefix?: string;
  payment_info_id_prefix?: string;
  instruction_priority?: 'NORM' | 'HIGH';
  service_level?: 'SEPA' | 'PRPT';
  category_purpose?: 'SUPP' | 'SALA' | 'INTC' | 'TREA' | 'TAXS';
  charge_bearer?: 'SLEV' | 'SHAR';
  batch_booking?: boolean;
  requested_execution_date?: string;
}

interface RefundProcessingOptions {
  max_refunds?: number;
  dry_run?: boolean;
  include_warnings?: boolean;
}

interface RefundProcessRequest {
  debtor_config: RefundDebtorConfig;
  xml_options?: RefundXMLOptions;
  processing_options?: RefundProcessingOptions;
}

interface RefundProcessResponse {
  success: boolean;
  message?: string;
  data?: {
    message_id: string;
    transaction_count: number;
    total_amount: number;
    filename: string;
    processing_summary: {
      refunds_processed: number;
      validation_errors: number;
      xml_generation_time_ms: number;
      total_processing_time_ms: number;
    };
  };
  error?: string;
  error_code?: string;
  details?: any;
  request_id: string;
}

// Main Dashboard State Interface
interface DashboardState {
  selectedEdition: string;
  loading: {
    users: boolean;
    financial: boolean;
    products: boolean;
    temporal: boolean;
  };
  data: {
    users: UserStatistics | null;
    financial: FinancialStatistics | null;
    products: ProductStatistics | null;
    temporal: TemporalStatistics | null;
  };
  errors: {
    users: string | null;
    financial: string | null;
    products: string | null;
    temporal: string | null;
  };
  refund: {
    processing: boolean;
    configDialogOpen: boolean;
    config: RefundDebtorConfig;
    xmlOptions: RefundXMLOptions;
    processingOptions: RefundProcessingOptions;
  };
}

// Configuration des Éditions du Festival
const FESTIVAL_EDITIONS: EditionConfig[] = [
  {
    id: 'may-8th',
    name: '8 Mai',
    dateRange: { start: '2025-05-08', end: '2025-05-09' },
    status: 'done'
  },
  {
    id: 'june-19th',
    name: '19 Juin',
    dateRange: { start: '2025-06-19', end: '2025-06-20' },
    status: 'done'
  },
  {
    id: 'july-10th',
    name: '10 Juillet',
    dateRange: { start: '2025-07-10', end: '2025-07-11' },
    status: 'upcoming'
  },
  {
    id: 'august-7th',
    name: '7 Août',
    dateRange: { start: '2025-08-07', end: '2025-08-08' },
    status: 'upcoming'
  },
  {
    id: 'september-11th',
    name: '11 Septembre',
    dateRange: { start: '2025-09-11', end: '2025-09-12' },
    status: 'upcoming'
  },
  {
    id: 'october-9th',
    name: '9 Octobre',
    dateRange: { start: '2025-10-09', end: '2025-10-10' },
    status: 'upcoming'
  }
];

const Dashboard: React.FC = () => {
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('users');
  const [state, setState] = useState<DashboardState>({
    selectedEdition: 'may-8th',
    loading: {
      users: false,
      financial: false,
      products: false,
      temporal: false
    },
    data: {
      users: null,
      financial: null,
      products: null,
      temporal: null
    },
    errors: {
      users: null,
      financial: null,
      products: null,
      temporal: null
    },
    refund: {
      processing: false,
      configDialogOpen: false,
      config: {
        name: '',
        iban: '',
        country: 'BE'
      },
      xmlOptions: {
        message_id_prefix: 'CBC',
        payment_info_id_prefix: 'PMT',
        instruction_priority: 'NORM',
        service_level: 'SEPA',
        category_purpose: 'SUPP',
        charge_bearer: 'SLEV',
        batch_booking: true
      },
      processingOptions: {
        max_refunds: 100,
        dry_run: false,
        include_warnings: true
      }
    }
  });

  // Get selected edition configuration
  const selectedEditionConfig = FESTIVAL_EDITIONS.find(
    edition => edition.id === state.selectedEdition
  );


  // Handle refund configuration dialog
  const handleOpenRefundDialog = () => {
    console.log('Opening refund dialog');
    setState(prev => ({
      ...prev,
      refund: {
        ...prev.refund,
        configDialogOpen: true
      }
    }));
  };

  const handleCloseRefundDialog = () => {
    setState(prev => ({
      ...prev,
      refund: {
        ...prev.refund,
        configDialogOpen: false
      }
    }));
  };

  // Handle refund configuration changes
  const handleRefundConfigChange = (field: keyof RefundDebtorConfig, value: string) => {
    setState(prev => ({
      ...prev,
      refund: {
        ...prev.refund,
        config: {
          ...prev.refund.config,
          [field]: value
        }
      }
    }));
  };

  const handleRefundProcessingOptionChange = (field: keyof RefundProcessingOptions, value: any) => {
    setState(prev => ({
      ...prev,
      refund: {
        ...prev.refund,
        processingOptions: {
          ...prev.refund.processingOptions,
          [field]: value
        }
      }
    }));
  };

  // File download helper
  const downloadFile = (content: string, filename: string, contentType: string) => {
    const blob = new Blob([content], { type: contentType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  // Handle refund generation
  const handleGenerateRefunds = async () => {
    console.log('Starting refund generation process');
    console.log('Current refund config:', state.refund.config);
    
    // Validate configuration
    if (!state.refund.config.name.trim()) {
      toast({
        title: "Configuration Incomplète",
        description: "Le nom de l'organisation est requis",
        variant: "destructive"
      });
      return;
    }

    if (!state.refund.config.iban.trim()) {
      toast({
        title: "Configuration Incomplète",
        description: "L'IBAN est requis",
        variant: "destructive"
      });
      return;
    }

    if (!validateBelgianIBAN(state.refund.config.iban)) {
      toast({
        title: "IBAN Invalide",
        description: "Veuillez saisir un IBAN belge valide",
        variant: "destructive"
      });
      return;
    }

    setState(prev => ({
      ...prev,
      refund: {
        ...prev.refund,
        processing: true,
        configDialogOpen: false
      }
    }));

    try {
      const requestBody: RefundProcessRequest = {
        debtor_config: state.refund.config,
        xml_options: state.refund.xmlOptions,
        processing_options: {
          ...state.refund.processingOptions,
          dry_run: false,
          include_warnings: true
        }
      };

      console.log('Sending refund request:', requestBody);

      // Get the current session to ensure we have authentication
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('Vous devez être connecté pour générer des remboursements');
      }

      // Use supabase.functions.invoke for secure API calls
      const { data, error } = await supabase.functions.invoke('process-refunds', {
        body: requestBody,
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        }
      });

      if (error) {
        console.error('Refund function error:', error);
        throw new Error(error.message || 'Failed to process refunds');
      }

      // Handle the response based on content type
      const response = data;

      console.log('Refund response received:', response);

      // Check if response is XML content (successful file generation)
      if (typeof response === 'string' && response.includes('<?xml')) {
        console.log('Received XML content, length:', response.length);
        
        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
        const filename = `remboursements_${timestamp}.xml`;
        
        // Download the XML file
        downloadFile(response, filename, 'application/xml');
        
        toast({
          title: "Remboursements Générés",
          description: `Le fichier XML a été généré et téléchargé avec succès`,
        });
      } else {
        // Handle JSON response (error)
        const result = response as RefundProcessResponse;
        
        if (result.success) {
          toast({
            title: "Remboursements Traités",
            description: `${result.data?.transaction_count || 0} remboursements traités avec succès`,
          });
        } else {
          throw new Error(result.error || 'Erreur inconnue');
        }
      }

    } catch (error) {
      console.error('Error generating refunds:', error);
      
      let errorMessage = "Erreur lors de la génération des remboursements";
      let errorTitle = "Erreur de Génération";
      
      if (error instanceof Error) {
        if (error.message.includes('Authentication')) {
          errorTitle = "Erreur d'Authentification";
          errorMessage = "Vous devez être connecté pour générer des remboursements";
        } else if (error.message.includes('No refunds available after applying processing filters')) {
          errorTitle = "Aucun Remboursement Disponible";
          errorMessage = "Aucun remboursement valide trouvé après filtrage. Essayez d'activer l'option 'Inclure les remboursements avec avertissements'.";
        } else if (error.message.includes('400')) {
          errorTitle = "Erreur de Configuration";
          errorMessage = "Vérifiez la configuration des remboursements";
        } else if (error.message.includes('401')) {
          errorTitle = "Accès Non Autorisé";
          errorMessage = "Vous n'avez pas les permissions nécessaires";
        } else if (error.message.includes('500')) {
          errorTitle = "Erreur Serveur";
          errorMessage = "Erreur interne du serveur. Veuillez réessayer plus tard";
        } else {
          errorMessage = error.message;
        }
      }
      
      toast({
        title: errorTitle,
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setState(prev => ({
        ...prev,
        refund: {
          ...prev.refund,
          processing: false
        }
      }));
    }
  };

  // Handle edition selection change
  const handleEditionChange = (editionId: string) => {
    setState(prev => ({
      ...prev,
      selectedEdition: editionId,
      // Reset data when changing editions
      data: {
        users: null,
        financial: null,
        products: null,
        temporal: null
      },
      errors: {
        users: null,
        financial: null,
        products: null,
        temporal: null
      }
    }));

    toast({
      title: "Édition Modifiée",
      description: `Basculé vers l'édition ${FESTIVAL_EDITIONS.find(e => e.id === editionId)?.name}`
    });
  };

  // Handle refresh all data
  const handleRefreshAll = async () => {
    setRefreshing(true);
    
    try {
      // Refresh current active tab
      await loadStatistics(activeTab as keyof DashboardState['data']);
      
      toast({
        title: "Données Actualisées",
        description: "Les statistiques ont été mises à jour avec succès"
      });
    } catch (error) {
      console.error('Error refreshing data:', error);
      toast({
        title: "Actualisation Échouée",
        description: "Échec de l'actualisation des données du tableau de bord",
        variant: "destructive"
      });
    } finally {
      setRefreshing(false);
    }
  };

  // Load statistics for specific category
  const loadStatistics = async (category: keyof DashboardState['data']) => {
    if (!selectedEditionConfig) {
      toast({
        title: "Aucune Édition Sélectionnée",
        description: "Veuillez sélectionner une édition du festival",
        variant: "destructive"
      });
      return;
    }

    setState(prev => ({
      ...prev,
      loading: { ...prev.loading, [category]: true },
      errors: { ...prev.errors, [category]: null }
    }));

    try {
      if (category === 'users') {
        const userStats = await fetchUserStatistics(selectedEditionConfig);
        setState(prev => ({
          ...prev,
          loading: { ...prev.loading, [category]: false },
          data: { ...prev.data, [category]: userStats }
        }));
      } else if (category === 'financial') {
        // Financial statistics are handled by the FinancialStatistics component itself
        // Just update the loading state
        setState(prev => ({
          ...prev,
          loading: { ...prev.loading, [category]: false }
        }));
      } else {
        // For products and temporal, the components handle their own data loading
        // Just update the loading state
        setState(prev => ({
          ...prev,
          loading: { ...prev.loading, [category]: false }
        }));
      }
    } catch (error) {
      console.error(`Error loading ${category} statistics:`, error);
      setState(prev => ({
        ...prev,
        loading: { ...prev.loading, [category]: false },
        errors: { ...prev.errors, [category]: `Failed to load ${category} statistics: ${error instanceof Error ? error.message : 'Unknown error'}` }
      }));
    }
  };

  // Handle tab change with automatic data loading
  const handleTabChange = (tabValue: string) => {
    setActiveTab(tabValue);
    
    // Automatically load data for the new tab if not already loaded
    const category = tabValue as keyof DashboardState['data'];
    if (!state.data[category] && !state.loading[category]) {
      loadStatistics(category);
    }
  };

  // Récupérer les statistiques utilisateur depuis Supabase - Métriques simplifiées
  const fetchUserStatistics = async (editionConfig: EditionConfig): Promise<UserStatistics> => {
    // Convert dates to CET timezone to ensure consistent results regardless of user's timezone
    const cetDateRange = getCETDateRange(editionConfig.dateRange.start, editionConfig.dateRange.end);

    try {
      // Fetch all card balances with increased limit
      const { data: cardBalances, error: cardBalancesError } = await supabase
        .from('card_balances')
        .select('*');

      if (cardBalancesError) throw cardBalancesError;
      console.log("cardBalances", cardBalances);


      // Récupérer les recharges dans la plage de dates de l'édition (using CET timezone)
      const { data: recharges, error: rechargesError } = await supabase
        .from('recharges')
        .select('*')
        .gte('created_at', cetDateRange.start)
        .lte('created_at', cetDateRange.end);

      if (rechargesError) throw rechargesError;

      // Cartes activées : cartes avec order_count > 0 OU recharge_count > 0
      const activatedCards = cardBalances?.filter(card =>
        (card.order_count > 0) ||
        (card.recharge_count > 0)
      ) || [];
      console.log("activatedCards", activatedCards);
      
      const totalActivatedCards = activatedCards.length;

      // Calculer le montant moyen rechargé par carte (à partir des recharges dans la plage de dates)
      const totalRechargeAmount = recharges?.reduce((sum, recharge) => sum + (recharge.amount || 0), 0) || 0;
      const averageAmountRechargedPerCard = totalActivatedCards > 0 ? totalRechargeAmount / totalActivatedCards : 0;

      // Taux de réutilisation des cartes : pourcentage de cartes utilisées lors d'éditions précédentes
      // Récupérer les commandes/transactions des éditions précédentes (avant la date de début de l'édition actuelle)
      const { data: previousOrders, error: previousOrdersError } = await supabase
        .from('bar_orders')
        .select('card_id')
        .lt('created_at', cetDateRange.start);

      if (previousOrdersError) {
        console.warn('Error fetching previous orders:', previousOrdersError);
      }

      // Récupérer les recharges des éditions précédentes
      const { data: previousRecharges, error: previousRechargesError } = await supabase
        .from('recharges')
        .select('card_id')
        .lt('created_at', cetDateRange.start);

      if (previousRechargesError) {
        console.warn('Error fetching previous recharges:', previousRechargesError);
      }

      // Créer un set des IDs de cartes utilisées lors d'éditions précédentes
      const previouslyUsedCardIds = new Set<string>();
      
      // Ajouter les IDs des cartes ayant fait des commandes précédemment
      previousOrders?.forEach(order => {
        if (order.card_id) {
          previouslyUsedCardIds.add(order.card_id);
        }
      });
      
      // Ajouter les IDs des cartes ayant fait des recharges précédemment
      previousRecharges?.forEach(recharge => {
        if (recharge.card_id) {
          previouslyUsedCardIds.add(recharge.card_id);
        }
      });

      // Compter les cartes activées lors de cette édition qui ont été utilisées précédemment
      const reuseCards = activatedCards.filter(card => 
        previouslyUsedCardIds.has(card.id)
      );
      
      const cardReuseRate = totalActivatedCards > 0 ? (reuseCards.length / totalActivatedCards) * 100 : 0;

      return {
        totalActivatedCards,
        averageAmountRechargedPerCard,
        cardReuseRate
      };
    } catch (error) {
      console.error('Error fetching user statistics:', error);
      throw error;
    }
  };

  // Auto-load data for the active tab when component mounts or edition/tab changes
  React.useEffect(() => {
    if (selectedEditionConfig && !state.loading[activeTab as keyof DashboardState['data']]) {
      // Load data if no data exists for current tab (either initial load or after edition change)
      if (!state.data[activeTab as keyof DashboardState['data']]) {
        loadStatistics(activeTab as keyof DashboardState['data']);
      }
    }
  }, [state.selectedEdition, activeTab]); // Depend on selectedEdition string to trigger on edition changes

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Tableau de Bord Festival</h2>
          <p className="text-muted-foreground">
            Analyses complètes pour les éditions du festival
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Dialog open={state.refund.configDialogOpen} onOpenChange={(open) => {
            if (open) {
              handleOpenRefundDialog();
            } else {
              handleCloseRefundDialog();
            }
          }}>
            <DialogTrigger asChild>
              <Button
                variant="default"
                size="sm"
                disabled={state.refund.processing}
                className="flex items-center gap-2"
              >
                {state.refund.processing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {state.refund.processing ? 'Génération...' : 'Générer fichier de remboursement'}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Configuration des Remboursements
                </DialogTitle>
                <DialogDescription>
                  Configurez les paramètres pour générer le fichier XML de remboursement CBC
                </DialogDescription>
              </DialogHeader>
              
              <div className="grid gap-6 py-4">
                {/* Debtor Configuration */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Informations du Débiteur
                  </h4>
                  
                  <div className="grid gap-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="debtor-name">Nom de l'organisation *</Label>
                        <Input
                          id="debtor-name"
                          value={state.refund.config.name}
                          onChange={(e) => handleRefundConfigChange('name', e.target.value)}
                          placeholder="Nom de votre organisation"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="debtor-country">Pays *</Label>
                        <Select
                          value={state.refund.config.country}
                          onValueChange={(value) => handleRefundConfigChange('country', value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="BE">Belgique</SelectItem>
                            <SelectItem value="FR">France</SelectItem>
                            <SelectItem value="NL">Pays-Bas</SelectItem>
                            <SelectItem value="DE">Allemagne</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="debtor-iban">IBAN *</Label>
                        <Input
                          id="debtor-iban"
                          value={state.refund.config.iban}
                          onChange={(e) => handleRefundConfigChange('iban', e.target.value.toUpperCase())}
                          placeholder="BE00 0000 0000 0000"
                          className={!validateBelgianIBAN(state.refund.config.iban) && state.refund.config.iban ? 'border-red-500' : ''}
                        />
                        {!validateBelgianIBAN(state.refund.config.iban) && state.refund.config.iban && (
                          <p className="text-sm text-red-500 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            IBAN invalide
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="debtor-bic">BIC (optionnel)</Label>
                        <Input
                          id="debtor-bic"
                          value={state.refund.config.bic || ''}
                          onChange={(e) => handleRefundConfigChange('bic', e.target.value)}
                          placeholder="GKCCBEBB"
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="debtor-address1">Adresse ligne 1</Label>
                      <Input
                        id="debtor-address1"
                        value={state.refund.config.address_line1 || ''}
                        onChange={(e) => handleRefundConfigChange('address_line1', e.target.value)}
                        placeholder="Rue et numéro"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="debtor-address2">Adresse ligne 2</Label>
                      <Input
                        id="debtor-address2"
                        value={state.refund.config.address_line2 || ''}
                        onChange={(e) => handleRefundConfigChange('address_line2', e.target.value)}
                        placeholder="Code postal et ville"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="organization-id">ID Organisation</Label>
                      <Input
                        id="organization-id"
                        value={state.refund.config.organization_id || ''}
                        onChange={(e) => handleRefundConfigChange('organization_id', e.target.value)}
                        placeholder="Numéro d'entreprise BCE"
                      />
                    </div>
                  </div>
                </div>
                
                {/* Processing Options */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Options de Traitement</h4>
                  
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="max-refunds">Nombre maximum de remboursements</Label>
                      <Input
                        id="max-refunds"
                        type="number"
                        min="1"
                        max="1000"
                        value={state.refund.processingOptions.max_refunds || ''}
                        onChange={(e) => handleRefundProcessingOptionChange('max_refunds', parseInt(e.target.value) || undefined)}
                        placeholder="100"
                      />
                    </div>
                    
                  </div>
                </div>
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={handleCloseRefundDialog}>
                  Annuler
                </Button>
                <Button
                  onClick={handleGenerateRefunds}
                  disabled={!state.refund.config.name.trim() || !state.refund.config.iban.trim() || !validateBelgianIBAN(state.refund.config.iban)}
                  className="flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Générer le Fichier XML
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          
          <Button
            onClick={handleRefreshAll}
            variant="outline"
            size="sm"
            disabled={refreshing}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Actualisation...' : 'Actualiser Tout'}
          </Button>
        </div>
      </div>

      {/* Edition Selector Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Édition du Festival
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1">
              <Select
                value={state.selectedEdition}
                onValueChange={handleEditionChange}
              >
                <SelectTrigger className="w-full sm:w-[300px]">
                  <SelectValue placeholder="Sélectionner l'édition du festival" />
                </SelectTrigger>
                <SelectContent>
                  {FESTIVAL_EDITIONS.map((edition) => (
                    <SelectItem key={edition.id} value={edition.id}>
                      <div className="flex items-center gap-2">
                        <span>{edition.name}</span>
                        <Badge
                          variant={edition.status === 'done' ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {edition.status === 'done' ? 'terminé' : 'à venir'}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {selectedEditionConfig && (
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span>
                    {new Date(selectedEditionConfig.dateRange.start).toLocaleDateString()} - {' '}
                    {new Date(selectedEditionConfig.dateRange.end).toLocaleDateString()}
                  </span>
                </div>
                <Badge
                  variant={selectedEditionConfig.status === 'done' ? 'default' : 'secondary'}
                >
                  {selectedEditionConfig.status === 'done' ? 'terminé' : 'à venir'}
                </Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Onglets des Statistiques */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4">
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Statistiques Utilisateurs</span>
            <span className="sm:hidden">Utilisateurs</span>
          </TabsTrigger>
          <TabsTrigger value="financial" className="flex items-center gap-2">
            <Euro className="h-4 w-4" />
            <span className="hidden sm:inline">Statistiques Financières</span>
            <span className="sm:hidden">Financier</span>
          </TabsTrigger>
          <TabsTrigger value="products" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            <span className="hidden sm:inline">Statistiques Produits</span>
            <span className="sm:hidden">Produits</span>
          </TabsTrigger>
          <TabsTrigger value="temporal" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">Statistiques Temporelles</span>
            <span className="sm:hidden">Temporel</span>
          </TabsTrigger>
        </TabsList>

        {/* User Statistics Tab */}
        <TabsContent value="users" className="space-y-6">
          <UserStatisticsComponent
            key={`users-${state.selectedEdition}`}
            loading={state.loading.users}
            error={state.errors.users}
            data={state.data.users}
            onLoad={() => loadStatistics('users')}
            editionName={selectedEditionConfig?.name || ''}
            refreshing={refreshing}
          />
        </TabsContent>

        {/* Financial Statistics Tab */}
        <TabsContent value="financial" className="space-y-6">
          <FinancialStatistics
            key={`financial-${state.selectedEdition}`}
            loading={state.loading.financial}
            error={state.errors.financial}
            onLoad={() => loadStatistics('financial')}
            editionName={selectedEditionConfig?.name || ''}
            editionConfig={selectedEditionConfig}
            refreshing={refreshing}
          />
        </TabsContent>

        {/* Product Statistics Tab */}
        <TabsContent value="products" className="space-y-6">
          <ProductStatistics
            key={`products-${state.selectedEdition}`}
            loading={state.loading.products}
            error={state.errors.products}
            onLoad={() => loadStatistics('products')}
            editionName={selectedEditionConfig?.name || ''}
            editionConfig={selectedEditionConfig}
            refreshing={refreshing}
          />
        </TabsContent>

        {/* Temporal Statistics Tab */}
        <TabsContent value="temporal" className="space-y-6">
          <TemporalStatisticsComponent
            key={`temporal-${state.selectedEdition}`}
            loading={state.loading.temporal}
            error={state.errors.temporal}
            onLoad={() => loadStatistics('temporal')}
            editionName={selectedEditionConfig?.name || ''}
            editionConfig={selectedEditionConfig}
            refreshing={refreshing}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

// Placeholder Components for Each Statistics Category

interface PlaceholderProps {
  loading: boolean;
  error: string | null;
  onLoad: () => void;
  editionName: string;
}

interface UserStatisticsProps {
  loading: boolean;
  error: string | null;
  data: UserStatistics | null;
  onLoad: () => void;
  editionName: string;
  refreshing: boolean;
}

const UserStatisticsComponent: React.FC<UserStatisticsProps> = ({
  loading,
  error,
  data,
  onLoad,
  editionName,
  refreshing
}) => {
  // Note: Auto-loading is now handled by the parent Dashboard component
  // This prevents duplicate loading when edition changes

  const formatCurrency = (amount: number) => `€${amount.toFixed(2)}`;
  const formatPercentage = (percentage: number) => `${percentage.toFixed(1)}%`;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold">Statistiques Utilisateurs - {editionName}</h3>
        <Button
          onClick={onLoad}
          disabled={loading || refreshing}
          variant="outline"
          size="sm"
        >
          {loading || refreshing ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Activity className="h-4 w-4" />
          )}
          {loading ? 'Chargement...' : refreshing ? 'Actualisation...' : 'Charger les Données'}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Cartes de Métriques Clés - Seulement les métriques spécifiées */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Nombre Total de Cartes Activées</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : data ? (
              <div className="text-2xl font-bold">{data.totalActivatedCards.toLocaleString()}</div>
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">--</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Montant Moyen Rechargé par Carte</CardTitle>
            <Euro className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : data ? (
              <div className="text-2xl font-bold">{formatCurrency(data.averageAmountRechargedPerCard)}</div>
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">--</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Taux de Réutilisation des Cartes</CardTitle>
            <Repeat className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : data ? (
              <div>
                <div className="text-2xl font-bold">{formatPercentage(data.cardReuseRate)}</div>
                <p className="text-xs text-muted-foreground">
                  Cartes déjà utilisées lors d'éditions précédentes
                </p>
              </div>
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">--</div>
            )}
          </CardContent>
        </Card>
      </div>

      {!loading && !data && (
        <div className="text-center py-8 text-muted-foreground">
          <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Aucune donnée utilisateur disponible</p>
          <p className="text-sm">Cliquez sur "Charger les Données" pour récupérer les statistiques pour {editionName}</p>
        </div>
      )}
    </div>
  );
};

const FinancialStatisticsPlaceholder: React.FC<PlaceholderProps> = ({ 
  loading, 
  error, 
  onLoad, 
  editionName 
}) => (
  <div className="space-y-6">
    <div className="flex justify-between items-center">
      <h3 className="text-xl font-semibold">Financial Statistics - {editionName}</h3>
      <Button onClick={onLoad} disabled={loading} variant="outline" size="sm">
        {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Euro className="h-4 w-4" />}
        {loading ? 'Loading...' : 'Load Data'}
      </Button>
    </div>

    {error && (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )}

    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {[
        { title: "Total Revenue", icon: Euro },
        { title: "Total Recharges", icon: TrendingUp },
        { title: "Avg Transaction", icon: BarChart3 },
        { title: "Growth Rate", icon: Activity }
      ].map((metric, index) => (
        <Card key={index}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{metric.title}</CardTitle>
            <metric.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">--</div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Financial Analytics Overview</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Euro className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Financial statistics will be displayed here</p>
              <p className="text-sm">Click "Load Data" to fetch statistics for {editionName}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  </div>
);



export default Dashboard;
