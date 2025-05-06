
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Payment from "./pages/Payment";
import PaymentSuccess from "./pages/PaymentSuccess";
import NotFound from "./pages/NotFound";
import ScanRedirect from "./pages/ScanRedirect";
import AdminPage from "./pages/AdminPage";
import LoginPage from "./pages/LoginPage";
import BarPage from "./pages/BarPage";
import RechargePage from "./pages/RechargePage";
import RefundPage from "./pages/RefundPage";
import Unauthorized from "./pages/Unauthorized";
import { AuthProvider } from "@/hooks/use-auth";
import ProtectedRoute from "@/components/ProtectedRoute";

// Save the logo image
import "./assets/logo.png";

const queryClient = new QueryClient();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/payment/:id" element={<Payment />} />
              <Route path="/payment-success" element={<PaymentSuccess />} />
              <Route path="/s/:id" element={<ScanRedirect />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/refund" element={<RefundPage />} />
              <Route 
                path="/bar" 
                element={
                  <ProtectedRoute requiredRoles={['bar', 'admin']}>
                    <BarPage />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/admin" 
                element={
                  <ProtectedRoute requiredRoles={['admin']}>
                    <AdminPage />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/recharge" 
                element={
                  <ProtectedRoute requiredRoles={['recharge', 'admin']}>
                    <RechargePage />
                  </ProtectedRoute>
                } 
              />
              <Route path="/unauthorized" element={<Unauthorized />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
