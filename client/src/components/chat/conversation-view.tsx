import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, ArrowLeft, MoreVertical, Shield, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ConversationWithParticipants, MessageWithSender, UserPublic } from "@shared/schema";
import { format, isToday, isYesterday } from "date-fns";
import { apiRequest } from "@/lib/queryClient";

interface ConversationViewProps {
  conversationId: string;
  currentUser: UserPublic;
  onBack: () => void;
  onNewMessage?: (message: MessageWithSender) => void;
}

export function ConversationView({
  conversationId,
  currentUser,
  onBack,
}: ConversationViewProps) {
  const [messageInput, setMessageInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: conversation } = useQuery<ConversationWithParticipants>({
    queryKey: ["/api/conversations", conversationId],
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<MessageWithSender[]>({
    queryKey: ["/api/conversations", conversationId, "messages"],
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      return await apiRequest("POST", `/api/conversations/${conversationId}/messages`, {
        content,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
  });

  const otherParticipant = conversation?.participants.find((p) => p.id !== currentUser.id);
  const name = otherParticipant?.displayName || otherParticipant?.username || "Unknown";

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!messageInput.trim()) return;
    
    const content = messageInput.trim();
    setMessageInput("");
    
    try {
      await sendMessageMutation.mutateAsync(content);
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatMessageDate = (date: Date) => {
    if (isToday(date)) {
      return format(date, "h:mm a");
    } else if (isYesterday(date)) {
      return `Yesterday ${format(date, "h:mm a")}`;
    }
    return format(date, "MMM d, h:mm a");
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const groupMessagesByDate = (messages: MessageWithSender[]) => {
    const groups: { date: string; messages: MessageWithSender[] }[] = [];
    let currentDate = "";

    messages.forEach((message) => {
      const messageDate = new Date(message.createdAt);
      let dateLabel: string;

      if (isToday(messageDate)) {
        dateLabel = "Today";
      } else if (isYesterday(messageDate)) {
        dateLabel = "Yesterday";
      } else {
        dateLabel = format(messageDate, "MMMM d, yyyy");
      }

      if (dateLabel !== currentDate) {
        currentDate = dateLabel;
        groups.push({ date: dateLabel, messages: [] });
      }

      groups[groups.length - 1].messages.push(message);
    });

    return groups;
  };

  const messageGroups = groupMessagesByDate(messages);

  return (
    <div className="flex flex-col h-full bg-background">
      <header className="flex items-center gap-3 px-4 py-3 border-b bg-card">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="lg:hidden"
          data-testid="button-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>

        {otherParticipant && (
          <>
            <div className="relative">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {getInitials(name)}
                </AvatarFallback>
              </Avatar>
              {otherParticipant.isOnline && (
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-status-online rounded-full border-2 border-card" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="font-medium truncate">{name}</h2>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {otherParticipant.isOnline ? (
                  <span className="text-status-online">Online</span>
                ) : (
                  <span>
                    Last seen{" "}
                    {otherParticipant.lastSeen
                      ? formatMessageDate(new Date(otherParticipant.lastSeen))
                      : "recently"}
                  </span>
                )}
              </div>
            </div>
          </>
        )}

        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Lock className="h-3 w-3" />
          <span className="hidden sm:inline">Encrypted</span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" data-testid="button-conversation-menu">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>View profile</DropdownMenuItem>
            <DropdownMenuItem>Clear chat</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">Block user</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <ScrollArea className="flex-1 p-4">
        {messagesLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[65%] rounded-lg p-3 animate-pulse ${
                  i % 2 === 0 ? "bg-primary/20" : "bg-card"
                }`}>
                  <div className="h-4 bg-muted rounded w-32" />
                </div>
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Shield className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="font-medium mb-2">End-to-end encrypted</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              Messages in this chat are secured with end-to-end encryption. Only you and {name} can read them.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messageGroups.map((group) => (
              <div key={group.date}>
                <div className="flex justify-center mb-4">
                  <span className="px-3 py-1 text-xs bg-muted rounded-full text-muted-foreground">
                    {group.date}
                  </span>
                </div>
                <div className="space-y-2">
                  {group.messages.map((message) => {
                    const isSent = message.senderId === currentUser.id;
                    return (
                      <div
                        key={message.id}
                        className={`flex ${isSent ? "justify-end" : "justify-start"}`}
                        data-testid={`message-${message.id}`}
                      >
                        <div
                          className={`max-w-[65%] rounded-lg px-3 py-2 ${
                            isSent
                              ? "bg-[#E7FCD4] dark:bg-primary/30 text-foreground"
                              : "bg-card text-card-foreground"
                          }`}
                        >
                          <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap">
                            {message.encryptedContent}
                          </p>
                          <div className="flex items-center justify-end gap-1 mt-1">
                            <span className="text-[11px] text-muted-foreground">
                              {format(new Date(message.createdAt), "h:mm a")}
                            </span>
                            {isSent && (
                              <span className="text-primary text-xs">
                                {message.status === "read" ? "✓✓" : "✓"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      <footer className="p-3 border-t bg-card">
        <div className="flex items-center gap-2">
          <Input
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message"
            className="flex-1"
            data-testid="input-message"
          />
          <Button
            onClick={handleSendMessage}
            disabled={!messageInput.trim() || sendMessageMutation.isPending}
            size="icon"
            data-testid="button-send-message"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </footer>
    </div>
  );
}
