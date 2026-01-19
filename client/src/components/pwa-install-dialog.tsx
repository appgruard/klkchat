import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Download, Smartphone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import logoPath from "@/assets/logo.png";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const STORAGE_KEY = "pwa-install-dismissed";
const DISMISS_DAYS = 7;

function shouldShowDialog(): boolean {
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches 
    || (window.navigator as any).standalone === true;
  
  if (isStandalone) {
    return false;
  }

  const dismissed = localStorage.getItem(STORAGE_KEY);
  if (dismissed) {
    const dismissedDate = new Date(dismissed);
    const daysSinceDismissed = (Date.now() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceDismissed < DISMISS_DAYS) {
      return false;
    }
  }

  return true;
}

export function PWAInstallDialog() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const previousUserId = useRef<string | null>(null);
  const sessionShownRef = useRef(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);
      (window as any).deferredPrompt = promptEvent;
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    if ((window as any).deferredPrompt) {
      setDeferredPrompt((window as any).deferredPrompt);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
    if (!user) {
      previousUserId.current = null;
      sessionShownRef.current = false;
      return;
    }

    const justLoggedIn = previousUserId.current === null && user.id;
    previousUserId.current = user.id;

    if (justLoggedIn && deferredPrompt && !sessionShownRef.current && shouldShowDialog()) {
      sessionShownRef.current = true;
      setTimeout(() => {
        setOpen(true);
      }, 1500);
    }
  }, [user, deferredPrompt]);

  useEffect(() => {
    if (user && deferredPrompt && !sessionShownRef.current && shouldShowDialog()) {
      if (previousUserId.current === user.id) {
        sessionShownRef.current = true;
        setTimeout(() => {
          setOpen(true);
        }, 1500);
      }
    }
  }, [deferredPrompt, user]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setDeferredPrompt(null);
      (window as any).deferredPrompt = null;
    }

    setOpen(false);
  };

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    setOpen(false);
  };

  if (!deferredPrompt) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center overflow-hidden border border-border">
              <img
                src={logoPath}
                alt="App Logo"
                className="w-16 h-16 object-contain"
              />
            </div>
          </div>
          <DialogTitle className="text-xl text-center">
            {t("pwa.installTitle", "Instalar aplicación")}
          </DialogTitle>
          <DialogDescription className="text-center">
            {t("pwa.installDescription", "Instala la app en tu dispositivo para una mejor experiencia: acceso rápido, notificaciones y funcionamiento sin conexión.")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 mt-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <Smartphone className="h-5 w-5 text-primary" />
            <span className="text-sm">{t("pwa.benefit1", "Acceso directo desde tu pantalla de inicio")}</span>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <Download className="h-5 w-5 text-primary" />
            <span className="text-sm">{t("pwa.benefit2", "Funciona sin conexión a internet")}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 mt-4">
          <Button
            onClick={handleInstall}
            className="w-full gap-2"
            data-testid="button-install-pwa"
          >
            <Download className="h-4 w-4" />
            {t("pwa.installButton", "Instalar ahora")}
          </Button>
          <Button
            variant="ghost"
            onClick={handleDismiss}
            className="w-full"
            data-testid="button-dismiss-pwa"
          >
            {t("pwa.later", "Quizás más tarde")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
