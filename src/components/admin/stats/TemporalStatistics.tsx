
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Skeleton } from "@/components/ui/skeleton";
import { TemporalStats } from '@/lib/supabase';
import { Clock } from 'lucide-react';

interface TemporalStatisticsProps {
  data: TemporalStats | null;
  loading: boolean;
}

const TemporalStatistics: React.FC<TemporalStatisticsProps> = ({ data, loading }) => {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Statistiques Temporelles</h2>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">
            Durée moyenne entre transactions
          </CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <div className="text-2xl font-bold">
              {data && data.averageTimeBetweenTransactions > 60 
                ? `${(data.averageTimeBetweenTransactions / 60).toFixed(1)} heures`
                : `${Math.round(data?.averageTimeBetweenTransactions || 0)} minutes`}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Rush hours chart */}
      <Card>
        <CardHeader>
          <CardTitle>Heures de rush (transactions par heure)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80 w-full">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : data?.rushHours && data.rushHours.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.rushHours}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="barTransactions" name="Transactions Bar" fill="#8884d8" />
                  <Bar dataKey="rechargeTransactions" name="Recharges" fill="#82ca9d" />
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

export default TemporalStatistics;
