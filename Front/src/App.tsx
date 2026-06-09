import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import Dashboard from "./pages/Dashboard";
import ProjectPage from "./pages/ProjectPage";
import UploadPage from "./pages/UploadPage";
import ProcessingPage from "./pages/ProcessingPage";
import SearchPage from "./pages/SearchPage";
import DocumentsPage from "./pages/DocumentsPage";
import ChatPage from "./pages/ChatPage";
import NotFound from "./pages/NotFound";
import AuthPage from "./pages/AuthPage"; // New
import TermsPage from "./pages/TermsPage";
import { AuthProvider, useAuth } from "./context/AuthContext"; // New
import { Loader2 } from "lucide-react";
import { CookieConsentBanner } from "./components/CookieConsentBanner";

const queryClient = new QueryClient();

// Protected Route Component
const ProtectedRoute = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <Outlet />;
};

const App = () => (
  <AuthProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <div className="min-h-screen relative">
            <div className="relative z-10">
              <Routes>
                {/* Public Routes */}
                <Route path="/" element={<LandingPage />} />
                <Route path="/auth" element={<AuthPage />} />
                <Route path="/terms" element={<TermsPage />} />

                {/* Protected Routes */}
                <Route element={<ProtectedRoute />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/project/:projectId" element={<ProjectPage />} />
                  <Route path="/project/:projectId/upload" element={<UploadPage />} />
                  <Route path="/processing/:documentId" element={<ProcessingPage />} />
                  <Route path="/chat/:projectId" element={<ChatPage />} />
                  <Route path="/search" element={<SearchPage />} />
                  <Route path="/documents" element={<DocumentsPage />} />
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </div>
            <CookieConsentBanner />
          </div>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </AuthProvider>
);

export default App;
