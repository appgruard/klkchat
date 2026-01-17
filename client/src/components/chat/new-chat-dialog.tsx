import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Search, MessageCircle, UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { UserPublic } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

interface NewChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUser: UserPublic;
  onChatCreated: (conversationId: string) => void;
}

export function NewChatDialog({
  open,
  onOpenChange,
  currentUser,
  onChatCreated,
}: NewChatDialogProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const queryClient = useQueryClient();

  const { data: users = [], isLoading } = useQuery<UserPublic[]>({
    queryKey: ["/api/users", "search", searchQuery],
    enabled: searchQuery.length >= 2,
  });

  const createConversationMutation = useMutation({
    mutationFn: async (participantId: string) => {
      const response = await apiRequest("POST", "/api/conversations", {
        participantId,
      });
      return await response.json();
    },
    onSuccess: (data: { id: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      onChatCreated(data.id);
      onOpenChange(false);
      setSearchQuery("");
    },
  });

  const filteredUsers = users.filter((user) => user.id !== currentUser.id);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleSelectUser = async (userId: string) => {
    try {
      await createConversationMutation.mutateAsync(userId);
    } catch (error) {
      console.error("Failed to create conversation:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            {t("chat.newChat")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("dialog.searchByUsername")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-user"
            />
          </div>

          <ScrollArea className="h-[300px]">
            {searchQuery.length < 2 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <UserPlus className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground">
                  {t("dialog.typeToSearch")}
                </p>
              </div>
            ) : isLoading ? (
              <div className="space-y-3 p-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 animate-pulse">
                    <div className="w-10 h-10 rounded-full bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded w-3/4" />
                      <div className="h-3 bg-muted rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <p className="text-sm text-muted-foreground">
                  {t("dialog.noUsersFound", { query: searchQuery })}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredUsers.map((user) => {
                  const name = user.displayName || user.username;
                  return (
                    <Button
                      key={user.id}
                      variant="ghost"
                      className="w-full justify-start gap-3 h-auto py-3"
                      onClick={() => handleSelectUser(user.id)}
                      disabled={createConversationMutation.isPending}
                      data-testid={`user-item-${user.id}`}
                    >
                      <div className="relative">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-primary text-primary-foreground">
                            {getInitials(name)}
                          </AvatarFallback>
                        </Avatar>
                        {user.isOnline && (
                          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-status-online rounded-full border-2 border-background" />
                        )}
                      </div>
                      <div className="flex-1 text-left">
                        <p className="font-medium">{name}</p>
                        <p className="text-sm text-muted-foreground">@{user.username}</p>
                      </div>
                    </Button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
