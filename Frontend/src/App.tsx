import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import ProjectPage from "./pages/ProjectPage";
import UploadPage from "./pages/UploadPage";
import ProcessingPage from "./pages/ProcessingPage";
import SearchPage from "./pages/SearchPage";
import DocumentsPage from "./pages/DocumentsPage";
import ChatPage from "./pages/ChatPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <div className="min-h-screen relative">
          <div className="relative z-10">
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/project/:projectId" element={<ProjectPage />} />
              <Route path="/upload" element={<UploadPage />} />
              <Route path="/processing/:documentId" element={<ProcessingPage />} />
              <Route path="/chat/:projectId" element={<ChatPage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/documents" element={<DocumentsPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </div>
        </div>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
