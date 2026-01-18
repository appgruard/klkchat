import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChatList } from "@/components/chat/chat-list";
import { ConversationView } from "@/components/chat/conversation-view";
import { NewChatDialog } from "@/components/chat/new-chat-dialog";
import { UserMenu } from "@/components/chat/user-menu";
import { ConvertAccountDialog } from "@/components/chat/convert-account-dialog";
import { useAuth } from "@/lib/auth-context";
import { useWebSocket, type WebSocketMessage } from "@/lib/websocket";
import logoPath from "@/assets/logo.png";
import { MessageCircle, Shield } from "lucide-react";
import type { MessageWithSender } from "@shared/schema";

export default function ChatPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [showNewChatDialog, setShowNewChatDialog] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [isMobileConversationOpen, setIsMobileConversationOpen] = useState(false);
  const queryClient = useQueryClient();

  const { lastMessage, isConnected } = useWebSocket(user?.id);

  useEffect(() => {
    if (lastMessage) {
      handleWebSocketMessage(lastMessage);
    }
  }, [lastMessage]);

  const handleWebSocketMessage = (message: WebSocketMessage) => {
    if (message.type === "message") {
      const newMessage = message.payload as MessageWithSender;
      queryClient.invalidateQueries({
        queryKey: ["/api/conversations", newMessage.conversationId, "messages"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    } else if (message.type === "online" || message.type === "offline") {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    }
  };

  const handleSelectConversation = (conversationId: string) => {
    setSelectedConversationId(conversationId);
    setIsMobileConversationOpen(true);
  };

  const handleNewChat = () => {
    setShowNewChatDialog(true);
  };

  const handleChatCreated = (conversationId: string) => {
    setSelectedConversationId(conversationId);
    setIsMobileConversationOpen(true);
    setShowNewChatDialog(false);
  };

  const handleBack = () => {
    setIsMobileConversationOpen(false);
  };

  if (!user) return null;

  return (
    <div className="h-screen flex bg-background">
      <div
        className={`w-full lg:w-[360px] flex-shrink-0 flex flex-col border-r ${
          isMobileConversationOpen ? "hidden lg:flex" : "flex"
        }`}
      >
        <ChatList
          currentUser={user}
          selectedConversationId={selectedConversationId}
          onSelectConversation={handleSelectConversation}
          onNewChat={handleNewChat}
        />
        <UserMenu
          user={user}
          onConvertAnonymous={user.isAnonymous ? () => setShowConvertDialog(true) : undefined}
        />
        
        {!isConnected && (
          <div className="px-4 py-2 bg-destructive/10 text-destructive text-xs text-center">
            {t("chat.reconnecting")}
          </div>
        )}
      </div>

      <div
        className={`flex-1 flex flex-col ${
          !isMobileConversationOpen ? "hidden lg:flex" : "flex"
        }`}
      >
        {selectedConversationId ? (
          <ConversationView
            conversationId={selectedConversationId}
            currentUser={user}
            onBack={handleBack}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-card/50 text-center p-8">
            <div className="w-20 h-20 rounded-full bg-card flex items-center justify-center mb-6 overflow-hidden border border-border">
              <img src={logoPath} alt={t("app.name")} className="w-16 h-16 object-contain" />
            </div>
            <h2 className="text-2xl font-semibold mb-2">{t("app.name")} Chat</h2>
            <p className="text-muted-foreground max-w-md mb-6">
              {t("chat.selectConversation")}
            </p>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Shield className="h-4 w-4" />
              <span>{t("app.e2eEncrypted")}</span>
            </div>
          </div>
        )}
      </div>

      <NewChatDialog
        open={showNewChatDialog}
        onOpenChange={setShowNewChatDialog}
        currentUser={user}
        onChatCreated={handleChatCreated}
      />

      <ConvertAccountDialog
        open={showConvertDialog}
        onOpenChange={setShowConvertDialog}
      />
    </div>
  );
}
