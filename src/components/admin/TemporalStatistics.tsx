import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  RefreshCw,
  Clock,
  TrendingUp,
  BarChart3,
  Activity,
  Users,
  Zap,
  Target,
  Timer,
  Calendar,
  AlertTriangle,
  CheckCircle,
  ArrowUp,
  ArrowDown,
  Minus
} from "lucide-react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Scatter,
  ScatterChart,
  ReferenceLine,
  ComposedChart
} from 'recharts';
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

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

// Temporal Statistics Interfaces
interface HourlyData {
  hour: number;
  hourLabel: string;
  reloadTransactions: number;
  spendingTransactions: number;
  totalTransactions: number;
  reloadAmount: number;
  spendingAmount: number;
  totalAmount: number;
  avgTransactionValue: number;
  transactionRate: number;
}

interface PeakInterval {
  timeSlot: string;
  totalTransactions: number;
  totalAmount: number;
  rank: number;
}

interface PeakHourAnalysis {
  peakReloadHour: number;
  peakSpendingHour: number;
  peakVolumeHour: number;
  peakReloadIntensity: number;
  peakSpendingIntensity: number;
  peakVolumeIntensity: number;
  quietestHour: number;
  quietestIntensity: number;
}

interface TransactionRateAnalysis {
  overallRate: number;
  peakRate: number;
  averageRate: number;
  peakPeriods: Array<{
    startHour: number;
    endHour: number;
    rate: number;
    duration: number;
  }>;
  rateVariability: number;
}

interface TimeIntervalAnalysis {
  averageInterval: number;
  medianInterval: number;
  intervalDistribution: Array<{
    range: string;
    count: number;
    percentage: number;
  }>;
  cardUsagePatterns: Array<{
    cardId: string;
    averageInterval: number;
    transactionCount: number;
    usagePattern: 'frequent' | 'moderate' | 'occasional';
  }>;
}

interface UserBehaviorInsights {
  earlyBirds: number;
  primeTime: number;
  nightOwls: number;
  behaviorPatterns: Array<{
    pattern: string;
    count: number;
    percentage: number;
    description: string;
  }>;
}

interface OperationalInsights {
  optimalOpeningHour: number;
  optimalClosingHour: number;
  staffingRecommendations: Array<{
    timeSlot: string;
    recommendedStaff: number;
    reasoning: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  equipmentUsagePatterns: Array<{
    hour: number;
    intensity: number;
    maintenanceWindow: boolean;
  }>;
  queueFormationPrediction: Array<{
    hour: number;
    expectedQueueLength: number;
    waitTime: number;
  }>;
}

interface TemporalStatistics {
  hourlyData: HourlyData[];
  peakHourAnalysis: PeakHourAnalysis;
  transactionRateAnalysis: TransactionRateAnalysis;
  timeIntervalAnalysis: TimeIntervalAnalysis;
  userBehaviorInsights: UserBehaviorInsights;
  operationalInsights: OperationalInsights;
  totalTransactions: number;
  totalAmount: number;
  analysisTimeRange: {
    start: string;
    end: string;
  };
}

interface TemporalStatisticsProps {
  loading: boolean;
  error: string | null;
  onLoad: () => void;
  editionName: string;
  editionConfig?: EditionConfig;
  refreshing: boolean;
}

const TemporalStatistics: React.FC<TemporalStatisticsProps> = ({
  loading,
  error,
  onLoad,
  editionName,
  editionConfig,
  refreshing
}) => {
  const [data, setData] = useState<TemporalStatistics | null>(null);
  const [internalLoading, setInternalLoading] = useState(false);
  const [selectedView, setSelectedView] = useState<'overview' | 'peaks' | 'rates' | 'intervals' | 'behavior' | 'operations'>('overview');

  // Load temporal statistics data
  const loadTemporalData = async () => {
    if (!editionConfig) {
      toast({
        title: "No Edition Selected",
        description: "Please select a festival edition to load temporal statistics",
        variant: "destructive"
      });
      return;
    }

    setInternalLoading(true);
    try {
      const temporalStats = await fetchTemporalStatistics(editionConfig);
      setData(temporalStats);
      
      toast({
        title: "Statistiques Temporelles Chargées",
        description: `Analyses temporelles chargées avec succès pour ${editionName}`,
      });
    } catch (error) {
      console.error('Error loading temporal statistics:', error);
      toast({
        title: "Chargement Échoué",
        description: `Échec du chargement des statistiques temporelles: ${error instanceof Error ? error.message : 'Erreur inconnue'}`,
        variant: "destructive"
      });
    } finally {
      setInternalLoading(false);
    }
  };

  // Fetch temporal statistics from Supabase
  const fetchTemporalStatistics = async (editionConfig: EditionConfig): Promise<TemporalStatistics> => {
    const startDate = editionConfig.dateRange.start;
    const endDate = editionConfig.dateRange.end;

    try {
      // Get bar orders within the edition date range
      const { data: barOrders, error: barOrdersError } = await supabase
        .from('bar_orders')
        .select('*')
        .gte('created_at', startDate)
        .lte('created_at', endDate + 'T23:59:59.999Z')
        .order('created_at', { ascending: true });

      if (barOrdersError) throw barOrdersError;

      // Get recharges within the edition date range
      const { data: recharges, error: rechargesError } = await supabase
        .from('recharges')
        .select('*')
        .gte('created_at', startDate)
        .lte('created_at', endDate + 'T23:59:59.999Z')
        .order('created_at', { ascending: true });

      if (rechargesError) throw rechargesError;

      // Combine and process transactions
      const allTransactions = [
        ...(barOrders || []).map(order => ({
          ...order,
          transaction_type: 'bar_order',
          amount: order.total_amount,
          timestamp: order.created_at
        })),
        ...(recharges || []).map(recharge => ({
          ...recharge,
          transaction_type: 'recharge',
          amount: recharge.amount || 0,
          timestamp: recharge.created_at
        }))
      ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      if (allTransactions.length === 0) {
        return createEmptyTemporalStatistics(startDate, endDate);
      }

      // Process transactions into temporal analytics
      return processTemporalAnalytics(allTransactions, startDate, endDate);
    } catch (error) {
      console.error('Error fetching temporal statistics:', error);
      throw error;
    }
  };

  // Create empty statistics structure
  const createEmptyTemporalStatistics = (startDate: string, endDate: string): TemporalStatistics => {
    const emptyHourlyData: HourlyData[] = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      hourLabel: `${hour.toString().padStart(2, '0')}:00`,
      reloadTransactions: 0,
      spendingTransactions: 0,
      totalTransactions: 0,
      reloadAmount: 0,
      spendingAmount: 0,
      totalAmount: 0,
      avgTransactionValue: 0,
      transactionRate: 0
    }));

