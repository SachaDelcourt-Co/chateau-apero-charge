
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserStats } from '@/lib/supabase';
import { Skeleton } from "@/components/ui/skeleton";
import { Users, RefreshCw, ArrowUpRight } from "lucide-react";

interface UserStatisticsProps {
  data: UserStats | null;
  loading: boolean;
}

const UserStatistics: React.FC<UserStatisticsProps> = ({ data, loading }) => {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Statistiques Utilisateurs</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Cartes activées
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold">{data?.totalCards || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Montant moyen rechargé
            </CardTitle>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold">{data?.averageRechargeAmount.toFixed(2) || "0.00"}€</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Taux de réutilisation
            </CardTitle>
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold">{((data?.cardReusageRate || 0) * 100).toFixed(1)}%</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {data?.multipleRechargeCards || 0} cartes avec recharges multiples
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default UserStatistics;
