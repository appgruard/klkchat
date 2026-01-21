import { useLocation } from "wouter";
import { Home, Radio, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth-context";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface BottomNavProps {
  onProfileClick: () => void;
}

export function BottomNav({ onProfileClick }: BottomNavProps) {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { t } = useTranslation();

  const navItems = [
    {
      id: "home",
      icon: Home,
      label: t("nav.home"),
      path: "/",
    },
    {
      id: "community",
      icon: Radio,
      label: t("nav.community"),
      path: "/community",
    },
  ];

  const isActive = (path: string) => {
    if (path === "/") return location === "/";
    return location.startsWith(path);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t z-50 safe-area-pb">
      <div className="flex items-center justify-around h-14 max-w-lg mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          
          return (
            <button
              key={item.id}
              onClick={() => setLocation(item.path)}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full transition-colors",
                active ? "text-primary" : "text-muted-foreground"
              )}
              data-testid={`nav-${item.id}`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs mt-0.5">{item.label}</span>
            </button>
          );
        })}

        <button
          onClick={onProfileClick}
          className="flex flex-col items-center justify-center flex-1 h-full text-muted-foreground"
          data-testid="nav-profile"
        >
          <Avatar className="h-6 w-6">
            <AvatarImage src={user?.avatarUrl || undefined} />
            <AvatarFallback className="text-xs">
              {user?.displayName?.[0] || user?.username?.[0] || <User className="h-3 w-3" />}
            </AvatarFallback>
          </Avatar>
          <span className="text-xs mt-0.5">{t("nav.profile")}</span>
        </button>
      </div>
    </nav>
  );
}
