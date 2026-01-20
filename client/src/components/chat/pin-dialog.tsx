import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Lock, Eye, EyeOff } from "lucide-react";

interface PinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "set" | "verify" | "remove";
  onSubmit: (pin: string) => Promise<boolean>;
  isLoading?: boolean;
}

export function PinDialog({ open, onOpenChange, mode, onSubmit, isLoading }: PinDialogProps) {
  const { t } = useTranslation();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      setError(t("chat.pinMustBe4Digits") || "PIN must be 4 digits");
      return;
    }

    if (mode === "set" && pin !== confirmPin) {
      setError(t("chat.pinsDontMatch") || "PINs don't match");
      return;
    }

    setError("");
    const success = await onSubmit(pin);
    if (success) {
      setPin("");
      setConfirmPin("");
      onOpenChange(false);
    } else {
      setError(t("chat.invalidPin") || "Invalid PIN");
    }
  };

  const handlePinChange = (value: string, setter: (v: string) => void) => {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    setter(digits);
    setError("");
  };

  const getTitle = () => {
    switch (mode) {
      case "set":
        return t("chat.hideChat") || "Hide Chat";
      case "verify":
        return t("chat.enterPin") || "Enter PIN";
      case "remove":
        return t("chat.unhideChat") || "Unhide Chat";
    }
  };

  const getDescription = () => {
    switch (mode) {
      case "set":
        return t("chat.hideChatDescription") || "Set a 4-digit PIN to hide this chat";
      case "verify":
        return t("chat.verifyPinDescription") || "Enter the PIN to view this chat";
      case "remove":
        return t("chat.unhideChatDescription") || "Enter the PIN to unhide this chat";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[350px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            {getTitle()}
          </DialogTitle>
          <DialogDescription>{getDescription()}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="relative">
            <Input
              type={showPin ? "text" : "password"}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              placeholder="____"
              value={pin}
              onChange={(e) => handlePinChange(e.target.value, setPin)}
              className="text-center text-2xl tracking-[0.5em] font-mono"
              data-testid="input-pin"
              autoFocus
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2"
              onClick={() => setShowPin(!showPin)}
            >
              {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>

          {mode === "set" && (
            <Input
              type={showPin ? "text" : "password"}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              placeholder={t("chat.confirmPin") || "Confirm PIN"}
              value={confirmPin}
              onChange={(e) => handlePinChange(e.target.value, setConfirmPin)}
              className="text-center text-2xl tracking-[0.5em] font-mono"
              data-testid="input-confirm-pin"
            />
          )}

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          <Button
            onClick={handleSubmit}
            disabled={isLoading || pin.length !== 4 || (mode === "set" && confirmPin.length !== 4)}
            className="w-full"
            data-testid="button-submit-pin"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === "set" ? (
              t("chat.hideChat") || "Hide Chat"
            ) : mode === "remove" ? (
              t("chat.unhideChat") || "Unhide Chat"
            ) : (
              t("chat.unlock") || "Unlock"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
