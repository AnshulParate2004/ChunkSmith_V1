import { useState, useEffect } from 'react';
import { Search, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiService, SearchQuery, Project } from '@/services/api';
import { toast } from 'sonner';

const SearchPage = () => {
  const [query, setQuery] = useState('');
  const [projectId, setProjectId] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [resultsPerPage, setResultsPerPage] = useState(5);
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setIsLoadingProjects(true);
      const response = await apiService.listProjects();
      setProjects(response.projects || []);
      // No auto-selection - user must choose project manually
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setIsLoadingProjects(false);
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) {
      toast.error('Please enter a search query');
      return;
    }

    if (!projectId) {
      toast.error('Please select a project');
      return;
    }

    setIsSearching(true);
    try {
      const searchQuery: SearchQuery = {
        query: query.trim(),
        project_id: projectId,
        k: resultsPerPage,
      };

      if (documentId.trim()) {
        searchQuery.document_id = documentId.trim();
      }

      const response = await apiService.search(searchQuery);
      setResults(response.results || []);
      toast.success(`Found ${response.results?.length || 0} results`);
    } catch (error: any) {
      toast.error(error.message || 'Search failed');
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="container mx-auto px-6 py-8 max-w-6xl">
      <div className="space-y-8 animate-fade-in">
        <div className="text-center space-y-3 mb-12">
          <h2 className="text-5xl font-bold text-foreground">Search Documents</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Query your processed documents using semantic search
          </p>
        </div>

        <div className="glass-card p-6 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-select">Project</Label>
              <Select value={projectId} onValueChange={setProjectId} disabled={isLoadingProjects}>
                <SelectTrigger>
                  <SelectValue placeholder={isLoadingProjects ? "Loading projects..." : "Select a project"} />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.project_id} value={project.project_id}>
                      {project.project_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="search-query">Search Query</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="search-query"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Enter your search query..."
                  className="pl-10"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="document-id">Document ID (Optional)</Label>
                <Input
                  id="document-id"
                  value={documentId}
                  onChange={(e) => setDocumentId(e.target.value)}
                  placeholder="Filter by document ID"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="results-per-page">Results Per Page</Label>
                <Input
                  id="results-per-page"
                  type="number"
                  min="1"
                  max="50"
                  value={resultsPerPage}
                  onChange={(e) => setResultsPerPage(parseInt(e.target.value) || 5)}
                />
              </div>
            </div>
          </div>

          <Button onClick={handleSearch} disabled={isSearching || !projectId} className="w-full">
            {isSearching ? 'Searching...' : 'Search'}
          </Button>
        </div>

        {results.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold">Search Results ({results.length})</h3>
            {results.map((result, index) => (
              <div key={index} className="glass-card p-6 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-white font-bold">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium">Chunk {result.metadata?.chunk_index}</p>
                      <p className="text-sm text-muted-foreground">
                        Document: {result.metadata?.document_id}
                      </p>
                    </div>
                  </div>
                  {result.score && (
                    <span className="text-sm font-medium text-primary">
                      Score: {result.score.toFixed(3)}
                    </span>
                  )}
                </div>

                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm leading-relaxed">
                    {result.content?.substring(0, 500)}
                    {result.content?.length > 500 && '...'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {result.metadata?.page_numbers && (
                    <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium">
                      Pages: {result.metadata.page_numbers.join(', ')}
                    </span>
                  )}
                  {result.metadata?.content_types && (
                    <span className="px-3 py-1 bg-secondary/10 text-secondary rounded-full text-xs font-medium">
                      Types: {result.metadata.content_types.join(', ')}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {results.length === 0 && query && !isSearching && (
          <div className="text-center py-12">
            <Filter className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No results found. Try a different query.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchPage;
