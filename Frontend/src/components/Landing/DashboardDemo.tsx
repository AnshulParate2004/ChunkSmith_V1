import { motion } from "framer-motion";
import { Search, Plus, MoreHorizontal, FileText, BarChart3, Users, Settings } from "lucide-react";

export const DashboardDemo = () => {
    // Animation variants
    const containerVariants = {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
    };

    const itemVariants = {
        hidden: { x: -20, opacity: 0 },
        visible: { x: 0, opacity: 1, transition: { duration: 0.5 } }
    };

    const cardVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: { y: 0, opacity: 1, transition: { duration: 0.5 } }
    };

    return (
        <div className="w-full h-full bg-background rounded-xl overflow-hidden flex text-sm border border-border/50 shadow-2xl">
            {/* Sidebar */}
            <motion.div
                className="w-48 bg-card/50 border-r border-border/50 p-4 hidden sm:flex flex-col gap-4"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={containerVariants}
            >
                <motion.div variants={itemVariants} className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 rounded bg-primary/20" />
                    <div className="h-4 w-20 bg-muted rounded" />
                </motion.div>

                {[1, 2, 3, 4].map((i) => (
                    <motion.div key={i} variants={itemVariants} className="flex items-center gap-2 text-muted-foreground p-2 rounded hover:bg-white/5">
                        <div className="w-4 h-4 rounded-full bg-muted/20" />
                        <div className="h-2 w-16 bg-muted/20 rounded" />
                    </motion.div>
                ))}
            </motion.div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col bg-background/50">
                {/* Header */}
                <div className="h-14 border-b border-border/50 flex items-center justify-between px-6">
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Search className="w-4 h-4" />
                        <span className="text-xs">Search documents...</span>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <Plus className="w-4 h-4 text-primary" />
                        </div>
                        <div className="w-8 h-8 rounded-full bg-muted/20" />
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 p-6 overflow-hidden relative">
                    <motion.div
                        className="grid grid-cols-2 gap-4"
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                        variants={{
                            hidden: { opacity: 0 },
                            visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.3 } }
                        }}
                    >
                        {/* Stats Cards */}
                        <motion.div variants={cardVariants} className="col-span-2 sm:col-span-1 p-4 rounded-xl bg-card border border-border/50 space-y-2">
                            <div className="flex items-center gap-2 text-primary">
                                <FileText className="w-4 h-4" />
                                <span className="text-xs font-medium">Total Files</span>
                            </div>
                            <div className="text-2xl font-bold">1,284</div>
                            <div className="h-1 w-full bg-muted/20 rounded-full overflow-hidden">
                                <motion.div
                                    className="h-full bg-primary"
                                    initial={{ width: 0 }}
                                    whileInView={{ width: "70%" }}
                                    transition={{ duration: 1, delay: 0.5 }}
                                />
                            </div>
                        </motion.div>

                        <motion.div variants={cardVariants} className="col-span-2 sm:col-span-1 p-4 rounded-xl bg-card border border-border/50 space-y-2">
                            <div className="flex items-center gap-2 text-blue-400">
                                <BarChart3 className="w-4 h-4" />
                                <span className="text-xs font-medium">Processing</span>
                            </div>
                            <div className="text-2xl font-bold">98.2%</div>
                            <div className="h-1 w-full bg-muted/20 rounded-full overflow-hidden">
                                <motion.div
                                    className="h-full bg-blue-400"
                                    initial={{ width: 0 }}
                                    whileInView={{ width: "95%" }}
                                    transition={{ duration: 1, delay: 0.6 }}
                                />
                            </div>
                        </motion.div>

                        {/* Chat Simulation */}
                        <motion.div variants={cardVariants} className="col-span-2 mt-4 p-4 rounded-xl bg-card border border-border/50 min-h-[200px] relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/5" />
                            <div className="space-y-4">
                                {/* User Message */}
                                <motion.div
                                    initial={{ x: 20, opacity: 0 }}
                                    whileInView={{ x: 0, opacity: 1 }}
                                    transition={{ delay: 1 }}
                                    className="flex justify-end"
                                >
                                    <div className="bg-primary/20 text-primary-foreground px-4 py-2 rounded-2xl rounded-tr-sm text-xs max-w-[80%]">
                                        Analyze the financial report Q3
                                    </div>
                                </motion.div>

                                {/* AI Message (Typing Effect) */}
                                <motion.div
                                    initial={{ x: -20, opacity: 0 }}
                                    whileInView={{ x: 0, opacity: 1 }}
                                    transition={{ delay: 1.5 }}
                                    className="flex justify-start items-start gap-2"
                                >
                                    <div className="w-6 h-6 rounded-full bg-blue-500/20 flex-shrink-0 flex items-center justify-center">
                                        <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
                                    </div>
                                    <div className="space-y-2 max-w-[80%]">
                                        <div className="h-2 w-32 bg-muted/30 rounded animate-pulse" />
                                        <div className="h-2 w-48 bg-muted/20 rounded animate-pulse" />
                                        <div className="h-2 w-40 bg-muted/20 rounded animate-pulse" />
                                    </div>
                                </motion.div>
                            </div>
                        </motion.div>
                    </motion.div>
                </div>
            </div>
        </div>
    );
};
