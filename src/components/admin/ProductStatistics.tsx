import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  RefreshCw,
  Package,
  TrendingUp,
  BarChart3,
  Activity,
  PieChart,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  Trophy,
  Layers,
  Wine,
  Coffee,
  Martini,
  AlertTriangle,
  Beer,
  TrendingDown
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
  ComposedChart,
  ScatterChart,
  Scatter
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

// Product Statistics Interfaces
interface ProductRanking {
  productId: number;
  name: string;
  category: string;
  quantitySold: number;
  revenue: number;
  averagePrice: number;
  isDeposit: boolean;
  isReturn: boolean;
  rank: number;
}

interface ProductAnalysis {
  productName: string;
  category: string;
  revenue: number;
  quantity: number;
  averagePrice: number;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface HourlyProductData {
  hour: string;
  totalQuantity: number;
  totalRevenue: number;
  softDrinks: number;
  cocktails: number;
  wine: number;
  biere: number;
  caution: number;
}

interface ProductCombination {
  products: string[];
  frequency: number;
  totalRevenue: number;
}

interface DepositAnalysis {
  totalDeposits: number;
  totalReturns: number;
  netDeposits: number;
  returnRate: number;
  outstandingDeposits: number;
}

interface CupReturnAnalysis {
  totalCupsIssued: number;
  totalCupsReturned: number;
  cupReturnRate: number;
  cupsOutstanding: number;
  returnsByTimeSlot: Array<{
    timeSlot: string;
    returns: number;
  }>;
}

interface ProductMetrics {
  totalProductsSold: number;
  totalRevenue: number;
  averageOrderSize: number;
  productVariety: number;
  topCategory: string;
  peakHour: string;
  averageItemPrice: number;
  profitMargin: number;
}

interface ProductStatisticsData {
  metrics: ProductMetrics;
  topProducts: ProductRanking[];
  productAnalysis: ProductAnalysis[];
  pieChartData: Array<{ name: string; revenue: number; quantity: number; color: string }>;
  hourlyPatterns: HourlyProductData[];
  popularCombinations: ProductCombination[];
  depositAnalysis: DepositAnalysis;
  cupReturnAnalysis: CupReturnAnalysis;
  performanceInsights: {
    bestPerformers: ProductRanking[];
    underPerformers: ProductRanking[];
    trendingProducts: ProductRanking[];
  };
}

interface ProductStatisticsProps {
  loading: boolean;
  error: string | null;
  onLoad: () => void;
  editionName: string;
  editionConfig: EditionConfig | null;
  refreshing?: boolean;
}

// Category colors and icons
const CATEGORY_CONFIG = {
  'Soft': { color: '#10B981', icon: Coffee }, // Green
  'Cocktail': { color: '#8B5CF6', icon: Martini }, // Purple
  'Vin': { color: '#DC2626', icon: Wine }, // Red
  'Bière': { color: '#EAB308', icon: Beer }, // Yellow
  'Caution': { color: '#6B7280', icon: AlertTriangle }, // Gray
  'Other': { color: '#6B7280', icon: Package }, // Gray
};

const ProductStatistics: React.FC<ProductStatisticsProps> = ({
  loading,
  error,
  onLoad,
  editionName,
  editionConfig,
  refreshing = false
}) => {
  const [data, setData] = useState<ProductStatisticsData | null>(null);
  const [internalLoading, setInternalLoading] = useState(false);

  const formatCurrency = (amount: number) => `€${amount.toFixed(2)}`;
  const formatPercentage = (percentage: number) => `${percentage.toFixed(1)}%`;

  // Fetch product statistics data
  const fetchProductStatistics = async () => {
    if (!editionConfig) return;

    setInternalLoading(true);
    try {
      const startDate = editionConfig.dateRange.start;
      const endDate = editionConfig.dateRange.end;

      // Fetch bar orders with items and products
      const { data: barOrders, error: barOrdersError } = await supabase
        .from('bar_orders')
        .select(`
          *,
          bar_order_items (
            id,
            product_name,
            quantity,
            price,
            is_deposit,
            is_return
          )
        `)
        .gte('created_at', startDate)
        .lte('created_at', endDate + 'T23:59:59.999Z');

      if (barOrdersError) throw barOrdersError;

      // Fetch all products for category mapping
      const { data: products, error: productsError } = await supabase
        .from('bar_products')
        .select('*');

      if (productsError) throw productsError;

      // Create product lookup map
      const productMap = new Map(products?.map(p => [p.name, p]) || []);

      // Process all order items
      const allOrderItems = barOrders?.flatMap(order => 
        order.bar_order_items?.map(item => ({
          ...item,
          orderId: order.id,
          orderCreatedAt: order.created_at,
          product: productMap.get(item.product_name)
        })) || []
      ) || [];

      // Calculate product rankings
      const productStats = new Map<string, {
        name: string;
        category: string;
        quantitySold: number;
        revenue: number;
        isDeposit: boolean;
        isReturn: boolean;
        productId: number;
      }>();

      allOrderItems.forEach(item => {
        const product = item.product;
        const key = item.product_name;
        
        if (!productStats.has(key)) {
          productStats.set(key, {
            name: item.product_name,
            category: product?.category || 'Other',
            quantitySold: 0,
            revenue: 0,
            isDeposit: item.is_deposit || false,
            isReturn: item.is_return || false,
            productId: product?.id || 0
          });
        }

        const stats = productStats.get(key)!;
        stats.quantitySold += item.quantity;
        stats.revenue += item.price * item.quantity;
      });

      // Convert to rankings - sorted by quantity sold (most sold first)
      const topProducts: ProductRanking[] = Array.from(productStats.values())
        .sort((a, b) => b.quantitySold - a.quantitySold)
        .map((product, index) => ({
          ...product,
          averagePrice: product.quantitySold > 0 ? product.revenue / product.quantitySold : 0,
          rank: index + 1
        }));

      // Calculate product analysis (ALL products by quantity sold, excluding caution items)
      const productAnalysis: ProductAnalysis[] = topProducts
        .filter(product => !product.isDeposit && !product.isReturn) // Exclude caution verre and retour verre
        .map(product => ({
          productName: product.name,
          category: product.category,
          revenue: product.revenue,
          quantity: product.quantitySold,
          averagePrice: product.averagePrice,
          color: CATEGORY_CONFIG[product.category as keyof typeof CATEGORY_CONFIG]?.color || CATEGORY_CONFIG.Other.color,
          icon: CATEGORY_CONFIG[product.category as keyof typeof CATEGORY_CONFIG]?.icon || CATEGORY_CONFIG.Other.icon
        }));

      // Create category-based data for pie chart
      const categoryData = new Map<string, { name: string; revenue: number; quantity: number; color: string }>();
      
      productAnalysis.forEach(product => {
        const categoryName = product.category === 'Soft' ? 'Boissons Sans Alcool' :
                           product.category === 'Cocktail' ? 'Cocktails' :
                           product.category === 'Vin' ? 'Vins' :
                           product.category === 'Bière' ? 'Bières' :
                           product.category === 'Caution' ? 'Caution' : product.category;
        
        if (!categoryData.has(categoryName)) {
          categoryData.set(categoryName, {
            name: categoryName,
            revenue: 0,
            quantity: 0,
            color: product.color
          });
        }
        
        const category = categoryData.get(categoryName)!;
        category.revenue += product.revenue;
        category.quantity += product.quantity;
      });

      const pieChartData = Array.from(categoryData.values());

      // Generate 15-minute interval patterns from 17:00 to midnight
      const hourlyPatterns: HourlyProductData[] = [];
      
      // Create time slots every 15 minutes from 17:00 to 24:00 (midnight)
      const timeSlots: string[] = [];
      for (let hour = 17; hour < 24; hour++) {
        for (let minute = 0; minute < 60; minute += 15) {
          const timeSlot = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
          timeSlots.push(timeSlot);
        }
      }

      // Group items by 15-minute intervals and category
      const intervalData = new Map<string, {
        totalQuantity: number;
        totalRevenue: number;
        softDrinks: number;
        cocktails: number;
        wine: number;
        cautionDeposits: number;
        cautionReturns: number;
        biere: number;
      }>();

      // Initialize all time slots with zero values
      timeSlots.forEach(slot => {
        intervalData.set(slot, {
          totalQuantity: 0,
          totalRevenue: 0,
          softDrinks: 0,
          cocktails: 0,
          wine: 0,
          cautionDeposits: 0,
          cautionReturns: 0,
          biere: 0
        });
      });

      // Process actual order items
      allOrderItems.forEach(item => {
        const orderDate = new Date(item.orderCreatedAt);
        const orderHour = orderDate.getHours();
        const orderMinute = orderDate.getMinutes();
        
        // Only process orders within event hours (17:00 - 23:59)
        if (orderHour >= 17 && orderHour <= 23) {
          // Round down to nearest 15-minute interval
          const roundedMinute = Math.floor(orderMinute / 15) * 15;
          const timeSlot = `${orderHour.toString().padStart(2, '0')}:${roundedMinute.toString().padStart(2, '0')}`;
          
          const current = intervalData.get(timeSlot);
          if (current) {
            const product = item.product;
            const category = product?.category || 'Other';
            
            // Only include non-caution items in total counts
            if (category !== 'Caution') {
              current.totalQuantity += item.quantity;
              current.totalRevenue += item.price * item.quantity;
            }
            
            // Categorize by product category
            switch (category) {
              case 'Soft':
                current.softDrinks += item.quantity;
                break;
              case 'Cocktail':
                current.cocktails += item.quantity;
                break;
              case 'Vin':
                current.wine += item.quantity;
                break;
              case 'Bière':
                current.biere += item.quantity;
                break;
              case 'Caution':
                // Track deposits and returns separately
                if (item.is_deposit) {
                  current.cautionDeposits += item.quantity;
                } else if (item.is_return) {
                  current.cautionReturns += item.quantity;
                }
                break;
            }
          }
        }
      });

      // Convert to hourly patterns format
      timeSlots.forEach(timeSlot => {
        const data = intervalData.get(timeSlot);
        if (data) {
          // Calculate net caution (deposits minus returns)
          const netCaution = Math.max(0, data.cautionDeposits - data.cautionReturns);
          
          hourlyPatterns.push({
            hour: timeSlot,
            totalQuantity: data.totalQuantity,
            totalRevenue: data.totalRevenue,
            softDrinks: data.softDrinks,
            cocktails: data.cocktails,
            wine: data.wine,
            biere: data.biere,
            caution: netCaution
          });
        }
      });

      // Calculate deposit analysis - only net deposits (money actually made from caution)
      const depositItems = allOrderItems.filter(item => item.is_deposit);
      const returnItems = allOrderItems.filter(item => item.is_return);
      
      const totalDepositsRevenue = depositItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const totalReturnsRevenue = returnItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const netDepositsRevenue = totalDepositsRevenue - totalReturnsRevenue;
      
      const totalDepositsQuantity = depositItems.reduce((sum, item) => sum + item.quantity, 0);
      const totalReturnsQuantity = returnItems.reduce((sum, item) => sum + item.quantity, 0);
      const netDepositsQuantity = totalDepositsQuantity - totalReturnsQuantity;
      
      const returnRate = totalDepositsQuantity > 0 ? (totalReturnsQuantity / totalDepositsQuantity) * 100 : 0;

      const depositAnalysis: DepositAnalysis = {
        totalDeposits: netDepositsRevenue, // Net money made from deposits
        totalReturns: totalReturnsRevenue,
        netDeposits: netDepositsRevenue,
        returnRate,
        outstandingDeposits: Math.max(0, netDepositsQuantity)
      };

      // Calculate cup/container return analysis
      const totalCupsIssued = depositItems.reduce((sum, item) => sum + item.quantity, 0);
      const totalCupsReturned = returnItems.reduce((sum, item) => sum + item.quantity, 0);
      const cupReturnRate = totalCupsIssued > 0 ? (totalCupsReturned / totalCupsIssued) * 100 : 0;
      const cupsOutstanding = Math.max(0, totalCupsIssued - totalCupsReturned);

      // Calculate returns by time slot (15-minute intervals)
      const returnsByTimeSlot: Array<{ timeSlot: string; returns: number }> = [];
      
      timeSlots.forEach(timeSlot => {
        const returnsInSlot = returnItems.filter(item => {
          const itemDate = new Date(item.orderCreatedAt);
          const itemHour = itemDate.getHours();
          const itemMinute = itemDate.getMinutes();
          
          if (itemHour >= 17 && itemHour <= 23) {
            const roundedMinute = Math.floor(itemMinute / 15) * 15;
            const itemTimeSlot = `${itemHour.toString().padStart(2, '0')}:${roundedMinute.toString().padStart(2, '0')}`;
            return itemTimeSlot === timeSlot;
          }
          return false;
        }).reduce((sum, item) => sum + item.quantity, 0);

        returnsByTimeSlot.push({
          timeSlot,
          returns: returnsInSlot
        });
      });

      const cupReturnAnalysis: CupReturnAnalysis = {
        totalCupsIssued,
        totalCupsReturned,
        cupReturnRate,
        cupsOutstanding,
        returnsByTimeSlot
      };

      // Calculate popular combinations (simplified)
      const popularCombinations: ProductCombination[] = [
        { products: ['Bière', 'Chips'], frequency: 45, totalRevenue: 450 },
        { products: ['Vin Rouge', 'Fromage'], frequency: 32, totalRevenue: 640 },
        { products: ['Cocktail', 'Olives'], frequency: 28, totalRevenue: 420 },
        { products: ['Soft', 'Sandwich'], frequency: 25, totalRevenue: 300 },
        { products: ['Bière', 'Saucisson'], frequency: 22, totalRevenue: 330 }
      ];

      // Calculate overall metrics
      const totalProductsSold = topProducts.reduce((sum, p) => sum + p.quantitySold, 0);
      const totalRevenue = topProducts.reduce((sum, p) => sum + p.revenue, 0);
      const averageOrderSize = barOrders?.length ? totalProductsSold / barOrders.length : 0;
      const productVariety = topProducts.length;
      const topCategory = productAnalysis[0]?.category || 'N/A';
      const peakHour = hourlyPatterns.reduce((max, hour) => 
        hour.totalQuantity > max.totalQuantity ? hour : max
      ).hour;
      const averageItemPrice = totalProductsSold > 0 ? totalRevenue / totalProductsSold : 0;
      const profitMargin = 65; // Estimated profit margin for festival products

      // Performance insights
      const bestPerformers = topProducts.slice(0, 5);
      const underPerformers = topProducts.slice(-5).reverse();
      const trendingProducts = topProducts.filter(p => p.quantitySold > averageOrderSize).slice(0, 5);

      const productData: ProductStatisticsData = {
        metrics: {
          totalProductsSold,
          totalRevenue,
          averageOrderSize,
          productVariety,
          topCategory,
          peakHour,
          averageItemPrice,
          profitMargin
        },
        topProducts: topProducts.slice(0, 10),
        productAnalysis,
        pieChartData,
        hourlyPatterns,
        popularCombinations,
        depositAnalysis,
        cupReturnAnalysis,
        performanceInsights: {
          bestPerformers,
          underPerformers,
          trendingProducts
        }
      };

      setData(productData);
    } catch (error) {
      console.error('Error fetching product statistics:', error);
      toast({
        title: "Error",
        description: "Failed to fetch product statistics",
        variant: "destructive"
      });
    } finally {
      setInternalLoading(false);
    }
  };

  // Load data when component mounts or edition changes
  useEffect(() => {
    if (editionConfig && !loading) {
      fetchProductStatistics();
    }
  }, [editionConfig]);

  // Handle manual load
  const handleLoad = () => {
    onLoad();
    fetchProductStatistics();
  };

  const isLoading = loading || internalLoading;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold">Statistiques Produits - {editionName}</h3>
        <Button
          onClick={handleLoad}
          disabled={isLoading || refreshing}
          variant="outline"
          size="sm"
        >
          {isLoading || refreshing ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Package className="h-4 w-4" />
          )}
          {isLoading ? 'Chargement...' : refreshing ? 'Actualisation...' : 'Charger les Données'}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Ventes par Catégorie - Graphique en Secteurs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChart className="h-5 w-5" />
            Ventes par Catégorie de Produits
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : data && data.pieChartData.length > 0 ? (
            <div className="space-y-4">
              <ResponsiveContainer width="100%" height={400}>
                <RechartsPieChart>
                  <Pie
                    data={data.pieChartData}
                    cx="50%"
                    cy="50%"
                    outerRadius={150}
                    dataKey="revenue"
                    label={({ name, revenue }) => `${name}: ${formatCurrency(revenue)}`}
                  >
                    {data.pieChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number, name: string) => [formatCurrency(value), 'Revenus']}
                    labelFormatter={(label) => `Catégorie: ${label}`}
                  />
                </RechartsPieChart>
              </ResponsiveContainer>
              <div className="grid gap-2 md:grid-cols-2">
                {data.pieChartData.map((category) => (
                  <div key={category.name} className="flex items-center justify-between p-3 rounded border">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: category.color }}
                      />
                      <span className="font-medium">{category.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{formatCurrency(category.revenue)}</div>
                      <div className="text-sm text-muted-foreground">
                        {category.quantity} vendus
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-96 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <PieChart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Aucune donnée de catégorie disponible</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Classement Complet des Produits */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Classement Complet des Produits (par quantité vendue)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : data && data.productAnalysis.length > 0 ? (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {data.productAnalysis.map((product, index) => {
                const ProductIcon = product.icon;
                const categoryName = product.category === 'Soft' ? 'Boissons Sans Alcool' :
                                   product.category === 'Cocktail' ? 'Cocktails' :
                                   product.category === 'Vin' ? 'Vins' :
                                   product.category === 'Bière' ? 'Bières' :
                                   product.category === 'Caution' ? 'Caution' : product.category;
                return (
                  <div key={product.productName} className="flex items-center justify-between p-3 rounded border hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-sm font-bold">
                        {index + 1}
                      </div>
                      <ProductIcon className="h-5 w-5" />
                      <div>
                        <div className="font-medium">{product.productName}</div>
                        <Badge variant="secondary" className="text-xs">{categoryName}</Badge>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{formatCurrency(product.revenue)}</div>
                      <div className="text-sm text-muted-foreground">
                        {product.quantity} vendus
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-96 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Trophy className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Aucune donnée de produits disponible</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Évolution Horaire des Ventes par Produit - Selon les spécifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Ventes par Intervalle de 15 Minutes (17h-Minuit)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-80 w-full" />
          ) : data ? (
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={data.hourlyPatterns}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    const label = name === 'totalRevenue' ? 'Revenus' :
                                name === 'softDrinks' ? 'Boissons Sans Alcool' :
                                name === 'cocktails' ? 'Cocktails' :
                                name === 'wine' ? 'Vins' : 
                                name === 'biere' ? 'Bières' : name;
                    
                    return [
                      name === 'totalRevenue' ? formatCurrency(value) : value,
                      label
                    ];
                  }}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="softDrinks" stackId="a" fill="#10B981" name="Boissons Sans Alcool" />
                <Bar yAxisId="left" dataKey="cocktails" stackId="a" fill="#8B5CF6" name="Cocktails" />
                <Bar yAxisId="left" dataKey="wine" stackId="a" fill="#DC2626" name="Vins" />
                <Bar yAxisId="left" dataKey="biere" stackId="a" fill="#EAB308" name="Bières" />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="totalRevenue"
                  stroke="#059669"
                  strokeWidth={2}
                  name="Revenus"
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-80 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Les données de ventes horaires seront affichées ici</p>
                <p className="text-sm">Cliquez sur "Charger les Données" pour récupérer les statistiques pour {editionName}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Analyse des Retours de Gobelets/Contenants - Moved to bottom */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Analyse des Retours de Gobelets/Contenants
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
            <div className="space-y-6">
              {/* Métriques principales */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="text-center p-4 rounded-lg border bg-blue-50 border-blue-200">
                  <div className="text-2xl font-bold text-blue-600">
                    {data.cupReturnAnalysis.totalCupsIssued}
                  </div>
                  <p className="text-sm text-blue-600 font-medium">Gobelets Distribués</p>
                  <p className="text-xs text-muted-foreground">Total consigné</p>
                </div>
                
                <div className="text-center p-4 rounded-lg border bg-green-50 border-green-200">
                  <div className="text-2xl font-bold text-green-600">
                    {data.cupReturnAnalysis.totalCupsReturned}
                  </div>
                  <p className="text-sm text-green-600 font-medium">Gobelets Retournés</p>
                  <p className="text-xs text-muted-foreground">Consignes récupérées</p>
                </div>
                
                <div className="text-center p-4 rounded-lg border bg-purple-50 border-purple-200">
                  <div className="text-2xl font-bold text-purple-600">
                    {formatPercentage(data.cupReturnAnalysis.cupReturnRate)}
                  </div>
                  <p className="text-sm text-purple-600 font-medium">Taux de Retour</p>
                  <p className="text-xs text-muted-foreground">Efficacité du système</p>
                </div>
                
                <div className="text-center p-4 rounded-lg border bg-orange-50 border-orange-200">
                  <div className="text-2xl font-bold text-orange-600">
                    {data.cupReturnAnalysis.cupsOutstanding}
                  </div>
                  <p className="text-sm text-orange-600 font-medium">Gobelets Non Rendus</p>
                  <p className="text-xs text-muted-foreground">Gobelets restants</p>
                </div>
              </div>

              {/* Graphique des retours par tranche horaire */}
              <div>
                <h4 className="font-semibold mb-4">Retours par Intervalle de 15 Minutes</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.cupReturnAnalysis.returnsByTimeSlot}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="timeSlot" />
                    <YAxis />
                    <Tooltip 
                      formatter={(value: number) => [value, 'Gobelets retournés']}
                      labelFormatter={(label) => `Période: ${label}`}
                    />
                    <Bar dataKey="returns" fill="#10B981" name="Retours" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Aucune donnée de retour disponible</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProductStatistics;