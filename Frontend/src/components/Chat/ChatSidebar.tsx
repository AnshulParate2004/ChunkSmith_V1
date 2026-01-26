import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PlusCircle, MessageSquare, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface Conversation {
    id: string;
    title: string;
    created_at: string;
}

interface ChatSidebarProps {
    conversations: Conversation[];
    activeId: string | null;
    onSelect: (id: string) => void;
    onNew: () => void;
    onDelete: (id: string) => void;
    className?: string;
}

export function ChatSidebar({
    conversations,
    activeId,
    onSelect,
    onNew,
    onDelete,
    className,
}: ChatSidebarProps) {
    return (
        <div className={cn("flex flex-col h-full border-r bg-muted/20", className)}>
            <div className="p-4 border-b">
                <Button onClick={onNew} className="w-full justify-start gap-2" variant="default">
                    <PlusCircle className="h-4 w-4" />
                    New Chat
                </Button>
            </div>
            <ScrollArea className="flex-1">
                <div className="p-2 space-y-2">
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
                                activeId === conv.id ? "bg-accent text-accent-foreground" : "transparent"
                            )}
                            onClick={() => onSelect(conv.id)}
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
                                    onDelete(conv.id);
                                }}
                            >
                                <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                        </div>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}
