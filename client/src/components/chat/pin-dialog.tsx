import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
  const [pin, setPin] = useState(["", "", "", ""]);
  const [confirmPin, setConfirmPin] = useState(["", "", "", ""]);
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState("");

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setPin(["", "", "", ""]);
      setConfirmPin(["", "", "", ""]);
      setShowPin(false);
      setError("");
    }
  }, [open]);

  const handleSubmit = async () => {
    const pinString = pin.join("");
    const confirmPinString = confirmPin.join("");

    if (pinString.length !== 4 || !/^\d{4}$/.test(pinString)) {
      setError(t("chat.pinMustBe4Digits") || "PIN must be 4 digits");
      return;
    }

    if (mode === "set" && pinString !== confirmPinString) {
      setError(t("chat.pinsDontMatch") || "PINs don't match");
      return;
    }

    setError("");
    const success = await onSubmit(pinString);
    if (success) {
      setPin(["", "", "", ""]);
      setConfirmPin(["", "", "", ""]);
      onOpenChange(false);
    } else {
      setError(t("chat.invalidPin") || "Invalid PIN");
    }
  };

  const handlePinInput = (index: number, value: string, isConfirm: boolean = false) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const targetPin = isConfirm ? confirmPin : pin;
    const setTargetPin = isConfirm ? setConfirmPin : setPin;
    
    const newPin = [...targetPin];
    newPin[index] = digit;
    setTargetPin(newPin);
    setError("");

    // Auto-focus next input
    if (digit && index < 3) {
      const nextInput = document.querySelector(
        `[data-testid="${isConfirm ? 'input-confirm-pin' : 'input-pin'}-${index + 1}"]`
      ) as HTMLInputElement;
      nextInput?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent, isConfirm: boolean = false) => {
    const targetPin = isConfirm ? confirmPin : pin;
    
    if (e.key === "Backspace" && !targetPin[index] && index > 0) {
      const prevInput = document.querySelector(
        `[data-testid="${isConfirm ? 'input-confirm-pin' : 'input-pin'}-${index - 1}"]`
      ) as HTMLInputElement;
      prevInput?.focus();
    }
    
    if (e.key === "Enter") {
      handleSubmit();
    }
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

  const pinInputs = (isConfirm: boolean = false) => {
    const targetPin = isConfirm ? confirmPin : pin;
    const prefix = isConfirm ? "input-confirm-pin" : "input-pin";
    
    return (
      <div className="flex items-center justify-center gap-2">
        {[0, 1, 2, 3].map((index) => (
          <input
            key={index}
            type={showPin ? "text" : "password"}
            inputMode="numeric"
            maxLength={1}
            value={targetPin[index]}
            onChange={(e) => handlePinInput(index, e.target.value, isConfirm)}
            onKeyDown={(e) => handleKeyDown(index, e, isConfirm)}
            className="w-11 aspect-square text-center text-xl font-mono rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            data-testid={`${prefix}-${index}`}
            autoFocus={index === 0 && !isConfirm}
          />
        ))}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setShowPin(!showPin)}
          data-testid="button-toggle-pin-visibility"
        >
          {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>
    );
  };

  const isPinComplete = pin.every(d => d !== "");
  const isConfirmPinComplete = confirmPin.every(d => d !== "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[320px] sm:max-w-[380px]">
        <DialogHeader className="text-center">
          <DialogTitle className="flex items-center justify-center gap-2">
            <Lock className="h-5 w-5" />
            {getTitle()}
          </DialogTitle>
          <DialogDescription className="text-center">{getDescription()}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {pinInputs(false)}

          {mode === "set" && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground text-center">
                {t("chat.confirmPin") || "Confirm PIN"}
              </p>
              {pinInputs(true)}
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          <Button
            onClick={handleSubmit}
            disabled={isLoading || !isPinComplete || (mode === "set" && !isConfirmPinComplete)}
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
