import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Search, Plus, MessageCircle, Shield, Lock, EyeOff, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ConversationWithParticipants, UserPublic } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import logoPath from "@assets/generated_images/klk!_favicon_icon.png";
import { PinDialog } from "./pin-dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinDialogMode, setPinDialogMode] = useState<"set" | "verify" | "remove">("verify");
  const [selectedHiddenConvId, setSelectedHiddenConvId] = useState<string | null>(null);
  const [verifiedConversations, setVerifiedConversations] = useState<Set<string>>(new Set());

  const { data: conversations = [], isLoading } = useQuery<ConversationWithParticipants[]>({
    queryKey: ["/api/conversations"],
  });

  const { data: hiddenConversationIds = [] } = useQuery<string[]>({
    queryKey: ["/api/hidden-conversations"],
  });

  // Auto-close hidden section when all chats are unhidden
  useEffect(() => {
    if (showHidden && hiddenConversationIds.length === 0) {
      setShowHidden(false);
    }
  }, [hiddenConversationIds.length, showHidden]);

  const unhideChatMutation = useMutation({
    mutationFn: async ({ conversationId, pin }: { conversationId: string; pin: string }) => {
      return await apiRequest("POST", `/api/conversations/${conversationId}/unhide`, { pin });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hidden-conversations"] });
      toast({ title: t("chat.chatUnhidden") || "Chat unhidden" });
      setSelectedHiddenConvId(null);
    },
    onError: () => {
      toast({ title: t("chat.invalidPin") || "Invalid PIN", variant: "destructive" });
    },
  });

  const visibleConversations = conversations.filter((conv) => !hiddenConversationIds.includes(conv.id));
  const hiddenConversations = conversations.filter((conv) => hiddenConversationIds.includes(conv.id));

  const filteredConversations = (showHidden ? hiddenConversations : visibleConversations).filter((conv) => {
    const otherParticipant = conv.participants.find((p) => p.id !== currentUser.id);
    if (!otherParticipant) return false;
    const name = otherParticipant.displayName || otherParticipant.username;
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleVerifyConversationPin = async (pin: string): Promise<boolean> => {
    if (!selectedHiddenConvId) return false;
    try {
      await apiRequest("POST", `/api/conversations/${selectedHiddenConvId}/verify-pin`, { pin });
      setVerifiedConversations(prev => new Set(prev).add(selectedHiddenConvId));
      onSelectConversation(selectedHiddenConvId);
      setSelectedHiddenConvId(null);
      return true;
    } catch {
      return false;
    }
  };

  const handleUnhideChat = async (pin: string): Promise<boolean> => {
    if (!selectedHiddenConvId) return false;
    try {
      await unhideChatMutation.mutateAsync({ conversationId: selectedHiddenConvId, pin });
      return true;
    } catch {
      return false;
    }
  };

  const handleSelectConversation = (conversationId: string) => {
    const isHidden = hiddenConversationIds.includes(conversationId);
    const isVerified = verifiedConversations.has(conversationId);
    
    if (isHidden && !isVerified) {
      setSelectedHiddenConvId(conversationId);
      setPinDialogMode("verify");
      setPinDialogOpen(true);
    } else {
      onSelectConversation(conversationId);
    }
  };

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
            alt={t("app.name")} 
            className="w-8 h-8 object-contain"
          />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-sidebar-foreground truncate">{t("app.name")}</h1>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Shield className="h-3 w-3" />
            <span>{t("app.encryptedChat")}</span>
          </div>
        </div>
      </div>

      <div className="p-3 border-b border-sidebar-border">
        {showHidden ? (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowHidden(false)}
              className="flex-shrink-0"
              data-testid="button-back-from-hidden"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2 flex-1">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">{t("chat.showHiddenChats") || "Secret Chats"}</span>
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {hiddenConversationIds.length}
              </span>
            </div>
          </div>
        ) : (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("chat.searchOrStart")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-sidebar-accent border-0"
              data-testid="input-search-chat"
            />
          </div>
        )}
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
            {showHidden ? (
              <>
                <Lock className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="font-medium text-sidebar-foreground mb-1">
                  {t("chat.noHiddenChats") || "No secret chats"}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {t("chat.noHiddenChatsDesc") || "You don't have any hidden chats yet"}
                </p>
                <Button 
                  variant="outline" 
                  onClick={() => setShowHidden(false)} 
                  className="gap-2" 
                  data-testid="button-back-to-chats"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {t("chat.backToChats") || "Back to chats"}
                </Button>
              </>
            ) : (
              <>
                <MessageCircle className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="font-medium text-sidebar-foreground mb-1">{t("chat.noConversations")}</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {t("chat.startNewChat")}
                </p>
                <Button onClick={onNewChat} className="gap-2" data-testid="button-start-chat-empty">
                  <Plus className="h-4 w-4" />
                  {t("chat.newChat")}
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="py-1">
            {filteredConversations.map((conversation) => {
              const otherParticipant = conversation.participants.find(
                (p) => p.id !== currentUser.id
              );
              if (!otherParticipant) return null;

              const actualName = otherParticipant.displayName || otherParticipant.username;
              const isSelected = selectedConversationId === conversation.id;
              const isHiddenChat = showHidden && hiddenConversationIds.includes(conversation.id);
              const isVerifiedHidden = verifiedConversations.has(conversation.id);
              const displayName = isHiddenChat && !isVerifiedHidden ? t("chat.hiddenChat") || "Hidden Chat" : actualName;

              return (
                <button
                  key={conversation.id}
                  onClick={() => handleSelectConversation(conversation.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 transition-colors hover-elevate ${
                    isSelected ? "bg-sidebar-accent" : ""
                  }`}
                  data-testid={`chat-item-${conversation.id}`}
                >
                  <div className="relative">
                    <Avatar className="h-12 w-12">
                      {isHiddenChat && !isVerifiedHidden ? (
                        <AvatarFallback className="bg-muted text-muted-foreground">
                          <Lock className="h-5 w-5" />
                        </AvatarFallback>
                      ) : otherParticipant.avatarUrl ? (
                        <img src={otherParticipant.avatarUrl} alt={displayName} className="h-full w-full object-cover" />
                      ) : (
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {getInitials(actualName)}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    {otherParticipant.isOnline && !isHiddenChat && (
                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-status-online rounded-full border-2 border-sidebar" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sidebar-foreground truncate flex items-center gap-1.5">
                        {isHiddenChat && <Lock className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                        {displayName}
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
                          ? t("chat.encryptedMessage")
                          : t("chat.startConversation")}
                      </p>
                      {showHidden ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedHiddenConvId(conversation.id);
                            setPinDialogMode("remove");
                            setPinDialogOpen(true);
                          }}
                          data-testid={`button-unhide-${conversation.id}`}
                        >
                          {t("chat.unhide") || "Unhide"}
                        </Button>
                      ) : conversation.unreadCount && conversation.unreadCount > 0 ? (
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                          {conversation.unreadCount}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>

      <div className="p-4 border-t border-sidebar-border space-y-2">
        {hiddenConversationIds.length > 0 && (
          <Button
            variant={showHidden ? "secondary" : "outline"}
            onClick={() => setShowHidden(!showHidden)}
            className="w-full gap-2"
            data-testid="button-hidden-chats"
          >
            {showHidden ? <EyeOff className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            {showHidden ? t("chat.hideHiddenChats") || "Hide Secret Chats" : t("chat.showHiddenChats") || "Secret Chats"}
            {!showHidden && <span className="ml-auto text-xs bg-muted px-1.5 py-0.5 rounded">{hiddenConversationIds.length}</span>}
          </Button>
        )}
        <Button
          onClick={onNewChat}
          className="w-full gap-2"
          data-testid="button-new-chat"
        >
          <Plus className="h-4 w-4" />
          {t("chat.newChat")}
        </Button>
      </div>

      <PinDialog
        open={pinDialogOpen}
        onOpenChange={setPinDialogOpen}
        mode={pinDialogMode}
        onSubmit={pinDialogMode === "remove" ? handleUnhideChat : handleVerifyConversationPin}
        isLoading={unhideChatMutation.isPending}
      />
    </div>
  );
}
