import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Send, ArrowLeft, MoreVertical, Shield, Lock, Paperclip, File, Image as ImageIcon, Video, Download, Mic, Square, Play, Pause } from "lucide-react";
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
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: conversation } = useQuery<ConversationWithParticipants>({
    queryKey: ["/api/conversations", conversationId],
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<MessageWithSender[]>({
    queryKey: ["/api/conversations", conversationId, "messages"],
  });

  const otherParticipant = conversation?.participants.find(p => p.id !== currentUser.id);
  const name = otherParticipant?.displayName || otherParticipant?.username || t("chat.anonymousUser");

  const getInitials = (n: string) => {
    return n.split(" ").map(p => p[0]).join("").toUpperCase().substring(0, 2);
  };

  const formatMessageDate = (date: Date) => {
    if (isToday(date)) return format(date, "h:mm a");
    if (isYesterday(date)) return t("common.yesterday");
    return format(date, "MMM d");
  };

  const messageGroups = messages.reduce((groups: any[], message: MessageWithSender) => {
    const date = format(new Date(message.createdAt), "MMMM d, yyyy");
    const group = groups.find(g => g.date === date);
    if (group) {
      group.messages.push(message);
    } else {
      groups.push({ date, messages: [message] });
    }
    return groups;
  }, []);

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

  const handleFileUpload = async (file: File | Blob, originalName?: string) => {
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file, originalName || (file as File).name);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Upload failed");
      const fileData = await response.json();

      let fileType: string = "document";
      const mimeType = (file as File).type || file.type;
      if (mimeType.startsWith("image/")) fileType = "image";
      else if (mimeType.startsWith("video/")) fileType = "video";
      else if (mimeType.startsWith("audio/")) fileType = "audio";

      await sendMessageMutation.mutateAsync({
        content: fileType === "audio" ? t("chat.sentAudio") : t("chat.sentFile", { name: originalName || (file as File).name }),
        file: {
          fileUrl: fileData.url,
          fileName: originalName || fileData.name,
          fileType: fileType,
          fileSize: fileData.size.toString(),
          duration: fileType === "audio" ? recordingDuration : undefined,
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

  const handleSendMessage = () => {
    if (!messageInput.trim()) return;
    sendMessageMutation.mutate({ content: messageInput });
    setMessageInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        handleFileUpload(audioBlob, `audio-${Date.now()}.webm`);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => {
          if (prev >= 299) { // 5 minutes limit
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.error("Failed to start recording:", err);
      toast({
        title: t("error.title"),
        description: t("error.micAccess"),
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    }
  };

  const renderFileContent = (message: MessageWithSender) => {
    if (!message.fileUrl) return null;

    if (message.fileType === "image") {
      return (
        <div className="mt-2 relative rounded-lg overflow-hidden border border-muted/30 bg-background/50 shadow-sm group">
          <img 
            src={message.fileUrl} 
            alt={message.fileName || "Image"} 
            className="max-w-full h-auto cursor-pointer transition-transform duration-200" 
            onClick={() => window.open(message.fileUrl!, '_blank')} 
          />
          <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <Button
              variant="secondary"
              size="icon"
              className="h-8 w-8 rounded-full bg-black/50 text-white border-0 hover:bg-black/70 backdrop-blur-sm shadow-lg"
              onClick={(e) => {
                e.stopPropagation();
                const link = document.createElement('a');
                link.href = message.fileUrl!;
                link.download = message.fileName || 'image.png';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      );
    }

    if (message.fileType === "video") {
      return (
        <div className="mt-2 rounded-lg overflow-hidden border border-muted/50 bg-background/50 shadow-sm">
          <video src={message.fileUrl} controls className="max-w-full h-auto" />
        </div>
      );
    }

    if (message.fileType === "audio") {
      const isVoiceMessage = message.fileName?.startsWith("audio-");
      return (
        <div className={`mt-1 flex items-center gap-2 p-2 rounded-2xl border border-muted/30 shadow-sm min-w-[260px] ${isVoiceMessage ? "bg-primary/5" : "bg-card"}`}>
          <div className={`p-2 rounded-full flex-shrink-0 ${isVoiceMessage ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
            <Mic className="h-4 w-4" />
          </div>
          <div className="flex-1 flex flex-col gap-0.5 min-w-0">
            {isVoiceMessage ? null : (
              <p className="text-[11px] font-medium truncate px-1">
                {message.fileName}
              </p>
            )}
            <audio src={message.fileUrl} controls className="w-full h-7 custom-audio-player opacity-90 hover:opacity-100 transition-opacity" />
          </div>
          {message.duration && (
            <span className="text-[10px] text-muted-foreground font-mono pr-1">
              {formatDuration(message.duration)}
            </span>
          )}
          <style dangerouslySetInnerHTML={{ __html: `
            .custom-audio-player {
              filter: grayscale(1) brightness(1.5) contrast(1.2);
            }
            .dark .custom-audio-player {
              filter: invert(1) grayscale(1) brightness(1.5);
            }
            .custom-audio-player::-webkit-media-controls-enclosure {
              background-color: transparent;
            }
            .custom-audio-player::-webkit-media-controls-panel {
              padding: 0;
            }
            .custom-audio-player::-webkit-media-controls-current-time-display,
            .custom-audio-player::-webkit-media-controls-time-remaining-display {
              display: none;
            }
          `}} />
        </div>
      );
    }

    return (
      <div className="mt-2 flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-muted/50 shadow-sm group hover:border-primary/30 transition-colors">
        <div className="p-2.5 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
          <File className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{message.fileName}</p>
          <p className="text-[10px] text-muted-foreground uppercase">
            {message.fileSize ? `${(parseInt(message.fileSize) / 1024).toFixed(1)} KB` : ''} • {message.fileType}
          </p>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 rounded-full hover:bg-primary/10 hover:text-primary"
          onClick={() => {
            const link = document.createElement('a');
            link.href = message.fileUrl!;
            link.download = message.fileName || 'file';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }}
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>
    );
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const clearChatMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", `/api/conversations/${conversationId}/messages`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId, "messages"] });
      setClearChatOpen(false);
      toast({ title: t("chat.chatCleared") });
    },
  });

  const blockUserMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/users/${otherParticipant?.id}/block`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setBlockUserOpen(false);
      onBack();
      toast({ title: t("chat.userBlocked") });
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
                  {group.messages.map((message: MessageWithSender) => {
                    const isSent = message.senderId === currentUser.id;
                    return (
                      <div
                        key={message.id}
                        className={`flex ${isSent ? "justify-end" : "justify-start"}`}
                        data-testid={`message-${message.id}`}
                      >
                        <div
                          className={`max-w-[65%] rounded-lg overflow-hidden ${
                            isSent
                              ? "bg-muted text-foreground"
                              : "bg-card text-card-foreground"
                          } ${message.fileUrl ? "p-1" : "px-3 py-2"}`}
                        >
                          {!message.fileUrl && (
                            <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap">
                              {message.encryptedContent}
                            </p>
                          )}
                          {renderFileContent(message)}
                          <div className={`flex items-center justify-end gap-1 mt-1 ${message.fileUrl ? "px-2 pb-1" : ""}`}>
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
          {isRecording ? (
            <div className="flex-1 flex items-center gap-3 px-3 py-2 bg-primary/10 rounded-full text-primary animate-pulse">
              <Mic className="h-4 w-4" />
              <span className="text-sm font-medium">{formatDuration(recordingDuration)}</span>
              <div className="flex-1 h-1 bg-primary/20 rounded-full overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${(recordingDuration / 300) * 100}%` }} />
              </div>
              <Button variant="ghost" size="icon" onClick={stopRecording} className="h-8 w-8 text-destructive">
                <Square className="h-4 w-4 fill-current" />
              </Button>
            </div>
          ) : (
            <>
              <input
                type="file"
                className="hidden"
                ref={fileInputRef}
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
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
              {messageInput.trim() ? (
                <Button
                  onClick={handleSendMessage}
                  disabled={sendMessageMutation.isPending}
                  size="icon"
                  data-testid="button-send-message"
                >
                  <Send className="h-5 w-5" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={startRecording}
                  disabled={isUploading}
                  data-testid="button-record-audio"
                >
                  <Mic className="h-5 w-5" />
                </Button>
              )}
            </>
          )}
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
