import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  RefreshCw,
  Euro,
  TrendingUp,
  BarChart3,
  Activity,
  CreditCard,
  Wallet,
  PieChart,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  Target,
  AlertTriangle
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
  ComposedChart
} from 'recharts';
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

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

// Financial Statistics Interfaces
interface PaymentMethodBreakdown {
  method: string;
  amount: number;
  percentage: number;
  count: number;
  color: string;
}

interface HourlyTransactionData {
  hour: string;
  stripe: { transactions: number; revenue: number };
  terminal: { transactions: number; revenue: number };
  bar: { transactions: number; revenue: number };
  totalRevenue: number;
}

interface ConversionMetrics {
  rechargeToSpendingRate: number;
  averageTimeToFirstPurchase: number; // in minutes
  cardsWithUnusedBalance: number;
  totalUnusedBalance: number;
}

interface LostSalesAnalysis {
  estimatedLostSales: number;
  insufficientBalanceAttempts: number;
  averageShortfall: number;
  potentialRevenue: number;
}

interface FinancialMetrics {
  totalSales: number;
  totalRecharges: number;
  averageSpendingPerCard: number;
  totalRemainingBalance: number;
  averageTransactionValue: number;
  profitMargin: number;
  revenueGrowth: number;
  activeCards: number;
}

interface FinancialStatisticsData {
  metrics: FinancialMetrics;
  paymentMethodBreakdown: PaymentMethodBreakdown[];
  hourlyTransactionVolume: HourlyTransactionData[];
  conversionMetrics: ConversionMetrics;
  lostSalesAnalysis: LostSalesAnalysis;
  topSpendingHours: Array<{
    hour: string;
    intensity: number;
    revenue: number;
  }>;
  financialHealthIndicators: {
    cashFlowRatio: number;
    utilizationRate: number;
    averageCardBalance: number;
    rechargeToSpendingRatio: number;
  };
}

interface FinancialStatisticsProps {
  loading: boolean;
  error: string | null;
  onLoad: () => void;
  editionName: string;
  editionConfig: EditionConfig | null;
  refreshing?: boolean;
}

const PAYMENT_METHOD_COLORS = {
  'Cash': '#10B981', // Green
  'Card': '#3B82F6', // Blue
  'Stripe': '#8B5CF6', // Purple
};

