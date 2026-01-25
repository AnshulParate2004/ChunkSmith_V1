import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MessageSquare, Zap, Search, ArrowRight, FileText, Share2, Layers, Cpu } from "lucide-react";
import { DashboardDemo } from "@/components/Landing/DashboardDemo";
import { HowItWorks } from "@/components/Landing/HowItWorks";

export default function LandingPage() {
    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1,
                delayChildren: 0.2
            }
        }
    };

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: { y: 0, opacity: 1, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } }
    };

    return (
        // Reverted to Dark Theme: bg-background (hsl(220, 15%, 12%)) text-foreground
        <div className="min-h-screen bg-background text-foreground font-sans overflow-hidden">

            {/* Background Gradients - Reverted to Space/Dark theme */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-primary/10 rounded-full blur-[100px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px]" />
                <div className="absolute top-[40%] left-[50%] transform -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-purple-500/5 rounded-full blur-[150px]" />
            </div>

            <div className="relative z-10">
                {/* Navigation */}
                <nav className="flex items-center justify-between px-6 py-6 max-w-7xl mx-auto">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-primary/10 rounded-lg">
                            <Layers className="w-6 h-6 text-primary" />
                        </div>
                        <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-blue-500">
                            ChunkSmith
                        </span>
                    </div>
                    <div className="hidden md:flex items-center gap-8">
                        <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Features</a>
                        <a href="#how-it-works" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">How it works</a>
                        <Link to="/dashboard">
                            <Button>Launch App</Button>
                        </Link>
                    </div>
                </nav>

                {/* Hero Section */}
                <div className="container mx-auto px-4 pt-20 pb-32">
                    <motion.div
                        className="text-center max-w-4xl mx-auto"
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                    >
                        <motion.div variants={itemVariants} className="mb-6 flex justify-center">
                            <span className="px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium border border-primary/20">
                                New: Advanced Vector Search
                            </span>
                        </motion.div>

                        <motion.h1 variants={itemVariants} className="text-5xl md:text-7xl font-bold tracking-tight mb-8">
                            Chat with your <br />
                            <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary via-blue-500 to-purple-500">
                                Documentation
                            </span>
                        </motion.h1>

                        <motion.p variants={itemVariants} className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed">
                            Transform your static PDFs into interactive knowledge bases.
                            Upload, process, and instantly find answers using AI-powered semantic search.
                        </motion.p>

                        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Link to="/dashboard">
                                <Button size="lg" className="h-12 px-8 text-lg rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-shadow">
                                    Get Started Free
                                    <ArrowRight className="w-5 h-5 ml-2" />
                                </Button>
                            </Link>
                            <Button size="lg" variant="outline" className="h-12 px-8 text-lg rounded-xl backdrop-blur-sm bg-background/50">
                                View Demo
                            </Button>
                        </motion.div>

                        {/* Dashboard Preview Image */}
                        <motion.div
                            variants={itemVariants}
                            className="mt-20 relative mx-auto max-w-5xl rounded-xl border border-border/50 shadow-2xl overflow-hidden bg-card/50 backdrop-blur"
                        >
                            <div className="aspect-[16/9] w-full bg-gradient-to-br from-card to-background flex items-center justify-center border-b border-border/50">
                                <DashboardDemo />
                            </div>
                        </motion.div>
                    </motion.div>
                </div>

                {/* How It Works Section */}
                <HowItWorks />

                {/* Features Grid */}
                <div id="features" className="py-24 bg-card/30 backdrop-blur-sm">
                    <div className="container mx-auto px-4">
                        <div className="text-center mb-16">
                            <h2 className="text-3xl font-bold mb-4">Why use ChunkSmith?</h2>
                            <p className="text-muted-foreground max-w-2xl mx-auto">
                                Built for power users who need granular control over their RAG pipeline.
                            </p>
                        </div>

                        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                            {[
                                {
                                    icon: <Zap className="w-6 h-6 text-yellow-500" />,
                                    title: "Instant Processing",
                                    description: "Upload PDFs and get them chunked, embedded, and ready for search in seconds."
                                },
                                {
                                    icon: <MessageSquare className="w-6 h-6 text-blue-500" />,
                                    title: "Context-Aware Chat",
                                    description: "Ask questions and get precise answers backed by citations from your documents."
                                },
                                {
                                    icon: <Search className="w-6 h-6 text-purple-500" />,
                                    title: "Semantic Search",
                                    description: "Go beyond keywords. Find exactly what you're looking for based on meaning and context."
                                },
                                {
                                    icon: <FileText className="w-6 h-6 text-green-500" />,
                                    title: "Smart Extraction",
                                    description: "Automatically extracts tables, images, and text while preserving document structure."
                                },
                                {
                                    icon: <Layers className="w-6 h-6 text-pink-500" />,
                                    title: "Multi-Project Management",
                                    description: "Organize your documents into separate projects to keep distinct contexts isolated."
                                },
                                {
                                    icon: <Share2 className="w-6 h-6 text-orange-500" />,
                                    title: "Export & Share",
                                    description: "Export your processed chunks and embeddings or share your knowledge base."
                                }
                            ].map((feature, idx) => (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: idx * 0.1 }}
                                    className="p-6 rounded-2xl bg-card border border-border/50 hover:border-primary/50 transition-all hover:shadow-lg hover:-translate-y-1 group"
                                >
                                    <div className="w-12 h-12 rounded-lg bg-background border border-border flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                        {feature.icon}
                                    </div>
                                    <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                                    <p className="text-muted-foreground leading-relaxed">
                                        {feature.description}
                                    </p>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* CTA Section */}
                <div className="py-24 relative overflow-hidden">
                    <div className="absolute inset-0 bg-primary/5" />
                    <div className="container mx-auto px-4 relative">
                        <div className="max-w-3xl mx-auto text-center p-12 rounded-3xl bg-background/50 backdrop-blur-md border border-primary/20 shadow-2xl">
                            <h2 className="text-3xl md:text-4xl font-bold mb-6">Ready to unlock your documents?</h2>
                            <p className="text-lg text-muted-foreground mb-8">
                                Join thousands of users who are saving hours every week with ChunkSmith.
                            </p>
                            <Link to="/dashboard">
                                <Button size="lg" className="h-14 px-8 text-lg rounded-full shadow-xl shadow-primary/20">
                                    Start Processing Now
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <footer className="py-12 border-t border-border/50 bg-card/30">
                    <div className="container mx-auto px-4 text-center text-muted-foreground">
                        <div className="flex items-center justify-center gap-2 mb-4">
                            <Layers className="w-5 h-5" />
                            <span className="font-bold text-foreground">ChunkSmith</span>
                        </div>
                        <p>&copy; {new Date().getFullYear()} ChunkSmith. All rights reserved.</p>
                    </div>
                </footer>
            </div>
        </div>
    );
}
