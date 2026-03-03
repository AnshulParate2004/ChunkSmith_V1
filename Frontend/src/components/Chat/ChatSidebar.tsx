import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PlusCircle, MessageSquare, Trash2, Search, FileText, Compass, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

type SidebarMode = "chats" | "documents";

interface Conversation {
    id: string;
    title: string;
    created_at: string;
}

interface SidebarDocument {
    id: string;
    title: string;
    created_at?: string;
}

interface ChatSidebarProps {
    conversations: Conversation[];
    documents: SidebarDocument[];
    activeConversationId: string | null;
    mode: SidebarMode;
    onModeChange: (mode: SidebarMode) => void;
    onSelectConversation: (id: string) => void;
    onSelectDocument: (id: string) => void;
    onNewChat: () => void;
    onDeleteConversation: (id: string) => void;
    className?: string;
}

export function ChatSidebar({
    conversations,
    documents,
    activeConversationId,
    mode,
    onModeChange,
    onSelectConversation,
    onSelectDocument,
    onNewChat,
    onDeleteConversation,
    className,
}: ChatSidebarProps) {
    const navigate = useNavigate();

    return (
        <div className={cn("flex flex-col h-full border-r bg-muted/20", className)}>
            {/* Top brand row, similar to ChatGPT icon */}
            <div className="px-4 pt-4 pb-2 flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <span className="text-sm font-semibold text-foreground">ChunkSmith</span>
            </div>

            {/* Primary actions */}
            <div className="px-4 pb-3 space-y-2">
                <Button
                    onClick={() => {
                        onModeChange("chats");
                        onNewChat();
                    }}
                    className="w-full justify-start gap-2"
                    variant="default"
                >
                    <PlusCircle className="h-4 w-4" />
                    New chat
                </Button>
                <Button
                    variant="ghost"
                    className="w-full justify-start gap-2 text-sm"
                    onClick={() => navigate("/search")}
                >
                    <Search className="h-4 w-4" />
                    Search chats
                </Button>
                <Button
                    variant="ghost"
                    className="w-full justify-start gap-2 text-sm"
                    onClick={() => onModeChange(mode === "documents" ? "chats" : "documents")}
                >
                    {mode === "documents" ? (
                        <>
                            <MessageSquare className="h-4 w-4" />
                            Chats
                        </>
                    ) : (
                        <>
                            <FileText className="h-4 w-4" />
                            Documents
                        </>
                    )}
                </Button>
                <Button
                    variant="ghost"
                    className="w-full justify-start gap-2 text-sm"
                    onClick={() => navigate("/dashboard")}
                >
                    <Compass className="h-4 w-4" />
                    Explore projects
                </Button>
            </div>
            <ScrollArea className="flex-1">
                <div className="px-4 pt-3 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {mode === "documents" ? "Your documents" : "Your chats"}
                </div>
                <div className="p-2 space-y-2">
                    {mode === "documents" ? (
                        <>
                            {documents.length === 0 && (
                                <div className="text-center text-sm text-muted-foreground p-4">
                                    No documents yet
                                </div>
                            )}
                            {documents.map((doc) => (
                                <div
                                    key={doc.id}
                                    className={cn(
                                        "group flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
                                    )}
                                    onClick={() => onSelectDocument(doc.id)}
                                >
                                    <div className="flex items-center gap-2 truncate">
                                        <FileText className="h-4 w-4" />
                                        <div className="flex flex-col items-start truncate">
                                            <span className="truncate w-32">{doc.title}</span>
                                            {doc.created_at && (
                                                <span className="text-xs text-muted-foreground font-normal">
                                                    {format(new Date(doc.created_at), "MMM d, h:mm a")}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </>
                    ) : (
                        <>
                            {conversations.length === 0 && (
                                <div className="text-center text-sm text-muted-foreground p-4">
                                    No conversations yet
                                </div>
                            )}
                            {conversations.map((conv) => (
                                <div
                                    key={conv.id}
                                    className={cn(
                                        "group flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors",
                                        activeConversationId === conv.id ? "bg-accent text-accent-foreground" : "transparent"
                                    )}
                                    onClick={() => onSelectConversation(conv.id)}
                                >
                                    <div className="flex items-center gap-2 truncate">
                                        <MessageSquare className="h-4 w-4" />
                                        <div className="flex flex-col items-start truncate">
                                            <span className="truncate w-32">{conv.title || "New Chat"}</span>
                                            <span className="text-xs text-muted-foreground font-normal">
                                                {format(new Date(conv.created_at), "MMM d, h:mm a")}
                                            </span>
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDeleteConversation(conv.id);
                                        }}
                                    >
                                        <Trash2 className="h-3 w-3 text-destructive" />
                                    </Button>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
