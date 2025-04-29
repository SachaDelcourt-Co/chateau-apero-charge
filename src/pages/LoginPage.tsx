
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, LogIn } from "lucide-react";
import { supabase } from '@/lib/supabase';
import ChateauLogo from '@/components/ChateauLogo';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('admin');
  const { toast } = useToast();
  const navigate = useNavigate();

  // Check if already logged in
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // Get user role from profiles table
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();

        if (profile) {
          redirectBasedOnRole(profile.role);
        } else {
          // Default to admin if no profile found
          navigate('/admin');
        }
      }
    };
    
    checkSession();
  }, [navigate]);

  const redirectBasedOnRole = (role: string) => {
    switch(role) {
      case 'admin':
        navigate('/admin');
        break;
      case 'bar':
        navigate('/bar');
        break;
      case 'recharge':
        navigate('/recharge');
        break;
      default:
        navigate('/admin');
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
      const { data, error } = await supabase.auth.signInWithPassword({ 
        email, 
        password 
      });
      
      if (error) {
        throw error;
      }
      
      if (data?.user) {
        // Get user role from profiles
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .single();

        if (profileError) {
          throw profileError;
        }

        toast({
          title: "Connexion réussie",
          description: "Vous êtes maintenant connecté"
        });

        // Check if the user has the role they're trying to log in as
        const userRole = profile?.role || 'bar';
        
        if (activeTab === 'admin' && userRole !== 'admin') {
          throw new Error("Vous n'avez pas les droits d'administrateur");
        } else if (activeTab === 'bar' && userRole !== 'bar' && userRole !== 'admin') {
          throw new Error("Vous n'avez pas les droits pour accéder au bar");
        } else if (activeTab === 'recharge' && userRole !== 'recharge' && userRole !== 'admin') {
          throw new Error("Vous n'avez pas les droits pour accéder à la recharge");
        }

        redirectBasedOnRole(activeTab);
      }
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
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
