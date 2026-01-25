import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    FileText,
    Scan,
    Layers,
    BrainCircuit,
    Sparkles,
    MessageSquare,
    Image as ImageIcon,
    CheckCircle2,
    ArrowRight,
    Search
} from "lucide-react";
import { cn } from "@/lib/utils";

const steps = [
    {
        id: 1,
        title: "Upload PDF",
        description: "User uploads any PDF file to the system.",
        icon: FileText,
        color: "text-blue-500",
        bg: "bg-blue-500/10"
    },
    {
        id: 2,
        title: "OCR + Chunking",
        description: "The PDF is broken into smaller chunks using Tesseract OCR & Poppler.",
        icon: Scan,
        color: "text-purple-500",
        bg: "bg-purple-500/10"
    },
    {
        id: 3,
        title: "Chunk Format",
        description: "Each chunk contains Text, Snapshot, Summary, and Metadata.",
        icon: Layers,
        color: "text-green-500",
        bg: "bg-green-500/10"
    },
    {
        id: 4,
        title: "AI Summarization",
        description: "Each chunk image is passed to the AI to generate a high-quality summary.",
        icon: BrainCircuit,
        color: "text-amber-500",
        bg: "bg-amber-500/10"
    },
    {
        id: 5,
        title: "Vector Embedding",
        description: "Summaries + text are converted into vector embeddings for semantic search.",
        icon: Sparkles,
        color: "text-pink-500",
        bg: "bg-pink-500/10"
    },
    {
        id: 6,
        title: "Ask Questions",
        description: "Users can ask any question about the PDF. The AI retrieves relevant chunks.",
        icon: MessageSquare,
        color: "text-cyan-500",
        bg: "bg-cyan-500/10"
    },
    {
        id: 7,
        title: "Return Answer + Image",
        description: "The AI answers and returns the exact image snippet for proof.",
        icon: ImageIcon,
        color: "text-emerald-500",
        bg: "bg-emerald-500/10"
    }
];

