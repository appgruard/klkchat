import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Send, ArrowLeft, MoreVertical, Shield, Lock, Paperclip, File, Image as ImageIcon, Video, Download } from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTitle as DialogTitle,
} from "@/components/ui/alert-dialog";
import type { ConversationWithParticipants, MessageWithSender, UserPublic } from "@shared/schema";
import { format, isToday, isYesterday } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { UserProfileDialog } from "./user-profile-dialog";

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
  const { t } = useTranslation();
  const { toast } = useToast();
  const [messageInput, setMessageInput] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [clearChatOpen, setClearChatOpen] = useState(false);
  const [blockUserOpen, setBlockUserOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: conversation } = useQuery<ConversationWithParticipants>({
    queryKey: ["/api/conversations", conversationId],
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<MessageWithSender[]>({
    queryKey: ["/api/conversations", conversationId, "messages"],
  });

  const markAsReadMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/conversations/${conversationId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
  });

  useEffect(() => {
    const unreadMessages = messages.filter(m => m.senderId !== currentUser.id && m.status !== "read");
    if (unreadMessages.length > 0) {
      markAsReadMutation.mutate();
    }
  }, [messages, currentUser.id]);

  const sendMessageMutation = useMutation({
    mutationFn: async (payload: { content: string; file?: any }) => {
      return await apiRequest("POST", `/api/conversations/${conversationId}/messages`, {
        content: payload.content,
        ...payload.file
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Upload failed");
      const fileData = await response.json();

      let fileType: string = "document";
      if (file.type.startsWith("image/")) fileType = "image";
      else if (file.type.startsWith("video/")) fileType = "video";

      await sendMessageMutation.mutateAsync({
        content: t("chat.sentFile", { name: file.name }),
        file: {
          fileUrl: fileData.url,
          fileName: fileData.name,
          fileType: fileType,
          fileSize: fileData.size.toString(),
        },
      });
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: t("error.title"),
        description: t("error.uploadFailed"),
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const clearChatMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", `/api/conversations/${conversationId}/messages`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      toast({
        title: t("chat.chatCleared"),
        description: t("chat.chatClearedDesc"),
      });
      setClearChatOpen(false);
    },
    onError: () => {
      toast({
        title: t("error.title"),
        description: t("error.clearChat"),
        variant: "destructive",
      });
    },
  });

  const otherParticipant = conversation?.participants.find((p) => p.id !== currentUser.id);

  const blockUserMutation = useMutation({
    mutationFn: async () => {
      if (!otherParticipant) throw new Error("No participant");
      return await apiRequest("POST", `/api/users/${otherParticipant.id}/block`);
    },
    onSuccess: () => {
      toast({
        title: t("chat.userBlocked"),
        description: t("chat.userBlockedDesc"),
      });
      setBlockUserOpen(false);
      onBack();
    },
    onError: () => {
      toast({
        title: t("error.title"),
        description: t("error.blockUser"),
        variant: "destructive",
      });
    },
  });
  const name = otherParticipant?.displayName || otherParticipant?.username || t("chat.unknown");

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
      await sendMessageMutation.mutateAsync({ content });
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
      return `${t("date.yesterday")} ${format(date, "h:mm a")}`;
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

  const getDateLabel = (messageDate: Date) => {
    if (isToday(messageDate)) {
      return t("date.today");
    } else if (isYesterday(messageDate)) {
      return t("date.yesterday");
    }
    return format(messageDate, "MMMM d, yyyy");
  };

  const groupMessagesByDate = (messages: MessageWithSender[]) => {
    const groups: { date: string; messages: MessageWithSender[] }[] = [];
    let currentDate = "";

    messages.forEach((message) => {
      const messageDate = new Date(message.createdAt);
      const dateLabel = getDateLabel(messageDate);

      if (dateLabel !== currentDate) {
        currentDate = dateLabel;
        groups.push({ date: dateLabel, messages: [] });
      }

      groups[groups.length - 1].messages.push(message);
    });

    return groups;
  };

  const messageGroups = groupMessagesByDate(messages);

  const renderFileContent = (message: MessageWithSender) => {
    if (!message.fileUrl) return null;

    if (message.fileType === "image") {
      return (
        <div className="mt-2 rounded-md overflow-hidden border border-muted">
          <img src={message.fileUrl} alt={message.fileName || "Image"} className="max-w-full h-auto cursor-pointer hover:opacity-90 transition-opacity" onClick={() => window.open(message.fileUrl!, '_blank')} />
        </div>
      );
    }

    if (message.fileType === "video") {
      return (
        <div className="mt-2 rounded-md overflow-hidden border border-muted">
          <video src={message.fileUrl} controls className="max-w-full h-auto" />
        </div>
      );
    }

    return (
      <div className="mt-2 flex items-center gap-3 p-2 rounded-md bg-background/50 border border-muted">
        <div className="p-2 rounded bg-primary/10 text-primary">
          <File className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{message.fileName}</p>
          <p className="text-[10px] text-muted-foreground">{message.fileSize ? `${(parseInt(message.fileSize) / 1024).toFixed(1)} KB` : ''}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => window.open(message.fileUrl!, '_blank')}>
          <Download className="h-4 w-4" />
        </Button>
      </div>
    );
  };

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
                  <span className="text-status-online">{t("status.online")}</span>
                ) : (
                  <span>
                    {t("status.lastSeen")}{" "}
                    {otherParticipant.lastSeen
                      ? formatMessageDate(new Date(otherParticipant.lastSeen))
                      : t("status.recently")}
                  </span>
                )}
              </div>
            </div>
          </>
        )}

        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Lock className="h-3 w-3" />
          <span className="hidden sm:inline">{t("app.e2eEncrypted")}</span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" data-testid="button-conversation-menu">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem 
              onClick={() => setProfileOpen(true)}
              data-testid="menu-view-profile"
            >
              {t("menu.viewProfile")}
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => setClearChatOpen(true)}
              data-testid="menu-clear-chat"
            >
              {t("menu.clearChat")}
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => setBlockUserOpen(true)}
              className="text-destructive"
              data-testid="menu-block-user"
            >
              {t("menu.blockUser")}
            </DropdownMenuItem>
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
            <h3 className="font-medium mb-2">{t("app.e2eEncrypted")}</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              {t("encryption.e2eMessage", { name })}
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
                              ? "bg-muted text-foreground"
                              : "bg-card text-card-foreground"
                          }`}
                        >
                          <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap">
                            {message.encryptedContent}
                          </p>
                          {renderFileContent(message)}
                          <div className="flex items-center justify-end gap-1 mt-1">
                            <span className="text-[11px] text-muted-foreground">
                              {format(new Date(message.createdAt), "h:mm a")}
                            </span>
                            {isSent && (
                              <span className="text-primary text-xs flex gap-[2px]">
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
          <input
            type="file"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || sendMessageMutation.isPending}
            data-testid="button-attach-file"
          >
            <Paperclip className="h-5 w-5" />
          </Button>
          <Input
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("chat.typeMessage")}
            className="flex-1"
            disabled={isUploading}
            data-testid="input-message"
          />
          <Button
            onClick={handleSendMessage}
            disabled={!messageInput.trim() || sendMessageMutation.isPending || isUploading}
            size="icon"
            data-testid="button-send-message"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </footer>

      <UserProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        user={otherParticipant || null}
      />

      <AlertDialog open={clearChatOpen} onOpenChange={setClearChatOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("chat.clearChatTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("chat.clearChatConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-clear">
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => clearChatMutation.mutate()}
              disabled={clearChatMutation.isPending}
              data-testid="button-confirm-clear"
            >
              {clearChatMutation.isPending ? t("common.loading") : t("menu.clearChat")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={blockUserOpen} onOpenChange={setBlockUserOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("chat.blockUserTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("chat.blockUserConfirm", { name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-block">
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => blockUserMutation.mutate()}
              disabled={blockUserMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-block"
            >
              {blockUserMutation.isPending ? t("common.loading") : t("menu.blockUser")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
