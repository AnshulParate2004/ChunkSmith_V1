"use client";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import LandingPage from "./views/LandingPage";
import Dashboard from "./views/Dashboard";
import ProjectPage from "./views/ProjectPage";
import UploadPage from "./views/UploadPage";
import ProcessingPage from "./views/ProcessingPage";
import SearchPage from "./views/SearchPage";
import DocumentsPage from "./views/DocumentsPage";
import ChatPage from "./views/ChatPage";
import NotFound from "./views/NotFound";
import AuthPage from "./views/AuthPage";
import TermsPage from "./views/TermsPage";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Loader2 } from "lucide-react";
import { CookieConsentBanner } from "./components/CookieConsentBanner";
import { useEffect, useState } from "react";

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

export default function App() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
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
}
