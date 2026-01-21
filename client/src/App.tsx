import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { useEffect, useState } from "react";
import AuthPage from "@/pages/auth";
import ChatPage from "@/pages/chat";
import CommunityPage from "@/pages/community";
import AdminZonesPage from "@/pages/admin-zones";
import NotFound from "@/pages/not-found";
import { PWAInstallDialog } from "@/components/pwa-install-dialog";
import { BottomNav } from "@/components/bottom-nav";
import { UserMenu } from "@/components/chat/user-menu";
import { ConvertAccountDialog } from "@/components/chat/convert-account-dialog";

function PushManager() {
  const { user } = useAuth();

  useEffect(() => {
    if (user && "serviceWorker" in navigator && "PushManager" in window) {
      const handleRegistration = async () => {
        try {
          // Explicitly request notification permission
          const permission = await Notification.requestPermission();
          if (permission !== 'granted') {
            console.log('Notification permission denied');
            return;
          }

          const registration = await navigator.serviceWorker.ready;
          const subscription = await registration.pushManager.getSubscription();
          
          if (!subscription) {
            const res = await fetch("/api/push/key");
            const { publicKey } = await res.json();
            if (!publicKey) return;

            const newSubscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: publicKey,
            });

            await fetch("/api/push/subscribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(newSubscription),
            });
            console.log('Successfully subscribed to push notifications');
          }
        } catch (err) {
          console.error("Failed to subscribe to push notifications", err);
        }
      };

      handleRegistration();
    }
  }, [user]);

  return null;
}

function AppRouter() {
  const { user, isLoading } = useAuth();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <div className="flex-1 overflow-hidden">
        <Switch>
          <Route path="/" component={ChatPage} />
          <Route path="/conversations/:id" component={ChatPage} />
          <Route path="/community" component={CommunityPage} />
          <Route path="/admin/zones" component={AdminZonesPage} />
          <Route component={NotFound} />
        </Switch>
      </div>
      <BottomNav onProfileClick={() => setShowProfileMenu(true)} />
      
      {showProfileMenu && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" onClick={() => setShowProfileMenu(false)}>
          <div className="fixed bottom-16 right-4 w-64" onClick={e => e.stopPropagation()}>
            <UserMenu
              user={user}
              onConvertAnonymous={user.isAnonymous ? () => setShowConvertDialog(true) : undefined}
            />
          </div>
        </div>
      )}
      
      <ConvertAccountDialog
        open={showConvertDialog}
        onOpenChange={setShowConvertDialog}
      />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AuthProvider>
            <PushManager />
            <PWAInstallDialog />
            <Toaster />
            <AppRouter />
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
