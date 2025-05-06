
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Skeleton } from "@/components/ui/skeleton";
import { ProductStats } from '@/lib/supabase';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ProductStatisticsProps {
  data: ProductStats | null;
  loading: boolean;
}

const ProductStatistics: React.FC<ProductStatisticsProps> = ({ data, loading }) => {
  // Group products by category
  const getProductsByCategory = () => {
    if (!data?.topProducts) return [];
    
    const categories = new Map();
    
    data.topProducts.forEach(product => {
      const category = product.category || 'Non catégorisé';
      
      if (!categories.has(category)) {
        categories.set(category, []);
      }
      
      categories.get(category).push(product);
    });
    
    // Convert to array format
    return Array.from(categories.entries()).map(([category, products]) => ({
      category,
      products
    }));
  };
  
  // Prepare data for hourly chart
  const getHourlyChartData = () => {
    if (!data?.hourlyProductSales) return [];
    
    // Get top 5 products overall
    const topProductNames = data.topProducts
      .slice(0, 5)
      .map(product => product.name);
    
    // Prepare chart data
    return data.hourlyProductSales.map(hourData => {
      const result: any = { hour: hourData.hour };
      
      // Add data for each top product
      topProductNames.forEach(productName => {
        const product = hourData.products.find(p => p.name === productName);
        result[productName] = product ? product.quantity : 0;
      });
      
      return result;
    });
  };
  
  const productsByCategory = getProductsByCategory();
  const hourlyChartData = getHourlyChartData();
  
  // Get colors for chart
  const chartColors = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#0088fe'];
  
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Statistiques Produits</h2>
      
      {/* Top products by category */}
      <Card>
        <CardHeader>
          <CardTitle>Top ventes par produit</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : productsByCategory.length > 0 ? (
            <Tabs defaultValue={productsByCategory[0]?.category}>
              <TabsList className="mb-4 flex-wrap">
                {productsByCategory.map(({ category }) => (
                  <TabsTrigger key={category} value={category}>
                    {category}
                  </TabsTrigger>
                ))}
              </TabsList>
              
              {productsByCategory.map(({ category, products }: any) => (
                <TabsContent key={category} value={category}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produit</TableHead>
                        <TableHead>Quantité vendue</TableHead>
                        <TableHead className="text-right">Chiffre d'affaires</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products.map((product: any) => (
                        <TableRow key={product.name}>
                          <TableCell className="font-medium">{product.name}</TableCell>
                          <TableCell>{product.quantity}</TableCell>
                          <TableCell className="text-right">{product.revenue.toFixed(2)}€</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            <div className="py-6 text-center text-muted-foreground">
              Aucune donnée disponible
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Hourly product sales chart */}
      <Card>
        <CardHeader>
          <CardTitle>Evolution par heure des ventes par produits</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80 w-full">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : hourlyChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  {data?.topProducts.slice(0, 5).map((product, index) => (
                    <Bar 
                      key={product.name} 
                      dataKey={product.name} 
                      name={product.name} 
                      fill={chartColors[index % chartColors.length]} 
                      stackId="stack"
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                Aucune donnée disponible
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProductStatistics;
