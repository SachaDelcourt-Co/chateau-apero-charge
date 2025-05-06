
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, CreditCard, ShoppingCart, Banknote, CreditCard as CreditCardIcon } from "lucide-react";
import { FinancialStats } from '@/lib/supabase';

interface FinancialStatisticsProps {
  data: FinancialStats | null;
  loading: boolean;
}

const FinancialStatistics: React.FC<FinancialStatisticsProps> = ({ data, loading }) => {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Statistiques Financières</h2>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Total des ventes
            </CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold">{(data?.totalSales || 0).toFixed(2)}€</div>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Total des rechargements
            </CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold">{(data?.totalRecharges.total || 0).toFixed(2)}€</div>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Montant moyen dépensé
            </CardTitle>
            <CreditCardIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold">{(data?.averageSpendPerPerson || 0).toFixed(2)}€</div>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Solde restant non utilisé
            </CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold">{(data?.totalRemainingBalance || 0).toFixed(2)}€</div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Payment Method Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Rechargements par méthode de paiement</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Méthode</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Espèces</TableCell>
                  <TableCell className="text-right">{(data?.totalRecharges.cash || 0).toFixed(2)}€</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">SumUp</TableCell>
                  <TableCell className="text-right">{(data?.totalRecharges.sumup || 0).toFixed(2)}€</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Stripe (Bancontact)</TableCell>
                  <TableCell className="text-right">{(data?.totalRecharges.stripe || 0).toFixed(2)}€</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      
      {/* Transactions by Time */}
      <Card>
        <CardHeader>
          <CardTitle>Transactions par intervalle de temps (30 min)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80 w-full">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : data?.transactionsByTime && data.transactionsByTime.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.transactionsByTime}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="timeInterval" />
                  <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
                  <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="count" name="Nombre de transactions" fill="#8884d8" />
                  <Bar yAxisId="right" dataKey="amount" name="Montant (€)" fill="#82ca9d" />
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
      
      {/* Sales by POS */}
      <Card>
        <CardHeader>
          <CardTitle>Répartition des ventes par point de vente</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : data?.salesByPointOfSale && data.salesByPointOfSale.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Point de vente</TableHead>
                  <TableHead>Transactions</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.salesByPointOfSale.map((pos) => (
                  <TableRow key={pos.pointOfSale}>
                    <TableCell className="font-medium">POS {pos.pointOfSale}</TableCell>
                    <TableCell>{pos.count}</TableCell>
                    <TableCell className="text-right">{pos.amount.toFixed(2)}€</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-6 text-center text-muted-foreground">
              Aucune donnée disponible
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FinancialStatistics;
