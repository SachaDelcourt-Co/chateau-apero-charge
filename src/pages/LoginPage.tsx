
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, LogIn } from "lucide-react";
import ChateauLogo from '@/components/ChateauLogo';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from '@/hooks/use-auth';

type Role = 'admin' | 'bar' | 'recharge';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Role>('bar');
  const { toast } = useToast();
  const navigate = useNavigate();
  const { signIn, user, role } = useAuth();

  // Si l'utilisateur est déjà connecté, redirigez-le en fonction de son rôle
  useEffect(() => {
    if (user) {
      redirectBasedOnUserRole();
    }
  }, [user, role]);

  const redirectBasedOnUserRole = () => {
    if (!role) return;
    
    if (role === 'admin') {
      navigate('/admin');
    } else if (role === 'bar') {
      navigate('/bar');
    } else if (role === 'recharge') {
      navigate('/recharge');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast({
        title: "Erreur",
        description: "Veuillez remplir tous les champs",
        variant: "destructive"
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      const { success, message } = await signIn(email, password);
      
      if (!success) {
        throw new Error(message);
      }
      
      toast({
        title: "Connexion réussie",
        description: "Vous êtes maintenant connecté"
      });

      // La redirection se fera automatiquement grâce au useEffect
    } catch (error: any) {
      toast({
        title: "Erreur de connexion",
        description: error.message || "Impossible de se connecter. Vérifiez vos identifiants.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-chateau-gradient">
      <div className="w-full max-w-md p-4">
        <div className="flex justify-center mb-8">
          <ChateauLogo />
        </div>
        
        <Card className="border-amber-200 shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Connexion</CardTitle>
            <CardDescription className="text-center">
              Connectez-vous selon votre rôle
            </CardDescription>
          </CardHeader>
          
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as Role)} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="admin">Admin</TabsTrigger>
              <TabsTrigger value="bar">Bar</TabsTrigger>
              <TabsTrigger value="recharge">Recharge</TabsTrigger>
            </TabsList>
            
            <form onSubmit={handleLogin}>
              <CardContent className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="votre@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    autoComplete="username"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="password">Mot de passe</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    autoComplete="current-password"
                  />
                </div>
              </CardContent>
              
              <CardFooter>
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connexion en cours...
                    </>
                  ) : (
                    <>
                      <LogIn className="mr-2 h-4 w-4" />
                      Connexion
                    </>
                  )}
                </Button>
              </CardFooter>
            </form>
          </Tabs>
        </Card>
      </div>
    </div>
  );
};

export default LoginPage;
