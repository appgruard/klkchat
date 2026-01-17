import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LogOut, Settings, User, Shield, AlertTriangle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { UserPublic } from "@shared/schema";
import { useAuth } from "@/lib/auth-context";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { ProfileDialog } from "./profile-dialog";
import { SettingsDialog } from "./settings-dialog";
import { SecurityDialog } from "./security-dialog";

interface UserMenuProps {
  user: UserPublic;
  onConvertAnonymous?: () => void;
}

export function UserMenu({ user, onConvertAnonymous }: UserMenuProps) {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const name = user.displayName || user.username;

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="flex items-center gap-2 p-3 border-t border-sidebar-border bg-sidebar">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex items-center gap-3 w-full justify-start h-auto py-2"
            data-testid="button-user-menu"
          >
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-primary text-primary-foreground">
                {getInitials(name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 text-left min-w-0">
              <p className="font-medium text-sidebar-foreground truncate text-sm">{name}</p>
              <p className="text-xs text-muted-foreground truncate">@{user.username}</p>
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium">{name}</p>
              <p className="text-xs text-muted-foreground">@{user.username}</p>
              {user.isAnonymous && (
                <Badge variant="outline" className="w-fit mt-1 text-xs">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {t("menu.anonymous")}
                </Badge>
              )}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          {user.isAnonymous && onConvertAnonymous && (
            <>
              <DropdownMenuItem onClick={onConvertAnonymous} data-testid="button-convert-account">
                <User className="mr-2 h-4 w-4" />
                {t("menu.createAccount")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          
          <DropdownMenuItem onClick={() => setProfileOpen(true)} data-testid="menu-item-profile">
            <User className="mr-2 h-4 w-4" />
            {t("menu.profile")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSettingsOpen(true)} data-testid="menu-item-settings">
            <Settings className="mr-2 h-4 w-4" />
            {t("menu.settings")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSecurityOpen(true)} data-testid="menu-item-security">
            <Shield className="mr-2 h-4 w-4" />
            {t("menu.security")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={logout}
            className="text-destructive"
            data-testid="button-logout"
          >
            <LogOut className="mr-2 h-4 w-4" />
            {t("menu.logout")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      
      <LanguageToggle />
      <ThemeToggle />

      <ProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        user={user}
      />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
      <SecurityDialog
        open={securityOpen}
        onOpenChange={setSecurityOpen}
        isAnonymous={user.isAnonymous}
      />
    </div>
  );
}
