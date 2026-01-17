import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { UserPublic } from "@shared/schema";
import { format } from "date-fns";

interface UserProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserPublic | null;
}

export function UserProfileDialog({ open, onOpenChange, user }: UserProfileDialogProps) {
  const { t } = useTranslation();

  if (!user) return null;

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const displayName = user.displayName || user.username;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("profile.title")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          <Avatar className="h-24 w-24">
            <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
              {getInitials(displayName)}
            </AvatarFallback>
          </Avatar>

          <div className="text-center">
            <h3 className="text-xl font-medium">{displayName}</h3>
            <p className="text-sm text-muted-foreground">@{user.username}</p>
          </div>

          <div className="flex items-center gap-2">
            {user.isOnline ? (
              <Badge variant="secondary" className="bg-status-online/20 text-status-online">
                {t("status.online")}
              </Badge>
            ) : (
              <Badge variant="secondary">
                {t("status.offline")}
              </Badge>
            )}
          </div>

          {!user.isOnline && user.lastSeen && (
            <p className="text-sm text-muted-foreground">
              {t("status.lastSeen")} {format(new Date(user.lastSeen), "PPp")}
            </p>
          )}

          {user.isAnonymous && (
            <Badge variant="outline">
              {t("profile.anonymous")}
            </Badge>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