const FinancialStatistics: React.FC<FinancialStatisticsProps> = ({
  loading,
  error,
  onLoad,
  editionName,
  editionConfig,
  refreshing = false
}) => {
  const [data, setData] = useState<FinancialStatisticsData | null>(null);
  const [internalLoading, setInternalLoading] = useState(false);

  const formatCurrency = (amount: number) => `€${amount.toFixed(2)}`;
  const formatPercentage = (percentage: number) => `${percentage.toFixed(1)}%`;

  // Fetch financial statistics data
  const fetchFinancialStatistics = async () => {
    if (!editionConfig) return;

    setInternalLoading(true);
    try {
      const startDate = editionConfig.dateRange.start;
      const endDate = editionConfig.dateRange.end;

      // Fetch bar orders for total sales
      const { data: barOrders, error: barOrdersError } = await supabase
        .from('bar_orders')
        .select('*')
        .gte('created_at', startDate)
        .lte('created_at', endDate + 'T23:59:59.999Z');

      if (barOrdersError) throw barOrdersError;

      // Fetch recharges for payment method breakdown
      const { data: recharges, error: rechargesError } = await supabase
        .from('recharges')
        .select('*')
        .gte('created_at', startDate)
        .lte('created_at', endDate + 'T23:59:59.999Z');

      if (rechargesError) throw rechargesError;

      // Fetch card balances for remaining balances and card statistics
      const { data: cardBalances, error: cardBalancesError } = await supabase
        .from('card_balances')
        .select('*');

      if (cardBalancesError) throw cardBalancesError;

      // Calculate total sales
      const totalSales = barOrders?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0;

      // Calculate total recharges
      const totalRecharges = recharges?.reduce((sum, recharge) => sum + (recharge.amount || 0), 0) || 0;

      // Calculate payment method breakdown
      const paymentMethods = {
        'Cash': { amount: 0, count: 0 },
        'Card': { amount: 0, count: 0 },
        'Stripe': { amount: 0, count: 0 }
      };

      recharges?.forEach(recharge => {
        const amount = recharge.amount || 0;
        if (recharge.stripe_session_id) {
          paymentMethods['Stripe'].amount += amount;
          paymentMethods['Stripe'].count += 1;
        } else if (recharge.paid_by_card) {
          paymentMethods['Card'].amount += amount;
          paymentMethods['Card'].count += 1;
        } else {
          paymentMethods['Cash'].amount += amount;
          paymentMethods['Cash'].count += 1;
        }
      });

      const paymentMethodBreakdown: PaymentMethodBreakdown[] = Object.entries(paymentMethods).map(([method, data]) => ({
        method,
        amount: data.amount,
        count: data.count,
        percentage: totalRecharges > 0 ? (data.amount / totalRecharges) * 100 : 0,
        color: PAYMENT_METHOD_COLORS[method as keyof typeof PAYMENT_METHOD_COLORS]
      }));

      // Calculate remaining card balances
      const totalRemainingBalance = cardBalances?.reduce((sum, card) => sum + (card.current_balance || 0), 0) || 0;

      // Calculate active cards (cards with transactions)
      const activeCards = cardBalances?.filter(card => 
        (card.order_count && card.order_count > 0) || 
        (card.recharge_count && card.recharge_count > 0)
      ).length || 0;

      // Calculate average spending per card
      const averageSpendingPerCard = activeCards > 0 ? totalSales / activeCards : 0;

      // Calculate average transaction value
      const totalTransactions = (barOrders?.length || 0) + (recharges?.length || 0);
      const averageTransactionValue = totalTransactions > 0 ? (totalSales + totalRecharges) / totalTransactions : 0;

      // Generate 15-minute interval transaction volume from 17:00 to midnight
      const hourlyTransactionVolume: HourlyTransactionData[] = [];
      
      // Create time slots every 15 minutes from 17:00 to 24:00 (midnight)
      const timeSlots: string[] = [];
      for (let hour = 17; hour < 24; hour++) {
        for (let minute = 0; minute < 60; minute += 15) {
          const timeSlot = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
          timeSlots.push(timeSlot);
        }
      }

      // Group transactions by 15-minute intervals with operation types
      const transactionsByTimeSlot = new Map<string, {
        stripe: { transactions: number; revenue: number };
        terminal: { transactions: number; revenue: number };
        bar: { transactions: number; revenue: number };
      }>();
      
      // Initialize all time slots with zero values
      timeSlots.forEach(slot => {
        transactionsByTimeSlot.set(slot, {
          stripe: { transactions: 0, revenue: 0 },
          terminal: { transactions: 0, revenue: 0 },
          bar: { transactions: 0, revenue: 0 }
        });
      });

      // Process recharges (Stripe and terminal)
      recharges?.forEach(recharge => {
        const rechargeDate = new Date(recharge.created_at);
        const rechargeHour = rechargeDate.getHours();
        const rechargeMinute = rechargeDate.getMinutes();
        
        // Only process recharges within event hours (17:00 - 23:59)
        if (rechargeHour >= 17 && rechargeHour <= 23) {
          // Round down to nearest 15-minute interval
          const roundedMinute = Math.floor(rechargeMinute / 15) * 15;
          const timeSlot = `${rechargeHour.toString().padStart(2, '0')}:${roundedMinute.toString().padStart(2, '0')}`;
          
          const current = transactionsByTimeSlot.get(timeSlot);
          if (current) {
            const amount = recharge.amount || 0;
            
            // Determine if it's Stripe or terminal recharge
            if (recharge.stripe_session_id) {
              // Stripe recharge
              current.stripe.transactions += 1;
              current.stripe.revenue += amount;
            } else {
              // Terminal recharge (cash or card at terminal)
              current.terminal.transactions += 1;
              current.terminal.revenue += amount;
            }
          }
        }
      });

      // Process bar orders
      barOrders?.forEach(order => {
        const orderDate = new Date(order.created_at);
        const orderHour = orderDate.getHours();
        const orderMinute = orderDate.getMinutes();
        
        // Only process orders within event hours (17:00 - 23:59)
        if (orderHour >= 17 && orderHour <= 23) {
          // Round down to nearest 15-minute interval
          const roundedMinute = Math.floor(orderMinute / 15) * 15;
          const timeSlot = `${orderHour.toString().padStart(2, '0')}:${roundedMinute.toString().padStart(2, '0')}`;
          
          const current = transactionsByTimeSlot.get(timeSlot);
          if (current) {
            current.bar.transactions += 1;
            current.bar.revenue += (order.total_amount || 0);
          }
        }
      });

      // Convert to hourly transaction volume format
      timeSlots.forEach(timeSlot => {
        const data = transactionsByTimeSlot.get(timeSlot);
        if (data) {
          const totalRevenue = data.stripe.revenue + data.terminal.revenue + data.bar.revenue;
          hourlyTransactionVolume.push({
            hour: timeSlot,
            stripe: data.stripe,
            terminal: data.terminal,
            bar: data.bar,
            totalRevenue
          });
        }
      });

      // Calculate top spending time slots (15-minute intervals)
      const topSpendingHours = hourlyTransactionVolume
        .filter(slot => slot.totalRevenue > 0) // Only include slots with actual revenue
        .sort((a, b) => b.totalRevenue - a.totalRevenue)
        .slice(0, 8) // Show top 8 time slots instead of 5 for 15-minute granularity
        .map(slot => ({
          hour: slot.hour,
          intensity: slot.stripe.transactions + slot.terminal.transactions + slot.bar.transactions,
          revenue: slot.totalRevenue
        }));

      // Calculate financial health indicators
      const cashFlowRatio = totalRecharges > 0 ? totalSales / totalRecharges : 0;
      const utilizationRate = totalRecharges > 0 ? ((totalRecharges - totalRemainingBalance) / totalRecharges) * 100 : 0;
      const averageCardBalance = cardBalances?.length ? totalRemainingBalance / cardBalances.length : 0;
      const rechargeToSpendingRatio = totalSales > 0 ? totalRecharges / totalSales : 0;

      // Calculate profit margin (simplified)
      const profitMargin = totalSales > 0 ? ((totalSales - (totalSales * 0.3)) / totalSales) * 100 : 0; // Assuming 30% cost

      // Calculate conversion metrics
      const rechargeToSpendingRate = totalRecharges > 0 ? (totalSales / totalRecharges) * 100 : 0;
      
      // Calculate average time from first recharge to first purchase for each card
      const cardFirstTransactions = new Map<string, { firstRecharge?: Date; firstPurchase?: Date }>();
      
      recharges?.forEach(recharge => {
        if (recharge.card_id) {
          const rechargeDate = new Date(recharge.created_at);
          const existing = cardFirstTransactions.get(recharge.card_id);
          if (!existing?.firstRecharge || rechargeDate < existing.firstRecharge) {
            cardFirstTransactions.set(recharge.card_id, {
              ...existing,
              firstRecharge: rechargeDate
            });
          }
        }
      });

      barOrders?.forEach(order => {
        if (order.card_id) {
          const orderDate = new Date(order.created_at);
          const existing = cardFirstTransactions.get(order.card_id);
          if (!existing?.firstPurchase || orderDate < existing.firstPurchase) {
            cardFirstTransactions.set(order.card_id, {
              ...existing,
              firstPurchase: orderDate
            });
          }
        }
      });

      // Calculate average time to first purchase
      const timeIntervals: number[] = [];
      cardFirstTransactions.forEach(data => {
        if (data.firstRecharge && data.firstPurchase && data.firstPurchase > data.firstRecharge) {
          const intervalMinutes = (data.firstPurchase.getTime() - data.firstRecharge.getTime()) / (1000 * 60);
          timeIntervals.push(intervalMinutes);
        }
      });
      
      const averageTimeToFirstPurchase = timeIntervals.length > 0 
        ? timeIntervals.reduce((sum, interval) => sum + interval, 0) / timeIntervals.length 
        : 0;

      // Cards with unused balance and total unused balance
      const cardsWithUnusedBalance = cardBalances?.filter(card => (card.current_balance || 0) > 0).length || 0;
      const totalUnusedBalance = totalRemainingBalance;

      // Lost sales analysis - we can't directly track insufficient balance attempts without app_transaction_log
      // But we can estimate based on cards that have very low balances and might cause issues
      const lowBalanceCards = cardBalances?.filter(card => 
        (card.current_balance || 0) > 0 && (card.current_balance || 0) < 5 // Cards with less than 5€
      ).length || 0;
      
      const estimatedLostSales = lowBalanceCards * 2; // Estimated 2 failed attempts per low balance card
      const insufficientBalanceAttempts = estimatedLostSales;
      const averageShortfall = 3.50; // Estimated average shortfall amount
      const potentialRevenue = estimatedLostSales * averageShortfall;

      const financialData: FinancialStatisticsData = {
        metrics: {
          totalSales,
          totalRecharges,
          averageSpendingPerCard,
          totalRemainingBalance,
          averageTransactionValue,
          profitMargin,
          revenueGrowth: 0, // Would need historical data
          activeCards
        },
        paymentMethodBreakdown,
        hourlyTransactionVolume,
        conversionMetrics: {
          rechargeToSpendingRate,
          averageTimeToFirstPurchase,
          cardsWithUnusedBalance,
          totalUnusedBalance
        },
        lostSalesAnalysis: {
          estimatedLostSales,
          insufficientBalanceAttempts,
          averageShortfall,
          potentialRevenue
        },
        topSpendingHours,
        financialHealthIndicators: {
          cashFlowRatio,
          utilizationRate,
          averageCardBalance,
          rechargeToSpendingRatio
        }
      };

      setData(financialData);
    } catch (error) {
      console.error('Error fetching financial statistics:', error);
      toast({
        title: "Error",
        description: "Failed to fetch financial statistics",
        variant: "destructive"
      });
    } finally {
      setInternalLoading(false);
    }
  };

  // Load data when component mounts or edition changes
  useEffect(() => {
    if (editionConfig && !loading && !data) {
      fetchFinancialStatistics();
    }
  }, [editionConfig, loading]);

  // Handle manual load
  const handleLoad = () => {
    onLoad();
    fetchFinancialStatistics();
  };

  const isLoading = loading || internalLoading;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold">Statistiques Financières - {editionName}</h3>
        <Button
          onClick={handleLoad}
          disabled={isLoading || refreshing}
          variant="outline"
          size="sm"
        >
          {isLoading || refreshing ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Euro className="h-4 w-4" />
          )}
          {isLoading ? 'Chargement...' : refreshing ? 'Actualisation...' : 'Charger les Données'}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Métriques Financières Clés - Simplifiées selon les spécifications */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total des Ventes</CardTitle>
            <Euro className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : data ? (
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(data.metrics.totalSales)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Toutes les cartes combinées
                </p>
              </div>
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">--</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total des Recharges</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : data ? (
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {formatCurrency(data.metrics.totalRecharges)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Par méthodes de paiement
                </p>
              </div>
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">--</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Montant Moyen/Carte</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : data ? (
              <div>
                <div className="text-2xl font-bold">
                  {formatCurrency(data.metrics.averageSpendingPerCard)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Dépensé par carte
                </p>
              </div>
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">--</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Solde Restant</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : data ? (
              <div>
                <div className="text-2xl font-bold text-orange-600">
                  {formatCurrency(data.metrics.totalRemainingBalance)}
                </div>
                <p className="text-xs text-muted-foreground">
                  À la fin de l'événement
                </p>
              </div>
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">--</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Transactions/Heure</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : data ? (
              <div>
                <div className="text-2xl font-bold text-purple-600">
                  {data.hourlyTransactionVolume.reduce((sum, h) => sum + h.stripe.transactions + h.terminal.transactions + h.bar.transactions, 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Par intervalle horaire
                </p>
              </div>
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">--</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Répartition des Méthodes de Paiement - Selon les spécifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChart className="h-5 w-5" />
            Répartition des Recharges par Méthode de Paiement
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : data && data.paymentMethodBreakdown.some(p => p.amount > 0) ? (
            <div className="space-y-4">
              <ResponsiveContainer width="100%" height={200}>
                <RechartsPieChart>
                  <Pie
                    data={data.paymentMethodBreakdown.filter(p => p.amount > 0)}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="amount"
                    label={({ method, percentage }) => `${method === 'Cash' ? 'Espèces' : method === 'Card' ? 'Carte' : 'Stripe'}: ${percentage.toFixed(1)}%`}
                  >
                    {data.paymentMethodBreakdown.filter(p => p.amount > 0).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                </RechartsPieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {data.paymentMethodBreakdown.filter(p => p.amount > 0).map((method) => (
                  <div key={method.method} className="flex items-center justify-between p-2 rounded border">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: method.color }}
                      />
                      <span className="font-medium">
                        {method.method === 'Cash' ? 'Espèces' : method.method === 'Card' ? 'Carte' : 'Stripe'}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{formatCurrency(method.amount)}</div>
                      <div className="text-sm text-muted-foreground">
                        {method.count} transactions ({formatPercentage(method.percentage)})
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <PieChart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Aucune donnée de paiement disponible</p>
                <p className="text-sm">Cliquez sur "Charger les Données" pour récupérer les statistiques pour {editionName}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Métriques de Conversion */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Taux de Conversion et Utilisation
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : data ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="text-center p-4 rounded-lg border bg-green-50 border-green-200">
                <div className="text-2xl font-bold text-green-600">
                  {formatPercentage(data.conversionMetrics.rechargeToSpendingRate)}
                </div>
                <p className="text-sm text-green-600 font-medium">Taux de Conversion</p>
                <p className="text-xs text-muted-foreground">Recharge → Achat</p>
              </div>
              
              <div className="text-center p-4 rounded-lg border bg-blue-50 border-blue-200">
                <div className="text-2xl font-bold text-blue-600">
                  {data.conversionMetrics.averageTimeToFirstPurchase.toFixed(0)} min
                </div>
                <p className="text-sm text-blue-600 font-medium">Temps Moyen</p>
                <p className="text-xs text-muted-foreground">Recharge → Premier Achat</p>
              </div>
              
              <div className="text-center p-4 rounded-lg border bg-orange-50 border-orange-200">
                <div className="text-2xl font-bold text-orange-600">
                  {data.conversionMetrics.cardsWithUnusedBalance}
                </div>
                <p className="text-sm text-orange-600 font-medium">Cartes avec Solde</p>
                <p className="text-xs text-muted-foreground">Non utilisé en fin d'événement</p>
              </div>
              
              <div className="text-center p-4 rounded-lg border bg-purple-50 border-purple-200">
                <div className="text-2xl font-bold text-purple-600">
                  {formatCurrency(data.conversionMetrics.totalUnusedBalance)}
                </div>
                <p className="text-sm text-purple-600 font-medium">Solde Total</p>
                <p className="text-xs text-muted-foreground">Non dépensé</p>
              </div>
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Métriques de conversion non disponibles</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Analyse des Transactions par Heure - Selon les spécifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Opérations par Intervalle de 15 Minutes (17h-Minuit)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-80 w-full" />
          ) : data ? (
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={data.hourlyTransactionVolume}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    if (name === 'totalRevenue') return [formatCurrency(value), 'Revenus Total'];
                    if (name === 'stripe.transactions') return [value, 'Stripe'];
                    if (name === 'terminal.transactions') return [value, 'Borne'];
                    if (name === 'bar.transactions') return [value, 'Bar'];
                    return [value, name];
                  }}
                />
                <Legend />
                <Bar 
                  yAxisId="left" 
                  dataKey="stripe.transactions" 
                  stackId="operations"
                  fill="#8B5CF6" 
                  name="Stripe" 
                />
                <Bar 
                  yAxisId="left" 
                  dataKey="terminal.transactions" 
                  stackId="operations"
                  fill="#F59E0B" 
                  name="Borne" 
                />
                <Bar 
                  yAxisId="left" 
                  dataKey="bar.transactions" 
                  stackId="operations"
                  fill="#10B981" 
                  name="Bar" 
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="totalRevenue"
                  stroke="#EF4444"
                  strokeWidth={2}
                  name="Revenus Total"
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-80 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Les données d'opérations par intervalle seront affichées ici</p>
                <p className="text-sm">Cliquez sur "Charger les Données" pour récupérer les statistiques pour {editionName}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Analyse des Ventes Perdues - Moved to bottom */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Analyse des Ventes Perdues (Estimation)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : data ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="text-center p-4 rounded-lg border bg-red-50 border-red-200">
                  <div className="text-2xl font-bold text-red-600">
                    {data.lostSalesAnalysis.estimatedLostSales}
                  </div>
                  <p className="text-sm text-red-600 font-medium">Tentatives Échouées</p>
                  <p className="text-xs text-muted-foreground">Solde insuffisant estimé</p>
                </div>
                
                <div className="text-center p-4 rounded-lg border bg-orange-50 border-orange-200">
                  <div className="text-2xl font-bold text-orange-600">
                    {formatCurrency(data.lostSalesAnalysis.averageShortfall)}
                  </div>
                  <p className="text-sm text-orange-600 font-medium">Manque Moyen</p>
                  <p className="text-xs text-muted-foreground">Par tentative échouée</p>
                </div>
                
                <div className="text-center p-4 rounded-lg border bg-yellow-50 border-yellow-200">
                  <div className="text-2xl font-bold text-yellow-600">
                    {formatCurrency(data.lostSalesAnalysis.potentialRevenue)}
                  </div>
                  <p className="text-sm text-yellow-600 font-medium">Revenus Potentiels</p>
                  <p className="text-xs text-muted-foreground">Perdus estimés</p>
                </div>
                
                <div className="text-center p-4 rounded-lg border bg-gray-50 border-gray-200">
                  <div className="text-2xl font-bold text-gray-600">
                    {((data.lostSalesAnalysis.potentialRevenue / (data.metrics.totalSales + data.lostSalesAnalysis.potentialRevenue)) * 100).toFixed(1)}%
                  </div>
                  <p className="text-sm text-gray-600 font-medium">Impact</p>
                  <p className="text-xs text-muted-foreground">Sur revenus totaux</p>
                </div>
              </div>
              
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Note:</strong> Ces données sont des estimations basées sur les cartes avec solde faible (&lt; 5€). 
                  Pour un suivi précis des tentatives de paiement échouées, une intégration avec le système de log des transactions serait nécessaire.
                </AlertDescription>
              </Alert>
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Analyse des ventes perdues non disponible</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FinancialStatistics;