import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChatList } from "@/components/chat/chat-list";
import { ConversationView } from "@/components/chat/conversation-view";
import { NewChatDialog } from "@/components/chat/new-chat-dialog";
import { UserMenu } from "@/components/chat/user-menu";
import { ConvertAccountDialog } from "@/components/chat/convert-account-dialog";
import { useAuth } from "@/lib/auth-context";
import { useWebSocket, type WebSocketMessage } from "@/lib/websocket";
import { MessageCircle, Shield } from "lucide-react";
import type { MessageWithSender } from "@shared/schema";

export default function ChatPage() {
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
            Reconnecting...
          </div>
        )}
      </div>

      <div
        className={`flex-1 flex flex-col ${
          !isMobileConversationOpen && !selectedConversationId ? "hidden lg:flex" : "flex"
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
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
              <MessageCircle className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-2xl font-semibold mb-2">Four One Solutions Chat</h2>
            <p className="text-muted-foreground max-w-md mb-6">
              Select a conversation from the sidebar or start a new chat to begin messaging securely.
            </p>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Shield className="h-4 w-4" />
              <span>End-to-end encrypted messaging</span>
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