export const HowItWorks = () => {
    const [currentStep, setCurrentStep] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentStep((prev) => (prev + 1) % steps.length);
        }, 4000);

        return () => clearInterval(interval);
    }, [currentStep]);

    const handleStepClick = (index: number) => {
        setCurrentStep(index);
    };

    return (
        <section id="how-it-works" className="py-24 relative overflow-hidden">
            {/* Background elements */}
            <div className="absolute top-1/2 left-0 w-full h-[500px] bg-primary/5 blur-[100px] -translate-y-1/2 pointer-events-none" />

            <div className="container mx-auto px-4 relative z-10">
                <div className="text-center mb-16 max-w-3xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6"
                    >
                        <ScannerIcon className="w-4 h-4 animate-pulse" />
                        <span>The Pipeline</span>
                    </motion.div>

                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="text-3xl md:text-5xl font-bold mb-6"
                    >
                        How ChunkSmith Works
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                        className="text-lg text-muted-foreground"
                    >
                        A complex 7-step process simplified into milliseconds of processing.
                    </motion.p>
                </div>

                <div className="flex flex-col lg:flex-row gap-12 items-center">
                    {/* Visual Animation Area */}
                    <div className="w-full lg:w-1/2 aspect-square max-h-[500px] relative">
                        <div className="absolute inset-0 bg-card/30 rounded-2xl border border-border/50 backdrop-blur-sm shadow-2xl overflow-hidden flex items-center justify-center">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={currentStep}
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    transition={{ duration: 0.5 }}
                                    className="w-full h-full flex flex-col items-center justify-center p-8"
                                >
                                    <Visuals step={currentStep} />
                                </motion.div>
                            </AnimatePresence>

                            {/* Step Indicator inside Visuals on mobile */}
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 lg:hidden">
                                {steps.map((_, idx) => (
                                    <div
                                        key={idx}
                                        className={cn(
                                            "w-2 h-2 rounded-full transition-all duration-300",
                                            idx === currentStep ? "bg-primary w-6" : "bg-muted-foreground/30"
                                        )}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Logic / Steps List */}
                    <div className="w-full lg:w-1/2 space-y-4">
                        {steps.map((step, index) => {
                            const isActive = index === currentStep;
                            return (
                                <motion.div
                                    key={step.id}
                                    initial={false}
                                    animate={{
                                        backgroundColor: isActive ? "hsl(var(--card))" : "transparent",
                                        scale: isActive ? 1.02 : 1,
                                        borderColor: isActive ? "hsl(var(--border))" : "transparent"
                                    }}
                                    className={cn(
                                        "p-4 rounded-xl border border-transparent cursor-pointer transition-colors relative overflow-hidden group",
                                        isActive ? "shadow-lg" : "hover:bg-card/30"
                                    )}
                                    onClick={() => handleStepClick(index)}
                                >
                                    {isActive && (
                                        <motion.div
                                            layoutId="activeGlow"
                                            className="absolute left-0 top-0 bottom-0 w-1 bg-primary"
                                        />
                                    )}
                                    <div className="flex items-start gap-4">
                                        <div className={cn(
                                            "w-10 h-10 rounded-lg flex items-center justify-center transition-colors flex-shrink-0",
                                            isActive ? step.bg : "bg-muted/10 group-hover:bg-muted/20"
                                        )}>
                                            <step.icon className={cn(
                                                "w-5 h-5",
                                                isActive ? step.color : "text-muted-foreground"
                                            )} />
                                        </div>
                                        <div>
                                            <h3 className={cn(
                                                "font-semibold mb-1",
                                                isActive ? "text-foreground" : "text-muted-foreground"
                                            )}>
                                                {step.title}
                                            </h3>
                                            <p className="text-sm text-muted-foreground leading-relaxed">
                                                {step.description}
                                            </p>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </section>
    );
};

// Subcomponent for the actual animations
const Visuals = ({ step }: { step: number }) => {
    switch (step) {
        case 0: // Upload PDF
            return (
                <div className="relative">
                    <motion.div
                        animate={{ y: [0, -20, 0] }}
                        transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                        className="w-32 h-40 bg-card border-2 border-primary/50 rounded-lg flex items-center justify-center shadow-lg relative z-10"
                    >
                        <FileText className="w-16 h-16 text-primary" />
                        <span className="absolute bottom-3 text-xs font-bold text-primary">PROJECT.PDF</span>
                    </motion.div>
                    <motion.div
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1.5 }}
                        transition={{ duration: 1 }}
                        className="absolute inset-0 bg-primary/20 blur-xl rounded-full"
                    />
                    <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 text-sm text-muted-foreground font-mono">
                        Uploading...
                    </div>
                </div>
            );

        case 1: // OCR + Chunking
            return (
                <div className="relative w-full h-full flex items-center justify-center">
                    <motion.div
                        initial={{ width: 120, height: 150 }}
                        animate={{ width: 140, height: 180, opacity: 0.5 }}
                        className="absolute bg-muted/20 border border-dashed border-muted-foreground rounded-lg"
                    />
                    <div className="grid grid-cols-2 gap-4">
                        {[1, 2, 3, 4].map((i) => (
                            <motion.div
                                key={i}
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ delay: i * 0.1 }}
                                className="w-20 h-24 bg-card border border-border rounded p-2 shadow-sm flex flex-col gap-2"
                            >
                                <div className="w-full h-1/2 bg-muted/30 rounded-sm" />
                                <div className="space-y-1">
                                    <div className="w-full h-1 bg-muted/40 rounded-full" />
                                    <div className="w-4/5 h-1 bg-muted/40 rounded-full" />
                                    <div className="w-3/5 h-1 bg-muted/40 rounded-full" />
                                </div>
                            </motion.div>
                        ))}
                    </div>
                    <motion.div
                        animate={{ top: ["0%", "100%"] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="absolute left-0 right-0 h-1 bg-primary/50 blur-[2px] shadow-[0_0_15px_rgba(var(--primary),0.5)]"
                    />
                </div>
            );

        case 2: // Chunk Format
            return (
                <div className="w-64 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
                    <div className="p-4 border-b border-border bg-muted/10 flex items-center justify-between">
                        <span className="text-xs font-mono text-muted-foreground">ID: #C492A</span>
                        <div className="flex gap-1">
                            <div className="w-2 h-2 rounded-full bg-red-400" />
                            <div className="w-2 h-2 rounded-full bg-yellow-400" />
                            <div className="w-2 h-2 rounded-full bg-green-400" />
                        </div>
                    </div>
                    <div className="p-4 space-y-4">
                        <div className="flex gap-3">
                            <div className="w-16 h-16 bg-blue-500/20 rounded-md flex items-center justify-center flex-shrink-0">
                                <ImageIcon className="w-8 h-8 text-blue-500" />
                            </div>
                            <div className="space-y-2 flex-1">
                                <div className="h-2 w-full bg-muted/30 rounded" />
                                <div className="h-2 w-4/5 bg-muted/30 rounded" />
                            </div>
                        </div>
                        <div className="p-3 bg-muted/10 rounded-lg space-y-2 border border-border/50">
                            <div className="text-[10px] font-bold text-muted-foreground">EXTRACTED TEXT</div>
                            <div className="text-[10px] text-muted-foreground leading-relaxed">
                                Financial results for Q3 show a 24% increase in revenue...
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <div className="px-2 py-1 rounded bg-purple-500/10 text-purple-500 text-[10px] border border-purple-500/20">Metadata</div>
                            <div className="px-2 py-1 rounded bg-green-500/10 text-green-500 text-[10px] border border-green-500/20">Summary</div>
                        </div>
                    </div>
                </div>
            );

        case 3: // AI Summarization
            return (
                <div className="flex items-center gap-8">
                    <motion.div
                        className="w-24 h-32 bg-card border border-border rounded-lg p-2 flex flex-col justify-center items-center gap-2"
                        animate={{ x: [0, 10, 0] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                    >
                        <ImageIcon className="w-8 h-8 text-muted-foreground" />
                        <div className="w-16 h-1 bg-muted/40 rounded" />
                    </motion.div>

                    <div className="relative">
                        <BrainCircuit className="w-16 h-16 text-amber-500" />
                        <motion.div
                            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                            transition={{ repeat: Infinity, duration: 2 }}
                            className="absolute inset-0 bg-amber-500/20 rounded-full blur-xl"
                        />
                    </div>

                    <motion.div
                        className="w-48 p-4 bg-amber-950/30 border border-amber-500/30 rounded-lg backdrop-blur-sm"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <Sparkles className="w-3 h-3 text-amber-500" />
                            <span className="text-xs font-bold text-amber-500">AI SUMMARY</span>
                        </div>
                        <div className="space-y-1">
                            <motion.div
                                className="h-1.5 bg-amber-500/40 rounded w-full"
                                initial={{ width: 0 }}
                                animate={{ width: "100%" }}
                                transition={{ delay: 0.5, duration: 0.5 }}
                            />
                            <motion.div
                                className="h-1.5 bg-amber-500/40 rounded w-11/12"
                                initial={{ width: 0 }}
                                animate={{ width: "90%" }}
                                transition={{ delay: 0.7, duration: 0.5 }}
                            />
                            <motion.div
                                className="h-1.5 bg-amber-500/40 rounded w-4/5"
                                initial={{ width: 0 }}
                                animate={{ width: "80%" }}
                                transition={{ delay: 0.9, duration: 0.5 }}
                            />
                        </div>
                    </motion.div>
                </div>
            );

        case 4: // Vector Embedding
            return (
                <div className="relative w-full h-full flex items-center justify-center">
                    <div className="absolute inset-0 grid grid-cols-6 grid-rows-6 gap-4 opacity-20">
                        {Array.from({ length: 36 }).map((_, i) => (
                            <div key={i} className="w-1 h-1 bg-muted-foreground rounded-full" />
                        ))}
                    </div>
                    <div className="relative z-10 grid place-items-center">
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                            className="w-40 h-40 rounded-full border border-pink-500/30 flex items-center justify-center relative"
                        >
                            <div className="absolute w-full h-full rounded-full border border-pink-500/10 scale-150" />
                            {[0, 60, 120, 180, 240, 300].map((deg) => (
                                <div
                                    key={deg}
                                    style={{ transform: `rotate(${deg}deg) translateY(-80px)` }}
                                    className="absolute w-3 h-3 bg-pink-500 rounded-full shadow-[0_0_10px_rgba(236,72,153,0.5)]"
                                />
                            ))}
                        </motion.div>
                        <div className="absolute font-mono text-xs text-pink-500 bg-pink-500/10 px-2 py-1 rounded border border-pink-500/20">
                            [0.021, -0.932, 0.114, ...]
                        </div>
                    </div>
                </div>
            );

        case 5: // Ask Questions
            return (
                <div className="w-full max-w-sm space-y-4">
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex justify-end"
                    >
                        <div className="bg-primary text-primary-foreground px-4 py-2 rounded-2xl rounded-tr-sm text-sm">
                            How much did revenue grow?
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        className="flex items-center justify-center gap-2 py-4"
                    >
                        <Search className="w-5 h-5 text-cyan-500 animate-spin" />
                        <span className="text-sm text-cyan-500">Searching vectorized chunks...</span>
                    </motion.div>

                    <div className="grid grid-cols-3 gap-2 opacity-50">
                        {[1, 2, 3].map(i => (
                            <motion.div
                                key={i}
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{
                                    scale: i === 2 ? 1.1 : 0.8,
                                    opacity: i === 2 ? 1 : 0.3,
                                    borderColor: i === 2 ? "hsl(var(--primary))" : "transparent"
                                }}
                                className="h-16 bg-card border rounded"
                            />
                        ))}
                    </div>
                </div>
            );

        case 6: // Return Answer + Image
            return (
                <div className="w-full max-w-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-card border border-border rounded-xl overflow-hidden shadow-2xl"
                    >
                        <div className="p-4 bg-emerald-500/5 space-y-3">
                            <div className="flex items-center gap-2 text-emerald-500 mb-2">
                                <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                    <BrainCircuit className="w-3 h-3" />
                                </div>
                                <span className="text-sm font-bold">Answer</span>
                            </div>
                            <p className="text-sm leading-relaxed">
                                According to the Q3 report, revenue grew by <span className="font-bold text-emerald-500 bg-emerald-500/10 px-1 rounded">24%</span> compared to the previous quarter.
                            </p>
                        </div>
                        <div className="p-3 border-t border-border bg-background/50">
                            <div className="text-[10px] uppercase text-muted-foreground font-bold mb-2 flex items-center gap-2">
                                <ImageIcon className="w-3 h-3" />
                                Reference Source
                            </div>
                            <div className="relative rounded-lg overflow-hidden border border-emerald-500/30">
                                <div className="absolute top-2 left-2 w-full h-full bg-yellow-500/10 mix-blend-multiply pointer-events-none" />
                                <div className="bg-white p-3 text-black text-[10px] font-serif leading-tight opacity-90">
                                    <h3>Q3 Financial Outline</h3>
                                    <p>During this period, we observed a significant uptake in market events. Total revenue grew by 24%, driven primarily by...</p>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            );

        default:
            return null;
    }
};

const ScannerIcon = ({ className }: { className?: string }) => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <path d="M7 21a4 4 0 0 1-4-4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16a4 4 0 0 1-4 4h-6Z" />
        <path d="M11 21V7" />
        <path d="m11 11 4-4" />
        <path d="m11 11-4-4" />
    </svg>
)
