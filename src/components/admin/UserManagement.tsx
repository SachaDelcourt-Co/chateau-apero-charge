
import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserPlus, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

type Role = 'admin' | 'bar' | 'recharge';

interface UserProfile {
  id: string;
  email: string;
  role: Role;
  created_at: string;
}

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<Role>('bar');
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  const { hasAccess, createUser } = useAuth();
  const { toast } = useToast();

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // First get all profiles with their roles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, role, created_at');
      
      if (profilesError) {
        throw profilesError;
      }
      
      // Then get the user emails from auth
      const usersWithEmails = await Promise.all(profiles.map(async (profile) => {
        try {
          // Use admin API to get user details
          const { data, error } = await supabase
            .auth
            .admin
            .getUserById(profile.id);
            
          let email = '';
          if (!error && data) {
            email = data.user.email || '';
          } else {
            console.error('Erreur lors de la récupération de l\'email:', error);
          }
          
          return {
            ...profile,
            email
          };
        } catch (error) {
          console.error('Error fetching user email:', error);
          return {
            ...profile,
            email: 'Error fetching email'
          };
        }
      }));
      
      setUsers(usersWithEmails as UserProfile[]);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: "Erreur",
        description: "Impossible de récupérer la liste des utilisateurs",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async () => {
    if (!newUserEmail || !newUserPassword) {
      toast({
        title: "Erreur",
        description: "Veuillez remplir tous les champs",
        variant: "destructive"
      });
      return;
    }
    
    setIsCreatingUser(true);
    
    try {
      const { success, message } = await createUser(newUserEmail, newUserPassword, newUserRole);
      
      if (!success) {
        throw new Error(message);
      }
      
      toast({
        title: "Succès",
        description: `L'utilisateur ${newUserEmail} a été créé avec le rôle ${newUserRole}`
      });
      
      // Reset form and close dialog
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserRole('bar');
      setDialogOpen(false);
      
      // Refresh user list
      fetchUsers();
      
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message || "Impossible de créer l'utilisateur",
        variant: "destructive"
      });
    } finally {
      setIsCreatingUser(false);
    }
  };
  
  // Si l'utilisateur n'a pas les droits admin, ne pas afficher cette page
  if (!hasAccess(['admin'])) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-gray-600">
            Vous n'avez pas les droits nécessaires pour accéder à cette section.
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Gestion des utilisateurs</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />
              Nouvel utilisateur
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Créer un nouvel utilisateur</DialogTitle>
              <DialogDescription>
                Ajoutez un nouvel utilisateur au système.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="email@example.com"
                  disabled={isCreatingUser}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe</Label>
                <Input
                  id="password"
                  type="password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  disabled={isCreatingUser}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Rôle</Label>
                <Select
                  value={newUserRole}
                  onValueChange={(value) => setNewUserRole(value as Role)}
                  disabled={isCreatingUser}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionnez un rôle" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrateur</SelectItem>
                    <SelectItem value="bar">Bar</SelectItem>
                    <SelectItem value="recharge">Recharge</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button 
                onClick={handleCreateUser}
                disabled={isCreatingUser}
              >
                {isCreatingUser ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Création...
                  </>
                ) : (
                  "Créer l'utilisateur"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      
      <Card>
        <CardContent className="p-4">
          {loading ? (
            <div className="flex justify-center p-6">
              <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead>Date de création</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-gray-500 py-6">
                      Aucun utilisateur trouvé
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>{user.email || 'Non défini'}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          user.role === 'admin' ? 'bg-blue-100 text-blue-800' :
                          user.role === 'bar' ? 'bg-green-100 text-green-800' :
                          'bg-purple-100 text-purple-800'
                        }`}>
                          {user.role === 'admin' ? 'Admin' :
                           user.role === 'bar' ? 'Bar' : 'Recharge'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Non défini'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default UserManagement;
