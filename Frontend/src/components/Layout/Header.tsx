import { FileText } from 'lucide-react';
import { Link } from 'react-router-dom';

export const Header = () => {
  return (
    <header className="border-b border-border/50 bg-background/95 backdrop-blur-md sticky top-0 z-50 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent opacity-50"></div>
      <div className="container mx-auto px-6 py-4 relative z-10">
        <div className="flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-3 group">
            <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-all group-hover:shadow-lg group-hover:shadow-primary/20">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">MultiModal RAG</h1>
              <p className="text-xs text-muted-foreground">PDF Processing System</p>
            </div>
          </Link>

          <nav className="flex items-center gap-8">
            <Link
              to="/upload"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors relative group"
            >
              Upload
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-primary group-hover:w-full transition-all duration-300"></span>
            </Link>
            <Link
              to="/search"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors relative group"
            >
              Search
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-primary group-hover:w-full transition-all duration-300"></span>
            </Link>
            <Link
              to="/documents"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors relative group"
            >
              Documents
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-primary group-hover:w-full transition-all duration-300"></span>
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
};
