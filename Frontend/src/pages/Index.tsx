import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Folder, Clock, FileText, Sparkles, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { HelpButton } from "@/components/Help/HelpButton";
import { HelpOverlay } from "@/components/Help/HelpOverlay";
import { apiService, Project } from "@/services/api";
import { toast } from "sonner";

const Index = () => {
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  // Load projects from API on mount
  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setIsLoading(true);
      const response = await apiService.listProjects();
      setProjects(response.projects || []);
    } catch (error) {
      console.error('Failed to load projects:', error);
      toast.error('Failed to load projects from server');
      // Fallback to localStorage for offline mode
      const savedProjects = localStorage.getItem('projects');
      if (savedProjects) {
        setProjects(JSON.parse(savedProjects));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!projectName.trim()) return;

    setIsCreating(true);
    try {
      const response = await apiService.createProject(projectName.trim());
      const newProject: Project = {
        project_id: response.project_id,
        file_count: 0,
      };
      setProjects(prev => [newProject, ...prev]);
      setProjectName("");
      setIsNewProjectOpen(false);
      toast.success(`Project "${response.project_id}" created successfully`);
    } catch (error) {
      console.error('Failed to create project:', error);
      toast.error('Failed to create project');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="flex h-screen">
        {/* Sidebar */}
        <div className="w-64 border-r border-border/50 bg-card/30 backdrop-blur-sm p-4">
          <div className="mb-8 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold text-primary">ChunkSmith</h1>
          </div>

          <Dialog open={isNewProjectOpen} onOpenChange={setIsNewProjectOpen}>
            <DialogTrigger asChild>
              <Button className="w-full mb-6" variant="default">
                <Plus className="w-4 h-4 mr-2" />
                New Project
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle>Create New Project</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="project-name">Project Name</Label>
                  <Input
                    id="project-name"
                    placeholder="Enter project name"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
                    disabled={isCreating}
                  />
                </div>
                <Button onClick={handleCreateProject} className="w-full" disabled={isCreating}>
                  {isCreating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Project'
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <div className="space-y-1">
            <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground">
              <Folder className="w-4 h-4 mr-2" />
              All Projects
            </Button>
            <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground">
              <Clock className="w-4 h-4 mr-2" />
              Recent
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto">
          <div className="p-8">
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-foreground mb-2">Your Projects</h2>
              <p className="text-muted-foreground">Manage and organize your document processing projects</p>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : projects.length === 0 ? (
              <div className="text-center py-16">
                <Folder className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No projects yet. Create your first project to get started.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map((project) => (
                  <Link
                    key={project.project_id}
                    to={`/project/${project.project_id}`}
                    onClick={() => localStorage.setItem('currentProjectId', project.project_id)}
                  >
                    <Card className="p-6 bg-card/50 backdrop-blur-sm border-border/50 hover:border-primary/50 transition-all duration-300 hover:scale-105 cursor-pointer group">
                      <div className="flex items-start justify-between mb-4">
                        <div className="p-3 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                          <Folder className="w-6 h-6 text-primary" />
                        </div>
                      </div>
                      <h3 className="text-lg font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
                        {project.project_id}
                      </h3>
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <FileText className="w-4 h-4" />
                          <span>{project.file_count || project.pdf_count || 0} files</span>
                        </div>
                        {project.created_at && (
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            <span>{new Date(project.created_at).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <HelpButton onClick={() => setIsHelpOpen(true)} />
      {isHelpOpen && <HelpOverlay onClose={() => setIsHelpOpen(false)} />}
    </div>
  );
};

export default Index;