    return {
      hourlyData: emptyHourlyData,
      peakHourAnalysis: {
        peakReloadHour: 0,
        peakSpendingHour: 0,
        peakVolumeHour: 0,
        peakReloadIntensity: 0,
        peakSpendingIntensity: 0,
        peakVolumeIntensity: 0,
        quietestHour: 0,
        quietestIntensity: 0
      },
      transactionRateAnalysis: {
        overallRate: 0,
        peakRate: 0,
        averageRate: 0,
        peakPeriods: [],
        rateVariability: 0
      },
      timeIntervalAnalysis: {
        averageInterval: 0,
        medianInterval: 0,
        intervalDistribution: [],
        cardUsagePatterns: []
      },
      userBehaviorInsights: {
        earlyBirds: 0,
        primeTime: 0,
        nightOwls: 0,
        behaviorPatterns: []
      },
      operationalInsights: {
        optimalOpeningHour: 10,
        optimalClosingHour: 22,
        staffingRecommendations: [],
        equipmentUsagePatterns: [],
        queueFormationPrediction: []
      },
      totalTransactions: 0,
      totalAmount: 0,
      analysisTimeRange: {
        start: startDate,
        end: endDate
      }
    };
  };

  // Process transactions into comprehensive temporal analytics
  const processTemporalAnalytics = (transactions: any[], startDate: string, endDate: string): TemporalStatistics => {
    // Initialize hourly data structure
    const hourlyData: HourlyData[] = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      hourLabel: `${hour.toString().padStart(2, '0')}:00`,
      reloadTransactions: 0,
      spendingTransactions: 0,
      totalTransactions: 0,
      reloadAmount: 0,
      spendingAmount: 0,
      totalAmount: 0,
      avgTransactionValue: 0,
      transactionRate: 0
    }));

    // Process each transaction
    let totalTransactions = 0;
    let totalAmount = 0;
    const cardTransactions: { [cardId: string]: any[] } = {};

    transactions.forEach(transaction => {
      const timestamp = new Date(transaction.timestamp);
      const hour = timestamp.getHours();
      const amount = parseFloat(transaction.amount) || 0;
      
      totalTransactions++;
      totalAmount += Math.abs(amount);

      // Categorize transaction type
      const isReload = transaction.transaction_type === 'recharge';
      const isSpending = transaction.transaction_type === 'bar_order';

      // Update hourly data
      const hourlyEntry = hourlyData[hour];
      hourlyEntry.totalTransactions++;
      hourlyEntry.totalAmount += Math.abs(amount);

      if (isReload) {
        hourlyEntry.reloadTransactions++;
        hourlyEntry.reloadAmount += Math.abs(amount);
      } else if (isSpending) {
        hourlyEntry.spendingTransactions++;
        hourlyEntry.spendingAmount += Math.abs(amount);
      }

      // Track card transactions for interval analysis
      const cardId = transaction.card_id || 'unknown';
      if (!cardTransactions[cardId]) {
        cardTransactions[cardId] = [];
      }
      cardTransactions[cardId].push(transaction);
    });

    // Calculate derived metrics for hourly data
    hourlyData.forEach(hour => {
      hour.avgTransactionValue = hour.totalTransactions > 0 ? hour.totalAmount / hour.totalTransactions : 0;
      hour.transactionRate = hour.totalTransactions;
    });

    // Analyze peak hours
    const peakHourAnalysis = analyzePeakHours(hourlyData);

    // Analyze transaction rates
    const transactionRateAnalysis = analyzeTransactionRates(hourlyData);

    // Analyze time intervals
    const timeIntervalAnalysis = analyzeTimeIntervals(cardTransactions);

    // Analyze user behavior
    const userBehaviorInsights = analyzeUserBehavior(transactions);

    // Generate operational insights
    const operationalInsights = generateOperationalInsights(hourlyData, peakHourAnalysis);

    return {
      hourlyData,
      peakHourAnalysis,
      transactionRateAnalysis,
      timeIntervalAnalysis,
      userBehaviorInsights,
      operationalInsights,
      totalTransactions,
      totalAmount,
      analysisTimeRange: {
        start: startDate,
        end: endDate
      }
    };
  };

  // Analyze peak hours
  const analyzePeakHours = (hourlyData: HourlyData[]): PeakHourAnalysis => {
    let peakReloadHour = 0;
    let peakSpendingHour = 0;
    let peakVolumeHour = 0;
    let peakReloadIntensity = 0;
    let peakSpendingIntensity = 0;
    let peakVolumeIntensity = 0;
    let quietestHour = 0;
    let quietestIntensity = Infinity;

    hourlyData.forEach((hour, index) => {
      if (hour.reloadTransactions > peakReloadIntensity) {
        peakReloadIntensity = hour.reloadTransactions;
        peakReloadHour = index;
      }
      
      if (hour.spendingTransactions > peakSpendingIntensity) {
        peakSpendingIntensity = hour.spendingTransactions;
        peakSpendingHour = index;
      }
      
      if (hour.totalTransactions > peakVolumeIntensity) {
        peakVolumeIntensity = hour.totalTransactions;
        peakVolumeHour = index;
      }
      
      if (hour.totalTransactions < quietestIntensity) {
        quietestIntensity = hour.totalTransactions;
        quietestHour = index;
      }
    });

    return {
      peakReloadHour,
      peakSpendingHour,
      peakVolumeHour,
      peakReloadIntensity,
      peakSpendingIntensity,
      peakVolumeIntensity,
      quietestHour,
      quietestIntensity
    };
  };

  // Analyze transaction rates
  const analyzeTransactionRates = (hourlyData: HourlyData[]): TransactionRateAnalysis => {
    const rates = hourlyData.map(h => h.transactionRate);
    const totalRate = rates.reduce((sum, rate) => sum + rate, 0);
    const averageRate = totalRate / 24;
    const peakRate = Math.max(...rates);
    
    // Calculate rate variability (standard deviation)
    const variance = rates.reduce((sum, rate) => sum + Math.pow(rate - averageRate, 2), 0) / rates.length;
    const rateVariability = Math.sqrt(variance);

    // Identify peak periods
    const peakPeriods: Array<{
      startHour: number;
      endHour: number;
      rate: number;
      duration: number;
    }> = [];

    let currentPeriod: { startHour: number; endHour: number; rates: number[] } | null = null;

    hourlyData.forEach((hour, index) => {
      if (hour.transactionRate > averageRate * 1.2) {
        if (!currentPeriod) {
          currentPeriod = { startHour: index, endHour: index, rates: [hour.transactionRate] };
        } else {
          currentPeriod.endHour = index;
          currentPeriod.rates.push(hour.transactionRate);
        }
      } else if (currentPeriod) {
        const avgRate = currentPeriod.rates.reduce((sum, r) => sum + r, 0) / currentPeriod.rates.length;
        peakPeriods.push({
          startHour: currentPeriod.startHour,
          endHour: currentPeriod.endHour,
          rate: avgRate,
          duration: currentPeriod.endHour - currentPeriod.startHour + 1
        });
        currentPeriod = null;
      }
    });

    if (currentPeriod) {
      const avgRate = currentPeriod.rates.reduce((sum, r) => sum + r, 0) / currentPeriod.rates.length;
      peakPeriods.push({
        startHour: currentPeriod.startHour,
        endHour: currentPeriod.endHour,
        rate: avgRate,
        duration: currentPeriod.endHour - currentPeriod.startHour + 1
      });
    }

    return {
      overallRate: totalRate,
      peakRate,
      averageRate,
      peakPeriods,
      rateVariability
    };
  };

  // Analyze time intervals between transactions
  const analyzeTimeIntervals = (cardTransactions: { [cardId: string]: any[] }): TimeIntervalAnalysis => {
    const intervals: number[] = [];
    const cardPatterns: Array<{
      cardId: string;
      averageInterval: number;
      transactionCount: number;
      usagePattern: 'frequent' | 'moderate' | 'occasional';
    }> = [];

    Object.entries(cardTransactions).forEach(([cardId, transactions]) => {
      if (transactions.length < 2) return;

      const cardIntervals: number[] = [];
      for (let i = 1; i < transactions.length; i++) {
        const prevTime = new Date(transactions[i - 1].timestamp).getTime();
        const currTime = new Date(transactions[i].timestamp).getTime();
        const intervalMinutes = (currTime - prevTime) / (1000 * 60);
        intervals.push(intervalMinutes);
        cardIntervals.push(intervalMinutes);
      }

      const avgInterval = cardIntervals.reduce((sum, interval) => sum + interval, 0) / cardIntervals.length;
      let usagePattern: 'frequent' | 'moderate' | 'occasional' = 'occasional';
      
      if (avgInterval < 30) usagePattern = 'frequent';
      else if (avgInterval < 120) usagePattern = 'moderate';

      cardPatterns.push({
        cardId,
        averageInterval: avgInterval,
        transactionCount: transactions.length,
        usagePattern
      });
    });

    const averageInterval = intervals.length > 0 ? intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length : 0;
    const sortedIntervals = [...intervals].sort((a, b) => a - b);
    const medianInterval = sortedIntervals.length > 0 ? sortedIntervals[Math.floor(sortedIntervals.length / 2)] : 0;

    const intervalRanges = [
      { range: '0-5 min', min: 0, max: 5 },
      { range: '5-15 min', min: 5, max: 15 },
      { range: '15-30 min', min: 15, max: 30 },
      { range: '30-60 min', min: 30, max: 60 },
      { range: '1-2 hours', min: 60, max: 120 },
      { range: '2+ hours', min: 120, max: Infinity }
    ];

    const intervalDistribution = intervalRanges.map(range => {
      const count = intervals.filter(interval => interval >= range.min && interval < range.max).length;
      const percentage = intervals.length > 0 ? (count / intervals.length) * 100 : 0;
      return {
        range: range.range,
        count,
        percentage
      };
    });

    return {
      averageInterval,
      medianInterval,
      intervalDistribution,
      cardUsagePatterns: cardPatterns.slice(0, 10)
    };
  };

  // Analyze user behavior patterns
  const analyzeUserBehavior = (transactions: any[]): UserBehaviorInsights => {
    let earlyBirds = 0;
    let primeTime = 0;
    let nightOwls = 0;

    transactions.forEach(transaction => {
      const hour = new Date(transaction.timestamp).getHours();
      if (hour < 12) earlyBirds++;
      else if (hour < 18) primeTime++;
      else nightOwls++;
    });

    const total = transactions.length;
    const behaviorPatterns = [
      {
        pattern: 'Early Birds',
        count: earlyBirds,
        percentage: total > 0 ? (earlyBirds / total) * 100 : 0,
        description: 'Users active before noon'
      },
      {
        pattern: 'Prime Time',
        count: primeTime,
        percentage: total > 0 ? (primeTime / total) * 100 : 0,
        description: 'Users active during 12:00-18:00'
      },
      {
        pattern: 'Night Owls',
        count: nightOwls,
        percentage: total > 0 ? (nightOwls / total) * 100 : 0,
        description: 'Users active after 18:00'
      }
    ];

    return {
      earlyBirds,
      primeTime,
      nightOwls,
      behaviorPatterns
    };
  };

  // Generate operational insights
  const generateOperationalInsights = (hourlyData: HourlyData[], peakAnalysis: PeakHourAnalysis): OperationalInsights => {
    const significantActivity = hourlyData.filter(h => h.totalTransactions > 0);
    const optimalOpeningHour = significantActivity.length > 0 ? Math.max(0, significantActivity[0].hour - 1) : 10;
    const optimalClosingHour = significantActivity.length > 0 ? Math.min(23, significantActivity[significantActivity.length - 1].hour + 1) : 22;

    const staffingRecommendations = hourlyData.map((hour, index) => {
      let recommendedStaff = 1;
      let priority: 'high' | 'medium' | 'low' = 'low';
      let reasoning = 'Minimal activity expected';

      if (hour.totalTransactions > peakAnalysis.peakVolumeIntensity * 0.8) {
        recommendedStaff = 4;
        priority = 'high';
        reasoning = 'Peak activity period - maximum staffing required';
      } else if (hour.totalTransactions > peakAnalysis.peakVolumeIntensity * 0.5) {
        recommendedStaff = 3;
        priority = 'medium';
        reasoning = 'High activity period - increased staffing needed';
      } else if (hour.totalTransactions > peakAnalysis.peakVolumeIntensity * 0.2) {
        recommendedStaff = 2;
        priority = 'medium';
        reasoning = 'Moderate activity - standard staffing';
      }

      return {
        timeSlot: `${index.toString().padStart(2, '0')}:00-${(index + 1).toString().padStart(2, '0')}:00`,
        recommendedStaff,
        reasoning,
        priority
      };
    }).filter(rec => rec.recommendedStaff > 1);

    const equipmentUsagePatterns = hourlyData.map((hour, index) => ({
      hour: index,
      intensity: hour.totalTransactions,
      maintenanceWindow: hour.totalTransactions === 0 || hour.totalTransactions < peakAnalysis.peakVolumeIntensity * 0.1
    }));

    const queueFormationPrediction = hourlyData.map((hour, index) => {
      const intensity = hour.totalTransactions;
      const expectedQueueLength = Math.max(0, Math.floor(intensity / 10));
      const waitTime = expectedQueueLength * 2;

      return {
        hour: index,
        expectedQueueLength,
        waitTime
      };
    });

    return {
      optimalOpeningHour,
      optimalClosingHour,
      staffingRecommendations,
      equipmentUsagePatterns,
      queueFormationPrediction
    };
  };

  // Effect to load data when component mounts or edition changes
  useEffect(() => {
    if (editionConfig && !loading && !internalLoading) {
      loadTemporalData();
    }
  }, [editionConfig]);

  // Handle manual load
  const handleLoad = () => {
    onLoad();
    loadTemporalData();
  };

  // Format currency
  const formatCurrency = (amount: number) => `€${amount.toFixed(2)}`;

  // Format time
  const formatHour = (hour: number) => `${hour.toString().padStart(2, '0')}:00`;

  const isLoading = loading || internalLoading || refreshing;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold">Statistiques Temporelles - {editionName}</h3>
        <Button
          onClick={handleLoad}
          disabled={isLoading}
          variant="outline"
          size="sm"
        >
          {isLoading ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Clock className="h-4 w-4" />
          )}
          {isLoading ? 'Chargement...' : 'Charger les Données'}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Top 8 Heures de Pointe (15-minute intervals) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Top 8 Heures de Pointe (Intervalles de 15 minutes)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : editionConfig ? (
            <PeakIntervalsDisplay editionConfig={editionConfig} />
          ) : (
            <div className="h-96 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Aucune donnée disponible</p>
                <p className="text-sm">Cliquez sur "Charger les Données" pour récupérer les statistiques</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Métriques Clés Simplifiées - Selon les spécifications */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Modèles d'Heures de Pointe - Recharges</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : data ? (
              <div>
                <div className="text-2xl font-bold">{formatHour(data.peakHourAnalysis.peakReloadHour)}</div>
                <p className="text-xs text-muted-foreground">
                  {data.peakHourAnalysis.peakReloadIntensity} transactions/minute
                </p>
              </div>
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">--</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Modèles d'Heures de Pointe - Dépenses Bar</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : data ? (
              <div>
                <div className="text-2xl font-bold">{formatHour(data.peakHourAnalysis.peakSpendingHour)}</div>
                <p className="text-xs text-muted-foreground">
                  {data.peakHourAnalysis.peakSpendingIntensity} transactions/heure
                </p>
              </div>
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">--</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modèles d'Heures de Pointe pour les Recharges et Dépenses Bar (15 minutes) */}
      <Card>
        <CardHeader>
          <CardTitle>Modèles d'Heures de Pointe pour les Recharges et Dépenses Bar (Intervalles 15 min)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : editionConfig ? (
            <IntervalChart editionConfig={editionConfig} />
          ) : (
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Aucune donnée temporelle disponible</p>
                <p className="text-sm">Cliquez sur "Charger les Données" pour récupérer les statistiques pour {editionName}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Durée Moyenne entre Transactions Consécutives par Carte */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            Analyse des Intervalles entre Transactions
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Temps moyen qui s'écoule entre deux opérations consécutives (recharge ou achat) effectuées avec la même carte
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : editionConfig ? (
            <TransactionIntervalsAnalysis editionConfig={editionConfig} />
          ) : (
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Timer className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Aucune donnée d'intervalle disponible</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// Component to display 15-minute interval chart
interface IntervalChartProps {
  editionConfig: EditionConfig;
}

interface IntervalChartData {
  timeSlot: string;
  recharges: number;
  depensesBar: number;
  totalAmount: number;
}

const IntervalChart: React.FC<IntervalChartProps> = ({ editionConfig }) => {
  const [chartData, setChartData] = useState<IntervalChartData[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch 15-minute interval data for chart
  const fetchIntervalData = async () => {
    setLoading(true);
    try {
      const startDate = editionConfig.dateRange.start;
      const endDate = editionConfig.dateRange.end;

      // Get bar orders and recharges
      const [{ data: barOrders }, { data: recharges }] = await Promise.all([
        supabase
          .from('bar_orders')
          .select('*')
          .gte('created_at', startDate)
          .lte('created_at', endDate + 'T23:59:59.999Z'),
        supabase
          .from('recharges')
          .select('*')
          .gte('created_at', startDate)
          .lte('created_at', endDate + 'T23:59:59.999Z')
      ]);

      // Create 15-minute intervals from 17:00 to 24:00 (28 intervals)
      const intervalData: IntervalChartData[] = [];
      
      for (let hour = 17; hour < 24; hour++) {
        for (let minute = 0; minute < 60; minute += 15) {
          const timeSlot = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
          intervalData.push({
            timeSlot,
            recharges: 0,
            depensesBar: 0,
            totalAmount: 0
          });
        }
      }

      // Process bar orders
      barOrders?.forEach(order => {
        const timestamp = new Date(order.created_at);
        const hour = timestamp.getHours();
        const minute = timestamp.getMinutes();
        
        if (hour >= 17 && hour < 24) {
          const intervalMinute = Math.floor(minute / 15) * 15;
          const timeSlot = `${hour.toString().padStart(2, '0')}:${intervalMinute.toString().padStart(2, '0')}`;
          
          const interval = intervalData.find(d => d.timeSlot === timeSlot);
          if (interval) {
            interval.depensesBar += 1;
            interval.totalAmount += order.total_amount || 0;
          }
        }
      });

      // Process recharges
      recharges?.forEach(recharge => {
        const timestamp = new Date(recharge.created_at);
        const hour = timestamp.getHours();
        const minute = timestamp.getMinutes();
        
        if (hour >= 17 && hour < 24) {
          const intervalMinute = Math.floor(minute / 15) * 15;
          const timeSlot = `${hour.toString().padStart(2, '0')}:${intervalMinute.toString().padStart(2, '0')}`;
          
          const interval = intervalData.find(d => d.timeSlot === timeSlot);
          if (interval) {
            interval.recharges += 1;
            interval.totalAmount += recharge.amount || 0;
          }
        }
      });

      setChartData(intervalData);
    } catch (error) {
      console.error('Error fetching interval data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntervalData();
  }, [editionConfig]);

  const formatCurrency = (amount: number) => `€${amount.toFixed(2)}`;

  if (loading) {
    return <Skeleton className="h-80 w-full" />;
  }

  return (
            <div className="space-y-4">
      <ResponsiveContainer width="100%" height={350}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis 
            dataKey="timeSlot" 
            tick={{ fontSize: 12 }}
            angle={-45}
            textAnchor="end"
            height={60}
          />
          <YAxis yAxisId="transactions" orientation="left" />
          <YAxis yAxisId="amount" orientation="right" />
          <Tooltip 
            formatter={(value: any, name: string) => {
              if (name === 'Total Revenue') return [formatCurrency(value), name];
              return [value, name];
            }}
            labelFormatter={(label) => `Période: ${label}`}
          />
          <Legend />
          <Area
            yAxisId="transactions"
            type="monotone"
            dataKey="recharges"
            stackId="1"
            stroke="#8b5cf6"
            fill="#8b5cf6"
            name="Recharges"
          />
          <Area
            yAxisId="transactions"
            type="monotone"
            dataKey="depensesBar"
            stackId="1"
            stroke="#10b981"
            fill="#10b981"
            name="Dépenses Bar"
          />
          <Line
            yAxisId="amount"
            type="monotone"
            dataKey="totalAmount"
            stroke="#f59e0b"
            strokeWidth={3}
            dot={{ fill: '#f59e0b', strokeWidth: 2, r: 4 }}
            name="Total Revenue"
          />
        </ComposedChart>
      </ResponsiveContainer>
      
      {chartData.every(d => d.recharges === 0 && d.depensesBar === 0) && (
        <div className="text-center py-8 text-muted-foreground">
          <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Aucune donnée de transactions trouvée</p>
          <p className="text-sm">Les données apparaîtront ici une fois disponibles</p>
        </div>
      )}
    </div>
  );
};

// Component for comprehensive transaction intervals analysis
interface TransactionIntervalsAnalysisProps {
  editionConfig: EditionConfig;
}

interface CardIntervalData {
  cardId: string;
  intervals: number[];
  averageInterval: number;
  medianInterval: number;
  minInterval: number;
  maxInterval: number;
  totalTransactions: number;
  usagePattern: 'très actif' | 'actif' | 'modéré' | 'occasionnel';
  firstTransaction: string;
  lastTransaction: string;
}

interface OverallIntervalStats {
  totalCards: number;
  cardsWithMultipleTransactions: number;
  averageInterval: number;
  medianInterval: number;
  intervalDistribution: Array<{
    range: string;
    count: number;
    percentage: number;
    description: string;
  }>;
  usagePatterns: Array<{
    pattern: string;
    count: number;
    percentage: number;
    avgInterval: number;
    description: string;
  }>;
}

const TransactionIntervalsAnalysis: React.FC<TransactionIntervalsAnalysisProps> = ({ editionConfig }) => {
  const [intervalStats, setIntervalStats] = useState<OverallIntervalStats | null>(null);
  const [cardData, setCardData] = useState<CardIntervalData[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchIntervalAnalysis = async () => {
    setLoading(true);
    try {
      const startDate = editionConfig.dateRange.start;
      const endDate = editionConfig.dateRange.end;

      // Get all transactions (bar orders and recharges) for the edition
      const [{ data: barOrders }, { data: recharges }] = await Promise.all([
        supabase
          .from('bar_orders')
          .select('card_id, created_at, total_amount')
          .gte('created_at', startDate)
          .lte('created_at', endDate + 'T23:59:59.999Z')
          .order('created_at', { ascending: true }),
        supabase
          .from('recharges')
          .select('card_id, created_at, amount')
          .gte('created_at', startDate)
          .lte('created_at', endDate + 'T23:59:59.999Z')
          .order('created_at', { ascending: true })
      ]);

      // Combine all transactions and group by card
      const allTransactions = [
        ...(barOrders || []).map(order => ({
          cardId: order.card_id,
          timestamp: new Date(order.created_at),
          type: 'purchase' as const,
          amount: order.total_amount || 0
        })),
        ...(recharges || []).map(recharge => ({
          cardId: recharge.card_id,
          timestamp: new Date(recharge.created_at),
          type: 'recharge' as const,
          amount: recharge.amount || 0
        }))
      ].filter(t => t.cardId); // Filter out null card_ids

      // Group transactions by card
      const transactionsByCard = new Map<string, typeof allTransactions>();
      allTransactions.forEach(transaction => {
        if (!transactionsByCard.has(transaction.cardId)) {
          transactionsByCard.set(transaction.cardId, []);
        }
        transactionsByCard.get(transaction.cardId)!.push(transaction);
      });

      // Sort transactions for each card by timestamp
      transactionsByCard.forEach(transactions => {
        transactions.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      });

      // Calculate intervals for each card
      const cardIntervalData: CardIntervalData[] = [];
      const allIntervals: number[] = [];

      transactionsByCard.forEach((transactions, cardId) => {
        if (transactions.length < 2) return; // Need at least 2 transactions to calculate intervals

        const intervals: number[] = [];
        for (let i = 1; i < transactions.length; i++) {
          const prevTime = transactions[i - 1].timestamp.getTime();
          const currTime = transactions[i].timestamp.getTime();
          const intervalMinutes = (currTime - prevTime) / (1000 * 60);
          intervals.push(intervalMinutes);
          allIntervals.push(intervalMinutes);
        }

        const averageInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
        const sortedIntervals = [...intervals].sort((a, b) => a - b);
        const medianInterval = sortedIntervals[Math.floor(sortedIntervals.length / 2)];
        const minInterval = Math.min(...intervals);
        const maxInterval = Math.max(...intervals);

        // Determine usage pattern
        let usagePattern: CardIntervalData['usagePattern'] = 'occasionnel';
        if (averageInterval < 15) usagePattern = 'très actif';
        else if (averageInterval < 45) usagePattern = 'actif';
        else if (averageInterval < 120) usagePattern = 'modéré';

        cardIntervalData.push({
          cardId,
          intervals,
          averageInterval,
          medianInterval,
          minInterval,
          maxInterval,
          totalTransactions: transactions.length,
          usagePattern,
          firstTransaction: transactions[0].timestamp.toISOString(),
          lastTransaction: transactions[transactions.length - 1].timestamp.toISOString()
        });
      });

      // Calculate overall statistics
      const totalCards = transactionsByCard.size;
      const cardsWithMultipleTransactions = cardIntervalData.length;
      const overallAverage = allIntervals.length > 0 ? 
        allIntervals.reduce((sum, interval) => sum + interval, 0) / allIntervals.length : 0;
      const sortedAllIntervals = [...allIntervals].sort((a, b) => a - b);
      const overallMedian = sortedAllIntervals.length > 0 ? 
        sortedAllIntervals[Math.floor(sortedAllIntervals.length / 2)] : 0;

      // Calculate interval distribution
      const intervalRanges = [
        { range: '0-5 min', min: 0, max: 5, description: 'Transactions très rapprochées' },
        { range: '5-15 min', min: 5, max: 15, description: 'Utilisation intensive' },
        { range: '15-30 min', min: 15, max: 30, description: 'Utilisation fréquente' },
        { range: '30-60 min', min: 30, max: 60, description: 'Utilisation modérée' },
        { range: '1-2 heures', min: 60, max: 120, description: 'Utilisation espacée' },
        { range: '2+ heures', min: 120, max: Infinity, description: 'Utilisation occasionnelle' }
      ];

      const intervalDistribution = intervalRanges.map(range => {
        const count = allIntervals.filter(interval => interval >= range.min && interval < range.max).length;
        const percentage = allIntervals.length > 0 ? (count / allIntervals.length) * 100 : 0;
        return {
          range: range.range,
          count,
          percentage,
          description: range.description
        };
      });

      // Calculate usage patterns
      const usagePatterns = [
        { pattern: 'très actif', description: 'Transactions < 15 min d\'intervalle' },
        { pattern: 'actif', description: 'Transactions entre 15-45 min' },
        { pattern: 'modéré', description: 'Transactions entre 45 min - 2h' },
        { pattern: 'occasionnel', description: 'Transactions > 2h d\'intervalle' }
      ].map(pattern => {
        const cards = cardIntervalData.filter(card => card.usagePattern === pattern.pattern);
        const count = cards.length;
        const percentage = cardsWithMultipleTransactions > 0 ? (count / cardsWithMultipleTransactions) * 100 : 0;
        const avgInterval = count > 0 ? 
          cards.reduce((sum, card) => sum + card.averageInterval, 0) / count : 0;
        
        return {
          pattern: pattern.pattern,
          count,
          percentage,
          avgInterval,
          description: pattern.description
        };
      });

      const stats: OverallIntervalStats = {
        totalCards,
        cardsWithMultipleTransactions,
        averageInterval: overallAverage,
        medianInterval: overallMedian,
        intervalDistribution,
        usagePatterns
      };

      setIntervalStats(stats);
      setCardData(cardIntervalData.slice(0, 10)); // Show top 10 cards for detailed view
    } catch (error) {
      console.error('Error fetching interval analysis:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntervalAnalysis();
  }, [editionConfig]);

  const formatDuration = (minutes: number) => {
    if (minutes < 60) {
      return `${minutes.toFixed(1)} min`;
    } else {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = Math.round(minutes % 60);
      return `${hours}h ${remainingMinutes}min`;
    }
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPatternColor = (pattern: string) => {
    switch (pattern) {
      case 'très actif': return 'text-red-600 bg-red-50 border-red-200';
      case 'actif': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'modéré': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'occasionnel': return 'text-gray-600 bg-gray-50 border-gray-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  if (loading) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (!intervalStats) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Timer className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Aucune donnée d'intervalle disponible</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Vue d'ensemble */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="text-center p-4 rounded-lg border bg-blue-50 border-blue-200">
                  <div className="text-2xl font-bold text-blue-600">
            {intervalStats.cardsWithMultipleTransactions}
                  </div>
          <p className="text-sm text-blue-600 font-medium">Cartes analysées</p>
          <p className="text-xs text-muted-foreground">
            (avec 2+ transactions)
          </p>
                </div>
        
        <div className="text-center p-4 rounded-lg border bg-green-50 border-green-200">
                  <div className="text-2xl font-bold text-green-600">
            {formatDuration(intervalStats.averageInterval)}
                  </div>
          <p className="text-sm text-green-600 font-medium">Intervalle Moyen</p>
          <p className="text-xs text-muted-foreground">
            Entre deux transactions
          </p>
                </div>
        
        <div className="text-center p-4 rounded-lg border bg-purple-50 border-purple-200">
          <div className="text-2xl font-bold text-purple-600">
            {formatDuration(intervalStats.medianInterval)}
              </div>
          <p className="text-sm text-purple-600 font-medium">Intervalle Médian</p>
          <p className="text-xs text-muted-foreground">
            Valeur centrale
          </p>
        </div>
        
        <div className="text-center p-4 rounded-lg border bg-orange-50 border-orange-200">
          <div className="text-2xl font-bold text-orange-600">
            {((intervalStats.cardsWithMultipleTransactions / intervalStats.totalCards) * 100).toFixed(1)}%
          </div>
          <p className="text-sm text-orange-600 font-medium">Taux de Réutilisation</p>
          <p className="text-xs text-muted-foreground">
            Cartes utilisées plusieurs fois
          </p>
        </div>
      </div>

      {/* Profils d'utilisation */}
      <div className="space-y-4">
        <h4 className="font-semibold text-lg">Profils d'Utilisation des Cartes</h4>
        <div className="grid gap-3 md:grid-cols-2">
          {intervalStats.usagePatterns.map((pattern, index) => (
            <div key={index} className={`p-4 rounded-lg border ${getPatternColor(pattern.pattern)}`}>
              <div className="flex items-center justify-between mb-2">
                <h5 className="font-semibold capitalize">{pattern.pattern}</h5>
                <Badge variant="secondary">{pattern.count} cartes</Badge>
              </div>
              <p className="text-sm mb-2">{pattern.description}</p>
              <div className="flex justify-between text-sm">
                <span>{pattern.percentage.toFixed(1)}% des cartes</span>
                <span>Moy: {formatDuration(pattern.avgInterval)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Distribution détaillée */}
      <div className="space-y-4">
        <h4 className="font-semibold text-lg">Distribution des Intervalles</h4>
        <div className="space-y-3">
          {intervalStats.intervalDistribution.map((dist, index) => (
            <div key={index} className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium">{dist.range}</span>
                  <span className="text-sm text-muted-foreground ml-2">- {dist.description}</span>
                </div>
                <div className="text-right">
                  <span className="font-medium">{dist.count} intervalles</span>
                  <span className="text-sm text-muted-foreground ml-2">({dist.percentage.toFixed(1)}%)</span>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(dist.percentage, 2)}%` }}
                          />
                        </div>
            </div>
          ))}
        </div>
      </div>

      {/* Exemples de cartes */}
      {cardData.length > 0 && (
        <div className="space-y-4">
          <h4 className="font-semibold text-lg">Exemples de Comportements (Top 10)</h4>
          <div className="space-y-2">
            {cardData.map((card, index) => (
              <div key={index} className="p-3 border rounded-lg bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{card.cardId.slice(-8)}</Badge>
                    <Badge className={getPatternColor(card.usagePattern).replace('text-', 'bg-').replace('bg-', 'text-white bg-')}>
                      {card.usagePattern}
                    </Badge>
                  </div>
                  <span className="text-sm font-medium">{card.totalTransactions} transactions</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Intervalle moyen:</span>
                    <div className="font-medium">{formatDuration(card.averageInterval)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Plus court:</span>
                    <div className="font-medium">{formatDuration(card.minInterval)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Première:</span>
                    <div className="font-medium">{formatTime(card.firstTransaction)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Dernière:</span>
                    <div className="font-medium">{formatTime(card.lastTransaction)}</div>
                  </div>
                      </div>
                    </div>
                  ))}
          </div>
                </div>
              )}
            </div>
  );
};

// Component to display peak intervals with 15-minute granularity
interface PeakIntervalsDisplayProps {
  editionConfig: EditionConfig;
}

const PeakIntervalsDisplay: React.FC<PeakIntervalsDisplayProps> = ({ editionConfig }) => {
  const [peakIntervals, setPeakIntervals] = useState<PeakInterval[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch 15-minute interval data
  const fetchPeakIntervals = async () => {
    setLoading(true);
    try {
      const startDate = editionConfig.dateRange.start;
      const endDate = editionConfig.dateRange.end;

      // Get bar orders and recharges
      const [{ data: barOrders }, { data: recharges }] = await Promise.all([
        supabase
          .from('bar_orders')
          .select('*')
          .gte('created_at', startDate)
          .lte('created_at', endDate + 'T23:59:59.999Z'),
        supabase
          .from('recharges')
          .select('*')
          .gte('created_at', startDate)
          .lte('created_at', endDate + 'T23:59:59.999Z')
      ]);

      // Create 15-minute intervals from 17:00 to 24:00
      const intervalMap = new Map<string, { transactions: number; amount: number }>();
      
      for (let hour = 17; hour < 24; hour++) {
        for (let minute = 0; minute < 60; minute += 15) {
          const timeSlot = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
          intervalMap.set(timeSlot, { transactions: 0, amount: 0 });
        }
      }

      // Process bar orders
      barOrders?.forEach(order => {
        const timestamp = new Date(order.created_at);
        const hour = timestamp.getHours();
        const minute = timestamp.getMinutes();
        
        if (hour >= 17 && hour < 24) {
          const intervalMinute = Math.floor(minute / 15) * 15;
          const timeSlot = `${hour.toString().padStart(2, '0')}:${intervalMinute.toString().padStart(2, '0')}`;
          
          const current = intervalMap.get(timeSlot);
          if (current) {
            current.transactions += 1;
            current.amount += order.total_amount || 0;
          }
        }
      });

      // Process recharges
      recharges?.forEach(recharge => {
        const timestamp = new Date(recharge.created_at);
        const hour = timestamp.getHours();
        const minute = timestamp.getMinutes();
        
        if (hour >= 17 && hour < 24) {
          const intervalMinute = Math.floor(minute / 15) * 15;
          const timeSlot = `${hour.toString().padStart(2, '0')}:${intervalMinute.toString().padStart(2, '0')}`;
          
          const current = intervalMap.get(timeSlot);
          if (current) {
            current.transactions += 1;
            current.amount += recharge.amount || 0;
          }
        }
      });

      // Convert to sorted array and get top 8
      const intervals = Array.from(intervalMap.entries())
        .map(([timeSlot, data]) => ({
          timeSlot,
          totalTransactions: data.transactions,
          totalAmount: data.amount,
          rank: 0
        }))
        .sort((a, b) => b.totalTransactions - a.totalTransactions)
        .slice(0, 8)
        .map((interval, index) => ({
          ...interval,
          rank: index + 1
        }));

      setPeakIntervals(intervals);
    } catch (error) {
      console.error('Error fetching peak intervals:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPeakIntervals();
  }, [editionConfig]);

  const formatCurrency = (amount: number) => `€${amount.toFixed(2)}`;

  // Calculate end time for interval
  const getEndTime = (timeSlot: string) => {
    const [hourStr, minuteStr] = timeSlot.split(':');
    const hour = parseInt(hourStr);
    const minute = parseInt(minuteStr);
    const totalMinutes = hour * 60 + minute + 15;
    
    if (totalMinutes >= 24 * 60) {
      return '00:00';
    }
    
    const endHour = Math.floor(totalMinutes / 60);
    const endMinute = totalMinutes % 60;
    return `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3">
        {peakIntervals.map((interval, index) => (
          <div
            key={interval.timeSlot}
            className={`p-4 rounded-lg border-2 transition-all ${
              index === 0
                ? 'border-yellow-400 bg-yellow-50 shadow-lg'
                : index === 1
                ? 'border-gray-400 bg-gray-50 shadow-md'
                : index === 2
                ? 'border-orange-400 bg-orange-50 shadow-md'
                : 'border-gray-200 bg-white'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    index === 0
                      ? 'bg-yellow-500 text-white'
                      : index === 1
                      ? 'bg-gray-500 text-white'
                      : index === 2
                      ? 'bg-orange-500 text-white'
                      : 'bg-blue-500 text-white'
                  }`}
                >
                  {interval.rank}
              </div>
                <div>
                  <h4 className="font-semibold text-lg">
                    {interval.timeSlot} - {getEndTime(interval.timeSlot)}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Intervalle de 15 minutes
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold text-blue-600">
                  {interval.totalTransactions} transactions
                </div>
                <div className="text-sm text-green-600 font-medium">
                  {formatCurrency(interval.totalAmount)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {peakIntervals.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Aucune donnée de transactions trouvée</p>
          <p className="text-sm">Les données d'intervalles apparaîtront ici une fois disponibles</p>
            </div>
          )}
    </div>
  );
};

export default TemporalStatistics;