
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { ChateauContainer } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, CreditCard, TrendingUp } from "lucide-react";
import { supabase } from '@/lib/supabase';

interface CardData {
  id: string;
  amount: string | number;
  description?: string;
}

interface CardSummary {
  totalCards: number;
  totalBalance: number;
  avgBalance: number;
  recentTopUps: CardData[];
}

const Dashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<CardSummary>({
    totalCards: 0,
    totalBalance: 0,
    avgBalance: 0,
    recentTopUps: []
  });
  
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        // Récupérer les données des cartes
        const { data: tableCards, error: tableCardsError } = await supabase
          .from('table_cards')
          .select('*');
          
        if (tableCardsError) throw tableCardsError;
        
        // Calculer les métriques
        const validCards = tableCards.filter(card => card && card.amount);
        const totalCards = validCards.length;
        const totalBalance = validCards.reduce((sum, card) => sum + (parseFloat(card.amount) || 0), 0);
        const avgBalance = totalCards > 0 ? totalBalance / totalCards : 0;
        
        // Obtenir les dernières recharges (simulation - dans un système réel, il faudrait une table de transactions)
        // Dans cet exemple, nous utilisons simplement les cartes avec les montants les plus élevés
        const recentTopUps = [...validCards]
          .sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount))
          .slice(0, 5);
        
        setSummary({
          totalCards,
          totalBalance,
          avgBalance,
          recentTopUps
        });
        
      } catch (error) {
        console.error("Erreur lors de la récupération des données du tableau de bord:", error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchDashboardData();
  }, []);
  
  // Simuler des données pour le graphique
  const chartData = [
    { name: 'Lun', montant: 400 },
    { name: 'Mar', montant: 300 },
    { name: 'Mer', montant: 500 },
    { name: 'Jeu', montant: 280 },
    { name: 'Ven', montant: 590 },
    { name: 'Sam', montant: 800 },
    { name: 'Dim', montant: 400 },
  ];
  
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Total des cartes
            </CardTitle>
            <CreditCard className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-24 bg-gray-700" />
            ) : (
              <div className="text-2xl font-bold">{summary.totalCards}</div>
            )}
          </CardContent>
        </Card>
        
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Solde total
            </CardTitle>
            <Wallet className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-24 bg-gray-700" />
            ) : (
              <div className="text-2xl font-bold">{summary.totalBalance.toFixed(2)}€</div>
            )}
          </CardContent>
        </Card>
        
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Solde moyen
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-24 bg-gray-700" />
            ) : (
              <div className="text-2xl font-bold">{summary.avgBalance.toFixed(2)}€</div>
            )}
          </CardContent>
        </Card>
      </div>
      
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle>Recharges de cartes (Simulation)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                <XAxis dataKey="name" stroke="#888" />
                <YAxis stroke="#888" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#333', border: '1px solid #555' }} 
                  labelStyle={{ color: '#fff' }}
                />
                <Legend />
                <Bar dataKey="montant" name="Montant (€)" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
      
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle>Cartes avec les soldes les plus élevés</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full bg-gray-700" />
              <Skeleton className="h-12 w-full bg-gray-700" />
              <Skeleton className="h-12 w-full bg-gray-700" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID Carte</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.recentTopUps.map((card) => (
                  <TableRow key={card.id}>
                    <TableCell className="font-medium">{card.id}</TableCell>
                    <TableCell>{card.description || 'N/A'}</TableCell>
                    <TableCell className="text-right">{parseFloat(card.amount.toString()).toFixed(2)}€</TableCell>
                  </TableRow>
                ))}
                {summary.recentTopUps.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-gray-400">
                      Aucune carte trouvée
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
