import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Plus, MessageCircle, Shield } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ConversationWithParticipants, UserPublic } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import logoPath from "@assets/generated_images/klk!_logo_black_white.png";

interface ChatListProps {
  currentUser: UserPublic;
  selectedConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onNewChat: () => void;
}

export function ChatList({
  currentUser,
  selectedConversationId,
  onSelectConversation,
  onNewChat,
}: ChatListProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: conversations = [], isLoading } = useQuery<ConversationWithParticipants[]>({
    queryKey: ["/api/conversations"],
  });

  const filteredConversations = conversations.filter((conv) => {
    const otherParticipant = conv.participants.find((p) => p.id !== currentUser.id);
    if (!otherParticipant) return false;
    const name = otherParticipant.displayName || otherParticipant.username;
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="flex flex-col h-full bg-sidebar">
      <div className="flex items-center gap-3 p-4 border-b border-sidebar-border">
        <div className="w-10 h-10 rounded-full bg-card flex items-center justify-center overflow-hidden flex-shrink-0 border border-border">
          <img 
            src={logoPath} 
            alt="KLK!" 
            className="w-8 h-8 object-contain"
          />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-sidebar-foreground truncate">KLK!</h1>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Shield className="h-3 w-3" />
            <span>Encrypted Chat</span>
          </div>
        </div>
      </div>

      <div className="p-3 border-b border-sidebar-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search or start new chat"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-sidebar-accent border-0"
            data-testid="input-search-chat"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-12 h-12 rounded-full bg-sidebar-accent" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-sidebar-accent rounded w-3/4" />
                  <div className="h-3 bg-sidebar-accent rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <MessageCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-medium text-sidebar-foreground mb-1">No conversations yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Start a new chat to begin messaging
            </p>
            <Button onClick={onNewChat} className="gap-2" data-testid="button-start-chat-empty">
              <Plus className="h-4 w-4" />
              New Chat
            </Button>
          </div>
        ) : (
          <div className="py-1">
            {filteredConversations.map((conversation) => {
              const otherParticipant = conversation.participants.find(
                (p) => p.id !== currentUser.id
              );
              if (!otherParticipant) return null;

              const name = otherParticipant.displayName || otherParticipant.username;
              const isSelected = selectedConversationId === conversation.id;

              return (
                <button
                  key={conversation.id}
                  onClick={() => onSelectConversation(conversation.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 transition-colors hover-elevate ${
                    isSelected ? "bg-sidebar-accent" : ""
                  }`}
                  data-testid={`chat-item-${conversation.id}`}
                >
                  <div className="relative">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {getInitials(name)}
                      </AvatarFallback>
                    </Avatar>
                    {otherParticipant.isOnline && (
                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-status-online rounded-full border-2 border-sidebar" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sidebar-foreground truncate">
                        {name}
                      </span>
                      {conversation.lastMessage && (
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {formatDistanceToNow(new Date(conversation.lastMessage.createdAt), {
                            addSuffix: false,
                          })}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-muted-foreground truncate">
                        {conversation.lastMessage
                          ? "Encrypted message"
                          : "Start the conversation"}
                      </p>
                      {conversation.unreadCount && conversation.unreadCount > 0 && (
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                          {conversation.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>

      <div className="p-4 border-t border-sidebar-border">
        <Button
          onClick={onNewChat}
          className="w-full gap-2"
          data-testid="button-new-chat"
        >
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </div>
    </div>
  );
}
