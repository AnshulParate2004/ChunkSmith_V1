import { useState, useEffect } from "react";
import { X, Languages, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

interface HelpOverlayProps {
  onClose: () => void;
}

interface LanguagesResponse {
  success: boolean;
  count: number;
  languages: Record<string, string>;
}

export const HelpOverlay = ({ onClose }: HelpOverlayProps) => {
  const [languages, setLanguages] = useState<Record<string, string> | null>(null);
  const [languagesError, setLanguagesError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("http://localhost:8000/api/languages")
      .then((res) => res.json())
      .then((data: LanguagesResponse) => {
        if (data.success) {
          setLanguages(data.languages);
        } else {
          setLanguagesError(true);
        }
      })
      .catch(() => setLanguagesError(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-3xl max-h-[90vh] bg-card border-border shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-2xl font-bold text-foreground">Help & Information</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <Tabs defaultValue="languages" className="w-full">
          <TabsList className="w-full justify-start border-b rounded-none h-auto p-0">
            <TabsTrigger
              value="languages"
              className="flex items-center gap-2 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
            >
              <Languages className="h-4 w-4" />
              Supported Languages
            </TabsTrigger>
            <TabsTrigger
              value="how-it-works"
              className="flex items-center gap-2 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
            >
              <BookOpen className="h-4 w-4" />
              How It Works
            </TabsTrigger>
          </TabsList>

          <TabsContent value="languages" className="p-6">
            <div className="mb-4">
              <p className="text-sm text-muted-foreground text-center">
                We support <span className="font-bold text-primary">{languages ? Object.keys(languages).length : '92'}</span> languages for OCR processing
              </p>
            </div>
            
            <ScrollArea className="h-[60vh]">
              {loading && (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-muted-foreground">Loading languages...</p>
                </div>
              )}
              
              {languagesError && (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                    <X className="h-8 w-8 text-destructive" />
                  </div>
                  <p className="text-destructive text-center">
                    Languages could not be loaded. Please try again.
                  </p>
                </div>
              )}
              
              {languages && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pb-4">
                  {Object.entries(languages).map(([name, code], index) => (
                    <div
                      key={code}
                      className="group relative overflow-hidden rounded-lg bg-gradient-to-br from-card to-card/50 border border-border hover:border-primary/50 transition-all duration-300 hover:scale-105 hover:shadow-lg animate-fade-in"
                      style={{ animationDelay: `${index * 0.01}s` }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                      <div className="relative p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center group-hover:from-primary/30 group-hover:to-primary/10 transition-all">
                            <Languages className="h-5 w-5 text-primary" />
                          </div>
                          <span className="font-medium text-foreground capitalize leading-tight">
                            {name.replace(/_/g, " ")}
                          </span>
                        </div>
                        <span className="text-xs font-mono bg-primary/10 text-primary px-3 py-1.5 rounded-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                          {code}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="how-it-works" className="p-6">
            <ScrollArea className="h-[60vh]">
              <div className="space-y-6 text-foreground">
                <p className="text-muted-foreground text-center mb-8">
                  Our advanced PDF processing pipeline uses AI to help you understand and query your documents.
                </p>

                <div className="flex flex-col items-center space-y-6">
                  {/* Step 1 */}
                  <div className="w-full max-w-2xl">
                    <div className="relative">
                      <div className="bg-gradient-to-r from-primary/20 to-primary/10 border-2 border-primary rounded-lg p-6 animate-fade-in">
                        <div className="flex items-start gap-4">
                          <span className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground text-lg font-bold shrink-0">
                            1
                          </span>
                          <div className="flex-1">
                            <h3 className="font-bold text-lg mb-2">Upload PDF</h3>
                            <p className="text-muted-foreground">
                              User uploads any PDF file to the system.
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-center mt-4">
                        <div className="w-0.5 h-8 bg-gradient-to-b from-primary to-primary/50"></div>
                      </div>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="w-full max-w-2xl">
                    <div className="relative">
                      <div className="bg-gradient-to-r from-blue-500/20 to-blue-500/10 border-2 border-blue-500 rounded-lg p-6 animate-fade-in">
                        <div className="flex items-start gap-4">
                          <span className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-500 text-white text-lg font-bold shrink-0">
                            2
                          </span>
                          <div className="flex-1">
                            <h3 className="font-bold text-lg mb-2">OCR + Chunking</h3>
                            <p className="text-muted-foreground mb-2">
                              The PDF is broken into smaller chunks using:
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <span className="px-3 py-1 bg-blue-500/20 rounded-full text-sm">Tesseract OCR</span>
                              <span className="px-3 py-1 bg-blue-500/20 rounded-full text-sm">Poppler PDF tools</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-center mt-4">
                        <div className="w-0.5 h-8 bg-gradient-to-b from-blue-500 to-blue-500/50"></div>
                      </div>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="w-full max-w-2xl">
                    <div className="relative">
                      <div className="bg-gradient-to-r from-purple-500/20 to-purple-500/10 border-2 border-purple-500 rounded-lg p-6 animate-fade-in">
                        <div className="flex items-start gap-4">
                          <span className="flex items-center justify-center w-10 h-10 rounded-full bg-purple-500 text-white text-lg font-bold shrink-0">
                            3
                          </span>
                          <div className="flex-1">
                            <h3 className="font-bold text-lg mb-2">Chunk Format</h3>
                            <p className="text-muted-foreground mb-2">Each chunk contains:</p>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="flex items-center gap-2 text-sm">
                                <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                                <span>Extracted text</span>
                              </div>
                              <div className="flex items-center gap-2 text-sm">
                                <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                                <span>Snapshot image</span>
                              </div>
                              <div className="flex items-center gap-2 text-sm">
                                <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                                <span>Summary</span>
                              </div>
                              <div className="flex items-center gap-2 text-sm">
                                <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                                <span>Metadata</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-center mt-4">
                        <div className="w-0.5 h-8 bg-gradient-to-b from-purple-500 to-purple-500/50"></div>
                      </div>
                    </div>
                  </div>

                  {/* Step 4 */}
                  <div className="w-full max-w-2xl">
                    <div className="relative">
                      <div className="bg-gradient-to-r from-orange-500/20 to-orange-500/10 border-2 border-orange-500 rounded-lg p-6 animate-fade-in">
                        <div className="flex items-start gap-4">
                          <span className="flex items-center justify-center w-10 h-10 rounded-full bg-orange-500 text-white text-lg font-bold shrink-0">
                            4
                          </span>
                          <div className="flex-1">
                            <h3 className="font-bold text-lg mb-2">AI Summarization</h3>
                            <p className="text-muted-foreground">
                              Each chunk image is passed to the AI to generate a high-quality summary.
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-center mt-4">
                        <div className="w-0.5 h-8 bg-gradient-to-b from-orange-500 to-orange-500/50"></div>
                      </div>
                    </div>
                  </div>

                  {/* Step 5 */}
                  <div className="w-full max-w-2xl">
                    <div className="relative">
                      <div className="bg-gradient-to-r from-green-500/20 to-green-500/10 border-2 border-green-500 rounded-lg p-6 animate-fade-in">
                        <div className="flex items-start gap-4">
                          <span className="flex items-center justify-center w-10 h-10 rounded-full bg-green-500 text-white text-lg font-bold shrink-0">
                            5
                          </span>
                          <div className="flex-1">
                            <h3 className="font-bold text-lg mb-2">Vector Embedding</h3>
                            <p className="text-muted-foreground">
                              Summaries + text are converted into vector embeddings for semantic search and question answering.
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-center mt-4">
                        <div className="w-0.5 h-8 bg-gradient-to-b from-green-500 to-green-500/50"></div>
                      </div>
                    </div>
                  </div>

                  {/* Step 6 */}
                  <div className="w-full max-w-2xl">
                    <div className="relative">
                      <div className="bg-gradient-to-r from-cyan-500/20 to-cyan-500/10 border-2 border-cyan-500 rounded-lg p-6 animate-fade-in">
                        <div className="flex items-start gap-4">
                          <span className="flex items-center justify-center w-10 h-10 rounded-full bg-cyan-500 text-white text-lg font-bold shrink-0">
                            6
                          </span>
                          <div className="flex-1">
                            <h3 className="font-bold text-lg mb-2">Ask Questions</h3>
                            <p className="text-muted-foreground">
                              Users can ask any question about the PDF. The AI retrieves the most relevant chunks.
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-center mt-4">
                        <div className="w-0.5 h-8 bg-gradient-to-b from-cyan-500 to-cyan-500/50"></div>
                      </div>
                    </div>
                  </div>

                  {/* Step 7 */}
                  <div className="w-full max-w-2xl">
                    <div className="bg-gradient-to-r from-pink-500/20 to-pink-500/10 border-2 border-pink-500 rounded-lg p-6 animate-fade-in">
                      <div className="flex items-start gap-4">
                        <span className="flex items-center justify-center w-10 h-10 rounded-full bg-pink-500 text-white text-lg font-bold shrink-0">
                          7
                        </span>
                        <div className="flex-1">
                          <h3 className="font-bold text-lg mb-2">Return Image from Original PDF</h3>
                          <p className="text-muted-foreground">
                            The AI answers the question and also returns the exact image snippet from the original PDF for proof and reference.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
};
